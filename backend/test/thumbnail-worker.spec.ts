import 'reflect-metadata';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ObjectStorage } from '../src/storage/storage.interface';
import { StorageError } from '../src/storage/storage-error';
import { ProcessingStateError } from '../src/processing/processing-state.types';
import { ProcessorError } from '../src/processing/processor-error';
import type { Processor } from '../src/processing/processor.interface';
import type { ThumbnailResult } from '../src/processing/thumbnail-processor';
import { ProcessingPublicationService } from '../src/processing/processing-publication.service';
import { ThumbnailWorker } from '../src/processing/thumbnail.worker';
import { processingFixture, processingOwner as owner, processingFile as fileId, processingWorker as leaseOwner } from './helpers/processing-fixture';

let input: Buffer; let output: ThumbnailResult;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
beforeAll(async () => {
  input = await sharp({ create: { width: 2, height: 3, channels: 3, background: { r: 50, g: 120, b: 180 } } }).png().toBuffer();
  const bytes = await sharp(input).webp().toBuffer();
  output = { kind: 'artifact', bytes, mimeType: 'image/webp', sizeBytes: bytes.length, width: 2, height: 3,
    sha256: hash(bytes), selectedFrame: 0, implementationFingerprint: 'a'.repeat(64) };
});
beforeEach(() => { jest.useFakeTimers(); jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
async function fixture() {
  const f = processingFixture(); f.file.sizeBytes = BigInt(input.length); f.user.usedStorageBytes = BigInt(input.length);
  const job = await f.service.createJob(owner, fileId);
  const objects = new Map<string, Buffer>([[f.file.storageKey, input]]);
  const storage = {
    head: jest.fn(async (key: string) => objects.has(key) ? { sizeBytes: objects.get(key)!.length,
      contentType: key.startsWith('derived/') ? 'image/webp' : 'image/png', etag: key.startsWith('derived/') ? '"output"' : '"source"' } : null),
    readOriginal: jest.fn(async (key: string) => Buffer.from(objects.get(key)!)),
    readDerived: jest.fn(async (key: string) => Buffer.from(objects.get(key)!)),
    writeDerived: jest.fn(async ({ key, bytes }: { key: string; bytes: Uint8Array; signal?: AbortSignal }) => {
      if (objects.has(key)) throw new StorageError('OBJECT_EXISTS');
      objects.set(key, Buffer.from(bytes)); return { sizeBytes: bytes.length, contentType: 'image/webp' as const, sha256: hash(bytes), etag: '"output"' };
    }), deleteObject: jest.fn(),
  };
  const processor = { key: 'thumbnail', version: '1.0.0', outputKind: 'thumbnail', supportedMimeTypes: ['image/png'],
    implementationFingerprint: 'a'.repeat(64), limits: { maxInputBytes: 33554432, maxInputPixels: 40000000,
      maxInputDimension: 20000, maxInputChannels: 4, maxOutputBytes: 524288, wallTimeoutMs: 15000 },
    process: jest.fn().mockImplementation(async () => ({ ...output, bytes: Buffer.from(output.bytes) })),
  } satisfies Processor<ThumbnailResult>;
  const publisher = new ProcessingPublicationService(f.service, storage as unknown as ObjectStorage);
  const makeWorker = () => new ThumbnailWorker(f.service, storage as unknown as ObjectStorage, processor, publisher);
  const worker = makeWorker();
  const metadata = { sourceSha256: hash(input), sourceETag: '"source"', outputSha256: output.sha256,
    sizeBytes: output.sizeBytes, width: output.width, height: output.height, implementationFingerprint: output.implementationFingerprint };
  const prepare = async (stored = false, object = true) => {
    const claim = (await f.service.claim(owner, fileId, job.id, leaseOwner))!;
    await f.service.captureSource(claim, hash(input), '"source"'); await f.service.reserve(claim, metadata);
    if (object) objects.set(f.attempts[0]!.candidateKey, Buffer.from(output.bytes));
    if (stored) await f.service.markStored(claim);
    return claim;
  };
  return { f, job, objects, storage, processor, publisher, worker, makeWorker, prepare };
}
const drain = () => jest.advanceTimersByTimeAsync(0);

describe('One-slot thumbnail worker and durable application services', () => {
  it('runs a queued job end-to-end using the ports and never repeats a completed delivery', async () => {
    const x = await fixture(); await x.worker.runOnce(); await x.worker.runOnce();
    expect(x.processor.process).toHaveBeenCalledTimes(1); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1);
    expect(x.f.jobs[0]!.state).toBe('SUCCEEDED'); expect(x.f.results).toHaveLength(1); expect(x.f.audits).toHaveLength(1);
    expect(x.f.user).toMatchObject({ usedStorageBytes: BigInt(input.length + output.sizeBytes), reservedStorageBytes: 0n });
    expect(x.storage.readOriginal).toHaveBeenCalledWith(x.f.file.storageKey, expect.any(Object), input.length, expect.any(AbortSignal));
    expect(x.storage.deleteObject).not.toHaveBeenCalled();
  });
  it('does not overlap polls or exceed one physical decoder slot', async () => {
    const x = await fixture(); let finish!: (result: ThumbnailResult) => void;
    x.processor.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = x.worker.runOnce(); await drain(); const second = x.worker.runOnce(); await drain();
    expect(x.processor.process).toHaveBeenCalledTimes(1); expect(x.f.jobs).toHaveLength(1);
    finish(output); await Promise.all([first, second]); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1);
  });
  it('two worker processes racing for a job produce one claim/output/charge', async () => {
    const x = await fixture(); await Promise.all([x.worker.runOnce(), x.makeWorker().runOnce()]);
    expect(x.f.jobs[0]!.totalAttemptCount).toBe(1); expect(x.processor.process).toHaveBeenCalledTimes(1);
    expect(x.f.results).toHaveLength(1); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1);
  });
  it('rejects an old worker result after lease takeover even if its decode eventually succeeds', async () => {
    const x = await fixture(); let finish!: (result: ThumbnailResult) => void;
    x.processor.process.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = x.worker.runOnce(); await drain(); x.f.advance(90001);
    await x.makeWorker().runOnce(); finish(output); await old;
    expect(x.processor.process).toHaveBeenCalledTimes(2); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1);
    expect(x.f.results).toHaveLength(1); expect(x.f.audits).toHaveLength(1); expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it('heartbeats a live claim and aborts physical processing if renewal fails', async () => {
    const x = await fixture();
    x.processor.process.mockImplementationOnce((_bytes: unknown, _mime: unknown, signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new ProcessorError('PROCESSOR_ABORTED')), { once: true });
    }));
    const running = x.worker.runOnce(); await drain(); const oldLease = +x.f.jobs[0]!.leaseUntil;
    x.f.advance(15000); await jest.advanceTimersByTimeAsync(15000); expect(+x.f.jobs[0]!.leaseUntil).toBeGreaterThan(oldLease);
    jest.spyOn(x.f.service, 'heartbeat').mockRejectedValueOnce(new ProcessingStateError('PROCESSING_LEASE_LOST'));
    x.f.advance(15000); await jest.advanceTimersByTimeAsync(15000); await running;
    expect(x.storage.writeDerived).not.toHaveBeenCalled(); expect(x.f.jobs[0]!.state).toBe('RUNNING');
  });
  it('bounds an uncompleted attempt to 60s and records retry/backoff without freeing unknown bytes', async () => {
    const x = await fixture(); x.processor.process.mockImplementationOnce((_bytes: unknown, _mime: unknown, signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new ProcessorError('PROCESSOR_ABORTED')), { once: true });
    }));
    const running = x.worker.runOnce(); await drain(); x.f.advance(60000); await jest.advanceTimersByTimeAsync(60000); await running;
    expect(x.f.jobs[0]).toMatchObject({ state: 'RETRY_WAIT', lastErrorCode: 'PROCESSOR_TIMEOUT' });
    expect(x.storage.writeDerived).not.toHaveBeenCalled(); expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it('stops new claims, aborts and DRAINS physical PUT before closing; the next worker adopts the possible output', async () => {
    const x = await fixture(); let settle!: () => void; let signal!: AbortSignal;
    x.storage.writeDerived.mockImplementationOnce(args => {
      signal = args.signal!; x.objects.set(args.key, Buffer.from(args.bytes));
      return new Promise((_, reject) => { settle = () => reject(new StorageError('UNAVAILABLE')); });
    });
    const active = x.worker.runOnce(); await drain(); let stopped = false;
    const stopping = x.worker.stop().then(() => { stopped = true; }); await drain();
    expect(signal.aborted).toBe(true); expect(stopped).toBe(false);
    await x.worker.runOnce(); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1);
    settle(); await Promise.all([active, stopping]); expect(stopped).toBe(true);
    expect(x.f.attempts[0]!.phase).toBe('WRITE_PENDING'); expect(x.f.user.reservedStorageBytes).toBe(BigInt(output.sizeBytes));
    x.f.advance(90001); await x.makeWorker().runOnce();
    expect(x.f.results).toHaveLength(1); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1); expect(x.processor.process).toHaveBeenCalledTimes(1);
    expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it.each([false, true])('restart adopts a valid reserved/stored=%s output without decoding, PUT or another reservation', async stored => {
    const x = await fixture(); const old = await x.prepare(stored); x.f.advance(90001);
    await x.makeWorker().runOnce();
    expect(x.f.results).toHaveLength(1); expect(x.storage.readDerived).toHaveBeenCalledTimes(1);
    expect(x.processor.process).not.toHaveBeenCalled(); expect(x.storage.writeDerived).not.toHaveBeenCalled();
    expect(x.f.results[0]!.publicationFence).toBeGreaterThan(old.fence); expect(x.f.jobs[0]!.totalAttemptCount).toBe(1);
    expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it('restart before any reservation closes R0 preparing and safely regenerates', async () => {
    const x = await fixture(); await x.f.service.claim(owner, fileId, x.job.id, leaseOwner); x.f.advance(90001);
    await x.makeWorker().runOnce(); expect(x.f.attempts[0]!.phase).toBe('RELEASED');
    expect(x.f.attempts).toHaveLength(2); expect(x.f.results).toHaveLength(1); expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it('restart after reservation but before PUT retains old R and regenerates only with a new key/reservation', async () => {
    const x = await fixture(); await x.prepare(false, false); x.f.advance(90001); await x.makeWorker().runOnce();
    expect(x.f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED'); expect(x.f.jobs[0]!.state).toBe('RETRY_WAIT');
    expect(x.f.user.reservedStorageBytes).toBe(BigInt(output.sizeBytes));
    x.f.advance(5000); await x.makeWorker().runOnce(); expect(x.f.results).toHaveLength(1);
    expect(x.f.user.usedStorageBytes).toBe(BigInt(input.length + output.sizeBytes));
    expect(x.f.user.reservedStorageBytes).toBe(BigInt(output.sizeBytes)); expect(x.storage.deleteObject).not.toHaveBeenCalled();
  });
  it.each(['hash', 'header', 'source'] as const)('does not publish a candidate with altered %s', async kind => {
    const x = await fixture(); await x.prepare(); const attempt = x.f.attempts[0]!;
    if (kind === 'source') { const altered = Buffer.from(input); altered[altered.length - 1] ^= 1; x.objects.set(x.f.file.storageKey, altered); }
    else {
      const altered = kind === 'header' ? Buffer.alloc(output.sizeBytes) : Buffer.from(output.bytes);
      if (kind === 'hash') altered[altered.length - 1] ^= 1;
      x.objects.set(attempt.candidateKey, altered);
      if (kind === 'header') attempt.outputSha256 = hash(altered); // isolate header rejection from digest rejection
    }
    x.f.advance(90001); await x.makeWorker().runOnce(); expect(x.f.results).toHaveLength(0);
    expect(x.f.user.reservedStorageBytes).toBe(BigInt(output.sizeBytes)); expect(x.storage.deleteObject).not.toHaveBeenCalled();
    expect(x.f.jobs[0]!.state).toBe(kind === 'source' ? 'FAILED' : 'RETRY_WAIT');
  });
  it('retries transient recovery I/O independently with the same candidate and no generation', async () => {
    const x = await fixture(); await x.prepare(); x.f.advance(90001);
    x.storage.readDerived.mockRejectedValueOnce(new StorageError('UNAVAILABLE')); await x.makeWorker().runOnce();
    expect(x.f.attempts[0]!.phase).toBe('WRITE_PENDING'); expect(x.f.jobs[0]!.state).toBe('RETRY_WAIT');
    x.f.advance(5000); await x.makeWorker().runOnce(); expect(x.f.results).toHaveLength(1);
    expect(x.f.jobs[0]!.recoveryProbeCount).toBe(2); expect(x.f.jobs[0]!.totalAttemptCount).toBe(1);
    expect(x.storage.writeDerived).not.toHaveBeenCalled(); expect(x.processor.process).not.toHaveBeenCalled();
  });
  it('a failed finalization transaction leaves STORED for fenced restart recovery without another PUT', async () => {
    const x = await fixture(); x.f.onWrite = name => { if (name === 'auditEvent.create') throw new Error('synthetic DB error'); };
    await x.worker.runOnce(); expect(x.f.attempts[0]!.phase).toBe('STORED'); expect(x.f.results).toHaveLength(0);
    x.f.onWrite = undefined; x.f.advance(90001); await x.makeWorker().runOnce();
    expect(x.f.results).toHaveLength(1); expect(x.storage.writeDerived).toHaveBeenCalledTimes(1); expect(x.f.audits).toHaveLength(1);
  });
  it('bounds repeated resource failures and never restarts a terminal job automatically', async () => {
    const x = await fixture(); x.processor.process.mockRejectedValue(new ProcessorError('PROCESSOR_RESOURCE_LIMIT'));
    await x.worker.runOnce(); x.f.advance(5000); await x.worker.runOnce(); x.f.advance(30000); await x.worker.runOnce(); await x.worker.runOnce();
    expect(x.f.jobs[0]).toMatchObject({ state: 'FAILED', totalAttemptCount: 3 }); expect(x.processor.process).toHaveBeenCalledTimes(3);
    expect(x.f.file.status).toBe('ACTIVE'); expect(x.f.user.reservedStorageBytes).toBe(0n);
  });
  it('a decoder input failure does not invalidate ACTIVE original', async () => {
    const x = await fixture(); x.processor.process.mockRejectedValue(new ProcessorError('PROCESSOR_INPUT_INVALID'));
    await x.worker.runOnce(); expect(x.f.jobs[0]).toMatchObject({ state: 'FAILED', retryable: false }); expect(x.f.file.status).toBe('ACTIVE');
  });
  it('reconciles a deleted queue head instead of spinning forever on it', async () => {
    const x = await fixture(); x.f.file.status = 'SOFT_DELETED'; x.f.file.deletedAt = new Date(x.f.now);
    await x.worker.runOnce(); expect(x.f.jobs[0]!.state).toBe('CANCELLED'); expect(x.processor.process).not.toHaveBeenCalled();
  });
  it('polls every 2s without leaking a timer after shutdown', async () => {
    const x = await fixture(); const list = jest.spyOn(x.f.service, 'listReady').mockResolvedValue([]);
    x.worker.onModuleInit(); await drain(); expect(list).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000); expect(list).toHaveBeenCalledTimes(2);
    await x.worker.stop(); await jest.advanceTimersByTimeAsync(4000); expect(list).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
