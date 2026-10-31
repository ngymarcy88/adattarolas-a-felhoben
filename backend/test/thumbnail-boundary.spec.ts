import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import sharp from 'sharp';
import { ThumbnailProcessor } from '../src/processing/thumbnail-processor';

let input: Buffer; let webp: Buffer;
beforeAll(async () => {
  input = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#f04020' } }).png().toBuffer();
  webp = await sharp(input).webp().toBuffer();
});
function fixture(closeOnKill = true) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: jest.fn() });
  child.kill.mockImplementation(() => { if (closeOnKill) queueMicrotask(() => child.emit('close', null, 'SIGKILL')); return true; });
  const start = jest.fn((_file: string, _args: string[], _options: SpawnOptions) => child as unknown as ChildProcess);
  const processor = new ThumbnailProcessor({ spawn: start });
  return { child, start, processor };
}
function frame(processor: ThumbnailProcessor, changes: Record<string, unknown> = {}, bytes = webp) {
  const meta = { ok: true, mimeType: 'image/webp', sizeBytes: bytes.length, width: 3, height: 2,
    sha256: createHash('sha256').update(bytes).digest('hex'), selectedFrame: 0, implementationFingerprint: processor.implementationFingerprint, ...changes };
  return Buffer.concat([Buffer.from(JSON.stringify(meta) + '\n'), bytes]);
}
function output(f: ReturnType<typeof fixture>, bytes: Buffer, exit = 0) {
  f.child.stdout.end(bytes); f.child.emit('close', exit, null);
}
it('runs only the bundled fixed decoder with a scrubbed environment and fixed heap', async () => {
  const f = fixture(); const pending = f.processor.process(input, 'image/png');
  const [executable, args, options] = f.start.mock.calls[0] as unknown as [string, string[], { env: Record<string, string>; stdio: string[] }];
  expect(executable).toBe(process.execPath); expect(args[0]).toBe('--max-old-space-size=128'); expect(args[1]).toMatch(/thumbnail-child\.cjs$/);
  expect(Object.keys(options.env).sort()).toEqual(['PATH', 'UV_THREADPOOL_SIZE', 'VIPS_CONCURRENCY']);
  expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore']);
  output(f, frame(f.processor)); expect((await pending).bytes).toEqual(webp);
});
it('sanitizes a synchronous spawn failure', async () => {
  const processor = new ThumbnailProcessor({ spawn: () => { throw new Error('private path and credentials'); } });
  await expect(processor.process(input, 'image/png')).rejects.toMatchObject({ code: 'PROCESSOR_INTERNAL_ERROR', message: 'Image processing failed.' });
});
it('waits for decoder close after abort, retaining the single-invocation slot until exit', async () => {
  const f = fixture(false); const caller = new AbortController();
  const pending = f.processor.process(input, 'image/png', caller.signal);
  let settled = false; void pending.then(() => { settled = true; }, () => { settled = true; });
  const failed = expect(pending).rejects.toMatchObject({ code: 'PROCESSOR_ABORTED' }); caller.abort('private reason');
  await Promise.resolve(); expect(f.child.kill).toHaveBeenCalledWith('SIGKILL'); expect(settled).toBe(false);
  await expect(f.processor.process(input, 'image/png')).rejects.toMatchObject({ code: 'PROCESSOR_RESOURCE_LIMIT' });
  f.child.emit('close', null, 'SIGKILL'); await failed;
  expect(f.child.stdin.destroyed).toBe(true); expect(f.child.stdout.destroyed).toBe(true);
});
it('kills a stalled decoder at the full wall-clock deadline', async () => {
  jest.useFakeTimers();
  try {
    const f = fixture(); const pending = f.processor.process(input, 'image/png');
    const failed = expect(pending).rejects.toMatchObject({ code: 'PROCESSOR_TIMEOUT' });
    await jest.advanceTimersByTimeAsync(15000); await failed;
    expect(f.child.kill).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
it('checks a deadline exhausted during spawn before sending image bytes', async () => {
  const f = fixture(); let now = 0;
  const processor = new ThumbnailProcessor({ spawn: (...args) => { now = 15001; return f.start(...args); }, now: () => now });
  const pending = processor.process(input, 'image/png');
  await expect(pending).rejects.toMatchObject({ code: 'PROCESSOR_TIMEOUT' }); expect(f.child.stdin.readableLength).toBe(0);
});
it('sanitizes an error/close startup path and native resource termination', async () => {
  const f = fixture(); const pending = f.processor.process(input, 'image/png');
  const failed = expect(pending).rejects.toMatchObject({ code: 'PROCESSOR_INTERNAL_ERROR' });
  f.child.emit('error', new Error('private executable path')); f.child.emit('close', -2, null); await failed;
  const g = fixture(); const next = g.processor.process(input, 'image/png');
  const limited = expect(next).rejects.toMatchObject({ code: 'PROCESSOR_RESOURCE_LIMIT' });
  g.child.emit('close', null, 'SIGKILL'); await limited;
});
it('cleans up after a synchronous stdin failure', async () => {
  const f = fixture(); jest.spyOn(f.child.stdin, 'write').mockImplementation(() => { throw new Error('private transport detail'); });
  await expect(f.processor.process(input, 'image/png')).rejects.toMatchObject({ code: 'PROCESSOR_INTERNAL_ERROR' });
  expect(f.child.kill).toHaveBeenCalledTimes(1);
});
it('accepts only controlled child failures and hides unknown protocol text', async () => {
  for (const code of ['PROCESSOR_INPUT_INVALID', 'private provider credentials']) {
    const f = fixture(); const pending = f.processor.process(input, 'image/png');
    const failed = expect(pending).rejects.toMatchObject({ code: code.startsWith('PROCESSOR_') ? code : 'PROCESSOR_INTERNAL_ERROR', message: 'Image processing failed.' });
    output(f, Buffer.from(JSON.stringify({ ok: false, code }) + '\n'), 1); await failed;
  }
});
it.each(['hash', 'fingerprint', 'geometry', 'field', 'frame', 'exit', 'empty-riff'])('rejects forged success metadata/container: %s', async kind => {
  const f = fixture(); const pending = f.processor.process(input, 'image/png');
  const failed = expect(pending).rejects.toMatchObject({ code: 'PROCESSOR_INTERNAL_ERROR' });
  const changes = kind === 'hash' ? { sha256: 'a'.repeat(64) } : kind === 'fingerprint' ? { implementationFingerprint: 'a'.repeat(64) }
    : kind === 'geometry' ? { width: 2 } : kind === 'field' ? { extra: 'not-allowed' } : kind === 'frame' ? { selectedFrame: 1 } : {};
  let bytes = webp;
  if (kind === 'empty-riff') { bytes = Buffer.from('524946460400000057454250', 'hex'); Object.assign(changes, { width: 1, height: 1 }); }
  output(f, frame(f.processor, changes, bytes), kind === 'exit' ? 1 : 0); await failed;
});
it.each(['header', 'overflow'])('bounds hostile stdout and kills the decoder: %s', async kind => {
  const f = fixture(); const pending = f.processor.process(input, 'image/png');
  const failed = expect(pending).rejects.toMatchObject({ code: kind === 'header' ? 'PROCESSOR_INTERNAL_ERROR' : 'PROCESSOR_OUTPUT_LIMIT' });
  f.child.stdout.write(Buffer.alloc(kind === 'header' ? 4097 : 4097 + 524289, 65)); await failed;
});
