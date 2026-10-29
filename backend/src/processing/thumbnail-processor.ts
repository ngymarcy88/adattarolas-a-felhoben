import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { detectImageMime } from '../files/image-signature';
import { PROCESSOR_ERROR_CODES, ProcessorError, type ProcessorErrorCode } from './processor-error';
import type { ArtifactProcessorResult, Processor } from './processor.interface';
import profile from './thumbnail-policy.json';
import { assertWebpOutput } from './webp-output';

export interface ThumbnailResult extends ArtifactProcessorResult {
  readonly mimeType: 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly selectedFrame: 0;
}
type SpawnDecoder = (file: string, args: string[], options: SpawnOptions) => ChildProcess;
type Dependencies = { spawn?: SpawnDecoder; now?: () => number };
const versions = Object.freeze(Object.fromEntries(Object.entries(sharp.versions).sort(([a], [b]) => a.localeCompare(b))));
const policy = Object.freeze({ ...profile, supportedMimeTypes: Object.freeze([...profile.supportedMimeTypes]) });
const fingerprint = createHash('sha256').update(JSON.stringify({ policy, versions, platform: process.platform, arch: process.arch })).digest('hex');
const errors = new Set<string>(PROCESSOR_ERROR_CODES);

/** Explicit, stateless binary transformation. Not registered in Nest and never started by confirm. */
export class ThumbnailProcessor implements Processor<ThumbnailResult> {
  readonly key = policy.key;
  readonly version = policy.version;
  readonly outputKind = policy.outputKind;
  readonly supportedMimeTypes = policy.supportedMimeTypes;
  readonly implementationFingerprint = fingerprint;
  readonly limits = policy;
  readonly libraryVersions = versions;
  private active = false;
  private readonly start: SpawnDecoder;
  private readonly now: () => number;
  constructor(dependencies: Dependencies = {}) {
    this.start = dependencies.spawn ?? spawn; this.now = dependencies.now ?? (() => performance.now());
    for (const name of ['key', 'version', 'outputKind', 'supportedMimeTypes', 'implementationFingerprint', 'limits', 'libraryVersions'] as const) {
      Object.defineProperty(this, name, { value: this[name], enumerable: true, writable: false, configurable: false });
    }
  }

  async process(inputBytes: Uint8Array, detectedMimeType: string, signal?: AbortSignal): Promise<ThumbnailResult> {
    if (signal?.aborted) throw new ProcessorError('PROCESSOR_ABORTED');
    if (!(inputBytes instanceof Uint8Array) || !inputBytes.byteLength) throw new ProcessorError('PROCESSOR_INPUT_INVALID');
    if (inputBytes.byteLength > policy.maxInputBytes) throw new ProcessorError('PROCESSOR_INPUT_LIMIT');
    if (!this.supportedMimeTypes.includes(detectedMimeType)) throw new ProcessorError('PROCESSOR_INPUT_UNSUPPORTED');
    if (this.active) throw new ProcessorError('PROCESSOR_RESOURCE_LIMIT');
    // Snapshot before await/stdin buffering so callers cannot change the data being decoded.
    const bytes = Buffer.from(inputBytes);
    const actual = detectImageMime(bytes.subarray(0, 16));
    if (!actual) throw new ProcessorError('PROCESSOR_INPUT_UNSUPPORTED');
    if (actual !== detectedMimeType) throw new ProcessorError('PROCESSOR_INPUT_INVALID');
    this.active = true;
    try { return await this.decode(bytes, detectedMimeType, signal); }
    finally { this.active = false; }
  }

  private decode(bytes: Buffer, mimeType: string, signal?: AbortSignal): Promise<ThumbnailResult> {
    return new Promise((resolve, reject) => {
      const deadline = this.now() + policy.wallTimeoutMs;
      let child: ChildProcess;
      try {
        child = this.start(process.execPath, ['--max-old-space-size=128', join(__dirname, 'thumbnail-child.cjs')], {
          stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
          // Deliberately do not inherit application secrets, NODE_OPTIONS or user loader options.
          env: { PATH: dirname(process.execPath), UV_THREADPOOL_SIZE: '1', VIPS_CONCURRENCY: '1' },
        });
      } catch { reject(new ProcessorError('PROCESSOR_INTERNAL_ERROR')); return; }
      let failure: ProcessorError | undefined;
      let settled = false;
      const buffer = Buffer.alloc(policy.maxHeaderBytes + 1 + policy.maxOutputBytes);
      let length = 0;
      const closeInput = () => { child.stdin?.destroy(); };
      const fail = (code: ProcessorErrorCode) => {
        failure ??= new ProcessorError(code);
        closeInput(); child.stdout?.destroy();
        // Rejection is delayed until close: the killed decoder must have exited before reuse.
        try { child.kill('SIGKILL'); } catch { /* close/error owns the final result */ }
      };
      const expired = () => {
        if (this.now() >= deadline) { fail('PROCESSOR_TIMEOUT'); return true; }
        return false;
      };
      const abort = () => fail('PROCESSOR_ABORTED');
      const timer = setTimeout(() => fail('PROCESSOR_TIMEOUT'), policy.wallTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); closeInput();
        child.stdout?.destroy();
      };
      const finish = (code: number | null, killedBy: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        if (!failure && (signal?.aborted || this.now() >= deadline)) failure = new ProcessorError(signal?.aborted ? 'PROCESSOR_ABORTED' : 'PROCESSOR_TIMEOUT');
        cleanup();
        if (failure) { reject(failure); return; }
        if (killedBy) { reject(new ProcessorError('PROCESSOR_RESOURCE_LIMIT')); return; }
        try { resolve(this.parseOutput(buffer.subarray(0, length), code)); }
        catch (error) { reject(error instanceof ProcessorError ? error : new ProcessorError('PROCESSOR_INTERNAL_ERROR')); }
      };
      child.once('error', () => { failure ??= new ProcessorError('PROCESSOR_INTERNAL_ERROR'); });
      child.once('close', finish);
      child.stdout?.on('data', (chunk: unknown) => {
        if (failure || expired()) return;
        if (!(chunk instanceof Uint8Array) || chunk.byteLength > buffer.length - length) { fail('PROCESSOR_OUTPUT_LIMIT'); return; }
        buffer.set(chunk, length); length += chunk.byteLength;
        const newline = buffer.subarray(0, length).indexOf(10);
        if ((newline < 0 && length > policy.maxHeaderBytes) || newline > policy.maxHeaderBytes) fail('PROCESSOR_INTERNAL_ERROR');
      });
      child.stdout?.once('error', () => { if (!failure) fail('PROCESSOR_INTERNAL_ERROR'); });
      // EPIPE can simply mean the decoder returned a controlled input error early.
      child.stdin?.on('error', () => {});
      signal?.addEventListener('abort', abort, { once: true });
      if (!child.stdin || !child.stdout) { fail('PROCESSOR_INTERNAL_ERROR'); return; }
      if (signal?.aborted) { abort(); return; }
      if (expired()) return;
      try {
        child.stdin.write(JSON.stringify({ mimeType, sizeBytes: bytes.length }) + '\n');
        child.stdin.end(bytes);
      } catch { fail('PROCESSOR_INTERNAL_ERROR'); }
    });
  }

  private parseOutput(output: Buffer, exitCode: number | null): ThumbnailResult {
    const newline = output.indexOf(10);
    if (newline < 0 || newline > policy.maxHeaderBytes) throw new ProcessorError('PROCESSOR_INTERNAL_ERROR');
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(output.subarray(0, newline).toString('utf8')); }
    catch { throw new ProcessorError('PROCESSOR_INTERNAL_ERROR'); }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new ProcessorError('PROCESSOR_INTERNAL_ERROR');
    if (meta.ok === false) {
      if (exitCode !== 1 || Object.keys(meta).length !== 2 || !errors.has(String(meta.code)) || output.length !== newline + 1) throw new ProcessorError('PROCESSOR_INTERNAL_ERROR');
      throw new ProcessorError(meta.code as ProcessorErrorCode);
    }
    const data = output.subarray(newline + 1);
    const fields = ['ok', 'mimeType', 'sizeBytes', 'width', 'height', 'sha256', 'selectedFrame', 'implementationFingerprint'];
    if (exitCode !== 0 || Object.keys(meta).length !== fields.length || fields.some(field => !Object.hasOwn(meta, field)) || meta.ok !== true ||
        meta.mimeType !== 'image/webp' || meta.implementationFingerprint !== this.implementationFingerprint ||
        meta.sizeBytes !== data.length || data.length < 12 || data.length > policy.maxOutputBytes ||
        !Number.isSafeInteger(meta.width) || Number(meta.width) < 1 || Number(meta.width) > policy.width ||
        !Number.isSafeInteger(meta.height) || Number(meta.height) < 1 || Number(meta.height) > policy.height || meta.selectedFrame !== 0 ||
        data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP' || data.readUInt32LE(4) + 8 !== data.length ||
        meta.sha256 !== createHash('sha256').update(data).digest('hex')) throw new ProcessorError('PROCESSOR_INTERNAL_ERROR');
    assertWebpOutput(data, Number(meta.width), Number(meta.height));
    return { kind: 'artifact', bytes: Buffer.from(data), mimeType: 'image/webp', sizeBytes: data.length,
      width: Number(meta.width), height: Number(meta.height), sha256: String(meta.sha256), selectedFrame: 0,
      implementationFingerprint: this.implementationFingerprint };
  }
}
