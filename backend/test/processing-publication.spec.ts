import 'reflect-metadata';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { DerivedObject, ProcessingAttempt } from '../src/generated/prisma/client';
import type { ObjectStorage } from '../src/storage/storage.interface';
import { ProcessingPublicationService } from '../src/processing/processing-publication.service';
import type { ProcessingStateService } from '../src/processing/processing-state.service';
import { ProcessingStateError, type Claim, type Reservation } from '../src/processing/processing-state.types';
import { processingFixture, processingOwner, processingFile, processingWorker } from './helpers/processing-fixture';
import type { ThumbnailResult } from '../src/processing/thumbnail-processor';

const token: Claim = { ownerId: '10000000-0000-4000-8000-000000000001', fileId: '10000000-0000-4000-8000-000000000002',
  jobId: '10000000-0000-4000-8000-000000000003', attemptId: '10000000-0000-4000-8000-000000000004',
  leaseOwner: '10000000-0000-4000-8000-000000000005', fence: 1n, implementationFingerprint: 'a'.repeat(64) };
const source = { sha256: 'b'.repeat(64), etag: '"source"' };
const attempt = { id: token.attemptId, candidateKey: `derived/${token.ownerId}/${token.fileId}/${token.jobId}/${token.attemptId}.webp` } as ProcessingAttempt;
const result = { id: 'result', jobId: token.jobId, attemptId: token.attemptId } as DerivedObject;
let sample: ThumbnailResult;
beforeAll(async () => {
  const bytes = await sharp({ create: { width: 5, height: 3, channels: 4, background: { r: 30, g: 70, b: 120, alpha: .5 } } }).webp().toBuffer();
  sample = { kind: 'artifact', bytes, mimeType: 'image/webp', sizeBytes: bytes.length, width: 5, height: 3,
    sha256: createHash('sha256').update(bytes).digest('hex'), selectedFrame: 0, implementationFingerprint: token.implementationFingerprint };
});
function fixture() {
  const state = {
    reserve: jest.fn<Promise<Reservation>, [Claim, unknown]>().mockResolvedValue({ kind: 'reserved', attempt }),
    markStored: jest.fn().mockResolvedValue(attempt), finalize: jest.fn().mockResolvedValue(result), fail: jest.fn().mockResolvedValue({}),
  };
  const storage = {
    writeDerived: jest.fn().mockResolvedValue({ sizeBytes: sample.sizeBytes, sha256: sample.sha256, contentType: 'image/webp', etag: '"output"' }),
    head: jest.fn().mockResolvedValue({ sizeBytes: sample.sizeBytes, contentType: 'image/webp', etag: '"output"' }), deleteObject: jest.fn(),
  };
  const service = new ProcessingPublicationService(state as unknown as ProcessingStateService, storage as unknown as ObjectStorage);
  const output = { ...sample, bytes: Buffer.from(sample.bytes) };
  return { service, state, storage, output };
}
describe('Explicit processing publication I/O boundary', () => {
  it('commits reservation before one create-only PUT, verifies receipt/HEAD, then stores and finalizes', async () => {
    const { service, state, storage, output } = fixture();
    await expect(service.publish(token, output, source)).resolves.toEqual({ state: 'succeeded', result });
    const order = [state.reserve, storage.writeDerived, storage.head, state.markStored, state.finalize].map(fn => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(state.reserve).toHaveBeenCalledWith(token, { sourceSha256: source.sha256, sourceETag: source.etag,
      outputSha256: sample.sha256, sizeBytes: sample.sizeBytes, width: 5, height: 3, implementationFingerprint: token.implementationFingerprint });
    expect(storage.writeDerived).toHaveBeenCalledTimes(1);
    expect(storage.writeDerived.mock.calls[0][0]).toMatchObject({ key: attempt.candidateKey, bytes: sample.bytes });
    expect(state.fail).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it.each(['pending', 'blocked', 'stored', 'succeeded'] as const)('never sends PUT for %s replay', async (kind) => {
    const { service, state, storage, output } = fixture();
    state.reserve.mockResolvedValueOnce(kind === 'succeeded' ? { kind, result } : { kind, attempt });
    const outcome = await service.publish(token, output, source);
    expect(outcome.state).toBe(kind === 'stored' || kind === 'succeeded' ? 'succeeded' : kind);
    expect(storage.writeDerived).not.toHaveBeenCalled(); expect(storage.head).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledTimes(kind === 'stored' ? 1 : 0);
  });
  it('only the newly committed reservation gets the write when two callers race', async () => {
    const { service, state, storage, output } = fixture();
    state.reserve.mockResolvedValueOnce({ kind: 'reserved', attempt }).mockResolvedValueOnce({ kind: 'pending', attempt });
    const outcomes = await Promise.all([service.publish(token, output, source), service.publish(token, output, source)]);
    expect(outcomes.map(x => x.state)).toEqual(['succeeded', 'pending']); expect(storage.writeDerived).toHaveBeenCalledTimes(1);
  });
  it('does not write or compensate when reservation commit acknowledgement is lost', async () => {
    const { service, state, storage, output } = fixture();
    state.reserve.mockRejectedValueOnce(new ProcessingStateError('PROCESSING_DATABASE_UNAVAILABLE'))
      .mockResolvedValueOnce({ kind: 'pending', attempt });
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
    await expect(service.publish(token, output, source)).resolves.toEqual({ state: 'pending' });
    expect(storage.writeDerived).not.toHaveBeenCalled(); expect(state.fail).not.toHaveBeenCalled();
  });
  it.each(['markStored', 'finalize'] as const)('a lost %s DB response never triggers failure compensation or a repeated PUT', async (method) => {
    const { service, state, storage, output } = fixture();
    state[method].mockRejectedValueOnce(new ProcessingStateError('PROCESSING_DATABASE_UNAVAILABLE'));
    state.reserve.mockResolvedValueOnce({ kind: 'reserved', attempt })
      .mockResolvedValueOnce(method === 'markStored' ? { kind: 'stored', attempt } : { kind: 'succeeded', result });
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
    await expect(service.publish(token, output, source)).resolves.toEqual({ state: 'succeeded', result });
    expect(storage.writeDerived).toHaveBeenCalledTimes(1); expect(state.fail).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it.each(['timeout-after-put', 'conditional-409', 'conditional-412', 'head-after-put'])(
    'retains accounting authority after uncertain %s failure, returns no raw provider details', async (failure) => {
      const { service, state, storage, output } = fixture();
      const raw = new Error('private provider credential URL');
      if (failure === 'head-after-put') storage.head.mockRejectedValueOnce(raw);
      else storage.writeDerived.mockRejectedValueOnce(raw);
      await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_STORAGE_UNAVAILABLE', message: 'Processing publication failed.' });
      expect(state.fail).toHaveBeenCalledWith(token, 'PROCESSING_STORAGE_UNAVAILABLE');
      expect(state.markStored).not.toHaveBeenCalled(); expect(state.finalize).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
    });
  it.each([
    { sizeBytes: 999 }, { sha256: '0'.repeat(64) }, { contentType: 'text/html' }, { etag: '' }, { etag: 'bad\nvalue' },
  ])('rejects a conflicting storage receipt without deletion/release: %o', async (patch) => {
    const { service, state, storage, output } = fixture();
    storage.writeDerived.mockResolvedValueOnce({ sizeBytes: sample.sizeBytes, sha256: sample.sha256, contentType: 'image/webp', etag: '"output"', ...patch });
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_STORAGE_UNAVAILABLE' });
    expect(state.finalize).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it.each([null, { sizeBytes: 999, contentType: 'image/webp', etag: '"output"' },
    { sizeBytes: 0, contentType: 'text/html', etag: '"changed"' }])('rejects missing/conflicting verification HEAD: %o', async (head) => {
    const { service, state, storage, output } = fixture(); storage.head.mockResolvedValueOnce(head);
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_STORAGE_UNAVAILABLE' });
    expect(state.markStored).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('retains WRITE_PENDING as conservative fallback even when failure persistence is unavailable', async () => {
    const { service, state, storage, output } = fixture(); storage.writeDerived.mockRejectedValueOnce(new Error('provider'));
    state.fail.mockRejectedValueOnce(new ProcessingStateError('PROCESSING_DATABASE_UNAVAILABLE'));
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code: 'PROCESSING_STORAGE_UNAVAILABLE' });
    expect(storage.deleteObject).not.toHaveBeenCalled(); expect(state.finalize).not.toHaveBeenCalled();
  });
  it.each(['SOURCE_CHANGED', 'SOURCE_NOT_ACTIVE'] as const)('persists known source failure %s without writing or accounting compensation', async (code) => {
    const { service, state, storage, output } = fixture();
    state.reserve.mockRejectedValueOnce(new ProcessingStateError(code));
    await expect(service.publish(token, output, source)).rejects.toMatchObject({ code });
    expect(state.fail).toHaveBeenCalledWith(token, code);
    expect(storage.writeDerived).not.toHaveBeenCalled(); expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('snapshots bytes, output/source metadata and claim before the reservation await', async () => {
    const { service, state, storage, output } = fixture();
    let release!: (value: Reservation) => void; state.reserve.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const c = { ...token }; const src = { ...source }; const call = service.publish(c, output, src);
    (output.bytes as Buffer).fill(0); output.width = 999; output.sha256 = '0'.repeat(64); c.fence = 999n; c.jobId = token.fileId; src.sha256 = '0'.repeat(64);
    release({ kind: 'reserved', attempt }); await call;
    expect(storage.writeDerived.mock.calls[0][0].bytes).toEqual(sample.bytes);
    expect(state.markStored).toHaveBeenCalledWith(token); expect(state.finalize).toHaveBeenCalledWith(token);
    expect((state.reserve.mock.calls[0][1] as { width: number }).width).toBe(5);
  });
  it.each([
    { kind: 'metadata' }, { mimeType: 'text/html' }, { selectedFrame: 1 }, { sizeBytes: 999 }, { width: 999 },
    { sha256: '0'.repeat(64) }, { implementationFingerprint: '0'.repeat(64) }, { bytes: Buffer.alloc(524289) },
  ])('rejects untrusted output before reservation/I/O: %o', async (patch) => {
    const { service, state, storage, output } = fixture();
    await expect(service.publish(token, { ...output, ...patch } as ThumbnailResult, source)).rejects.toMatchObject({ code: 'PROCESSING_INVALID_ARGUMENT' });
    expect(state.reserve).not.toHaveBeenCalled(); expect(storage.writeDerived).not.toHaveBeenCalled();
  });
  it('pre-abort has no reservation or I/O', async () => {
    const { service, state, storage, output } = fixture(); const controller = new AbortController(); controller.abort();
    await expect(service.publish(token, output, source, controller.signal)).rejects.toMatchObject({ code: 'PROCESSOR_ABORTED' });
    expect(state.reserve).not.toHaveBeenCalled(); expect(storage.writeDerived).not.toHaveBeenCalled();
  });
  it('abort after committed reservation retains R and prevents the first PUT', async () => {
    const { service, state, storage, output } = fixture(); const controller = new AbortController();
    state.reserve.mockImplementationOnce(async () => { controller.abort(); return { kind: 'reserved', attempt }; });
    await expect(service.publish(token, output, source, controller.signal)).rejects.toMatchObject({ code: 'PROCESSOR_ABORTED' });
    expect(storage.writeDerived).not.toHaveBeenCalled(); expect(state.fail).toHaveBeenCalledWith(token, 'PROCESSOR_ABORTED');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});


// Both application services are real; DB/transaction and object storage remain isolated doubles.
// This exercises their cooperation without claiming PostgreSQL/MinIO integration evidence.
describe('Publication and durable state cooperation with isolated ports', () => {
  async function cooperation() {
    const f = processingFixture();
    const job = await f.service.createJob(processingOwner, processingFile);
    const claim = (await f.service.claim(processingOwner, processingFile, job.id, processingWorker))!;
    const objects = new Map<string, Buffer>();
    const storage = {
      writeDerived: jest.fn(async ({ key, bytes }: { key: string; bytes: Uint8Array }) => {
        if (objects.has(key)) throw new Error('synthetic conditional conflict');
        objects.set(key, Buffer.from(bytes));
        return { sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType: 'image/webp', etag: '"output"' };
      }),
      head: jest.fn(async (key: string) => objects.has(key)
        ? { sizeBytes: objects.get(key)!.length, contentType: 'image/webp', etag: '"output"' } : null),
      deleteObject: jest.fn(),
    };
    const publisher = new ProcessingPublicationService(f.service, storage as unknown as ObjectStorage);
    return { f, job, claim, storage, objects, publisher };
  }
  it('concurrent publish calls produce one stored object, one result, one charge and one audit', async () => {
    const { f, claim, storage, objects, publisher } = await cooperation();
    const replies = await Promise.all([publisher.publish(claim, sample, source), publisher.publish(claim, sample, source)]);
    expect(replies.map(reply => reply.state).sort()).toEqual(['pending', 'succeeded']);
    expect(storage.writeDerived).toHaveBeenCalledTimes(1); expect(objects.size).toBe(1);
    expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.user.usedStorageBytes).toBe(100n + BigInt(sample.sizeBytes)); expect(f.user.reservedStorageBytes).toBe(0n);
    expect((await publisher.publish(claim, sample, source)).state).toBe('succeeded');
    expect(storage.writeDerived).toHaveBeenCalledTimes(1);
  });
  it('a physically stored object with a lost PUT response remains fully reserved beside the next winner', async () => {
    const { f, job, claim, storage, objects, publisher } = await cooperation();
    const put = storage.writeDerived.getMockImplementation()!;
    storage.writeDerived.mockImplementationOnce(async input => { await put(input); throw new Error('synthetic PUT acknowledgement lost'); });
    await expect(publisher.publish(claim, sample, source)).rejects.toMatchObject({ code: 'PROCESSING_STORAGE_UNAVAILABLE' });
    expect(objects.size).toBe(1); expect(f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED');
    expect(f.user.reservedStorageBytes).toBe(BigInt(sample.sizeBytes)); expect(f.results).toHaveLength(0);
    f.advance(5000);
    const next = (await f.service.claim(processingOwner, processingFile, job.id, processingWorker))!;
    await publisher.publish(next, sample, source);
    expect(objects.size).toBe(2); expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.user.usedStorageBytes).toBe(100n + BigInt(sample.sizeBytes));
    expect(f.user.reservedStorageBytes).toBe(BigInt(sample.sizeBytes));
    expect(f.user.usedStorageBytes + f.user.reservedStorageBytes).toBe(100n + BigInt(sample.sizeBytes * 2));
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('finalization DB rollback retains STORED reservation and retry publishes without rewriting storage', async () => {
    const { f, claim, storage, objects, publisher } = await cooperation();
    f.onWrite = operation => { if (operation === 'auditEvent.create') throw new Error('synthetic audit DB failure'); };
    await expect(publisher.publish(claim, sample, source)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
    expect(objects.size).toBe(1); expect(f.results).toHaveLength(0); expect(f.audits).toHaveLength(0);
    expect(f.attempts[0]!.phase).toBe('STORED'); expect(f.jobs[0]!.state).toBe('RUNNING');
    expect(f.user.usedStorageBytes).toBe(100n); expect(f.user.reservedStorageBytes).toBe(BigInt(sample.sizeBytes));
    f.onWrite = undefined;
    await expect(publisher.publish(claim, sample, source)).resolves.toMatchObject({ state: 'succeeded' });
    expect(storage.writeDerived).toHaveBeenCalledTimes(1); expect(f.audits).toHaveLength(1);
    expect(f.user.reservedStorageBytes).toBe(0n); expect(f.user.usedStorageBytes).toBe(100n + BigInt(sample.sizeBytes));
  });
  it('an acknowledgement lost after finalization commit returns the durable winner on replay', async () => {
    const { f, claim, storage, publisher } = await cooperation();
    f.onWrite = operation => { if (operation === 'auditEvent.create') f.loseCommitResponse = true; };
    await expect(publisher.publish(claim, sample, source)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
    expect(f.results).toHaveLength(1); expect(f.attempts[0]!.phase).toBe('PUBLISHED');
    expect(f.user.reservedStorageBytes).toBe(0n);
    await expect(publisher.publish(claim, sample, source)).resolves.toMatchObject({ state: 'succeeded', result: { id: f.results[0]!.id } });
    expect(storage.writeDerived).toHaveBeenCalledTimes(1); expect(f.audits).toHaveLength(1);
    expect(f.user.usedStorageBytes).toBe(100n + BigInt(sample.sizeBytes));
  });
  it('lost reservation acknowledgement retains R but grants no new PUT on replay', async () => {
    const { f, claim, storage, objects, publisher } = await cooperation();
    f.loseCommitResponse = true;
    await expect(publisher.publish(claim, sample, source)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
    await expect(publisher.publish(claim, sample, source)).resolves.toEqual({ state: 'pending' });
    expect(storage.writeDerived).not.toHaveBeenCalled(); expect(objects.size).toBe(0);
    expect(f.user.reservedStorageBytes).toBe(BigInt(sample.sizeBytes));
    f.advance(90001);
    await f.service.blockCleanup(processingOwner, processingFile, claim.jobId, claim.attemptId);
    expect(f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED'); expect(f.user.reservedStorageBytes).toBe(BigInt(sample.sizeBytes));
  });
});
