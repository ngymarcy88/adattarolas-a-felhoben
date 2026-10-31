import { processingFixture, processingOwner as owner, processingFile as fileId, processingWorker as worker, candidate } from './helpers/processing-fixture';
import type { Claim } from '../src/processing/processing-state.types';

type Fixture = ReturnType<typeof processingFixture>;
const code = (value: string) => expect.objectContaining({ code: value });
async function running(f = processingFixture()) {
  const job = await f.service.createJob(owner, fileId);
  const claim = await f.service.claim(owner, fileId, job.id, worker);
  expect(claim).not.toBeNull();
  return { f, job, claim: claim! };
}
async function stored(f = processingFixture()) {
  const result = await running(f);
  expect((await f.service.reserve(result.claim, candidate)).kind).toBe('reserved');
  await f.service.markStored(result.claim);
  return result;
}
function expire(f: Fixture) { f.now = new Date(+new Date(f.jobs[0]!.leaseUntil) + 1); }

// Pure service unit tests: no PostgreSQL server, storage, decoder or worker is started.
describe('ProcessingStateService identity and claims', () => {
  it('creates one queued logical job on repeated and concurrent delivery', async () => {
    const f = processingFixture();
    const jobs = await Promise.all([f.service.createJob(owner, fileId), f.service.createJob(owner, fileId)]);
    expect(jobs[0].id).toBe(jobs[1].id);
    expect(f.jobs).toHaveLength(1);
    expect(f.jobs[0]).toMatchObject({ state: 'QUEUED', fence: 0n, totalAttemptCount: 0 });
    expect(f.attempts).toHaveLength(0);
    expect(f.user.reservedStorageBytes).toBe(0n);
  });

  it('uses User→FileObject→Job→Attempts lock order and the database clock', async () => {
    const { f, claim } = await running();
    const locks = f.log.filter((value) => value.startsWith('lock:'));
    const lastUser = locks.lastIndexOf('lock:User');
    expect(locks.slice(lastUser, lastUser + 4)).toEqual(['lock:User', 'lock:FileObject', 'lock:ProcessingJob', 'lock:ProcessingAttempt']);
    expect(f.log).toContain('clock');
    expect(+new Date(f.jobs[0]!.leaseUntil) - +f.now).toBe(90000);
    expect(claim.fence).toBe(1n);
    expect(f.jobs[0]!.totalAttemptCount).toBe(1);
  });

  it.each(['PENDING_UPLOAD', 'SOFT_DELETED', 'PURGE_FAILED'])('does not create work for parent state %s', async (status) => {
    const f = processingFixture(); f.file.status = status;
    await expect(f.service.createJob(owner, fileId)).rejects.toThrow();
    expect(f.jobs).toHaveLength(0);
  });

  it('hides another owner and refuses unsupported sources without reserving bytes', async () => {
    const f = processingFixture(); f.file.ownerId = '00000000-0000-4000-8000-000000000199';
    await expect(f.service.createJob(owner, fileId)).rejects.toThrow();
    f.file.ownerId = owner; f.file.detectedMimeType = 'video/mp4';
    await expect(f.service.createJob(owner, fileId)).rejects.toThrow();
    expect(f.user.reservedStorageBytes).toBe(0n);
    expect(f.jobs).toHaveLength(0);
  });

  it('rolls claim counters and the new attempt back together on any claim write failure', async () => {
    for (const nth of [1, 2]) {
      const f = processingFixture(); const job = await f.service.createJob(owner, fileId);
      const before = structuredClone(f.store); f.writes = 0; f.failWrite = nth;
      await expect(f.service.claim(owner, fileId, job.id, worker)).rejects.toThrow();
      expect(f.store).toEqual(before);
    }
  });

  it('grants only one concurrent claim and does not touch an unexpired lease', async () => {
    const f = processingFixture(); const job = await f.service.createJob(owner, fileId);
    const claims = await Promise.all([f.service.claim(owner, fileId, job.id, worker), f.service.claim(owner, fileId, job.id, worker)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(f.attempts).toHaveLength(1);
    expect(f.jobs[0]!.totalAttemptCount).toBe(1);
  });

  it('reclaims an expired lease with a new fence and invalidates old mutation rights', async () => {
    const { f, job, claim } = await running(); expire(f);
    const next = await f.service.claim(owner, fileId, job.id, worker);
    expect(next!.fence).toBeGreaterThan(claim.fence);
    expect(next!.attemptId).not.toBe(claim.attemptId);
    await expect(f.service.heartbeat(claim)).rejects.toEqual(code('PROCESSING_LEASE_LOST'));
    await expect(f.service.reserve(claim, candidate)).rejects.toEqual(code('PROCESSING_LEASE_LOST'));
    expect(f.user.reservedStorageBytes).toBe(0n);
  });

  it('uses DB time for heartbeat and does not revive an expired lease', async () => {
    const { f, claim } = await running(); f.advance(15000);
    await f.service.heartbeat(claim);
    expect(+new Date(f.jobs[0]!.leaseUntil)).toBe(+f.now + 90000);
    expire(f);
    await expect(f.service.heartbeat(claim)).rejects.toEqual(code('PROCESSING_LEASE_LOST'));
  });
});

describe('ProcessingStateService quota reservation', () => {
  it('reserves exact output bytes once; repeated delivery never grants another PUT', async () => {
    const { f, claim } = await running();
    f.user.storageLimitBytes = 300n;
    expect((await f.service.reserve(claim, candidate)).kind).toBe('reserved');
    expect((await f.service.reserve(claim, candidate)).kind).toBe('pending');
    expect(f.user.reservedStorageBytes).toBe(200n);
    expect(f.attempts[0]).toMatchObject({ phase: 'WRITE_PENDING', reservedBytes: 200n, outputBytes: 200n });
    await f.service.markStored(claim);
    expect((await f.service.reserve(claim, candidate)).kind).toBe('stored');
    expect(f.user.reservedStorageBytes).toBe(200n);
  });

  it('keeps a committed reservation conservative when the transaction response is lost', async () => {
    const { f, claim } = await running(); f.loseCommitResponse = true;
    await expect(f.service.reserve(claim, candidate)).rejects.toThrow();
    expect((await f.service.reserve(claim, candidate)).kind).toBe('pending');
    expect(f.user.reservedStorageBytes).toBe(200n);
  });

  it('rolls reservation metadata and counters back together at each write failure', async () => {
    for (const nth of [1, 2]) {
      const { f, claim } = await running(); const before = structuredClone(f.store);
      f.writes = 0; f.failWrite = nth;
      await expect(f.service.reserve(claim, candidate)).rejects.toThrow();
      expect(f.store).toEqual(before);
    }
  });

  it('rejects a new source digest across attempts and preserves the old reservation', async () => {
    const { f, claim, job } = await running(); await f.service.reserve(claim, candidate); expire(f);
    const next = await f.service.claim(owner, fileId, job.id, worker);
    await expect(f.service.reserve(next!, { ...candidate, sourceSha256: 'e'.repeat(64) })).rejects.toEqual(code('SOURCE_CHANGED'));
    expect(f.user.reservedStorageBytes).toBe(200n);
  });

  it('blocks at quota plus one without consuming bytes or automatically polling', async () => {
    const { f, claim, job } = await running(); f.user.storageLimitBytes = 299n;
    expect((await f.service.reserve(claim, candidate)).kind).toBe('blocked');
    expect(f.user.reservedStorageBytes).toBe(0n);
    expect(f.jobs[0]!.state).toBe('BLOCKED_QUOTA');
    expect((await f.service.reserve(claim, candidate)).kind).toBe('blocked');
    expect(f.user.reservedStorageBytes).toBe(0n);
    expect(await f.service.claim(owner, fileId, job.id, worker)).toBeNull();
  });

  it('serializes competing jobs on the same user total', async () => {
    const { f, claim } = await running();
    const secondId = '00000000-0000-4000-8000-000000000104';
    f.store.fileObject.push({ ...structuredClone(f.file), id: secondId, storageKey: `originals/${owner}/${secondId}` });
    f.user.usedStorageBytes = 200n;
    const job2 = await f.service.createJob(owner, secondId);
    const claim2 = await f.service.claim(owner, secondId, job2.id, worker);
    f.user.storageLimitBytes = 550n;
    const reservations = await Promise.all([f.service.reserve(claim, candidate), f.service.reserve(claim2!, candidate)]);
    expect(reservations.map((value) => value.kind).sort()).toEqual(['blocked', 'reserved']);
    expect(f.user.reservedStorageBytes).toBe(200n);
    expect(f.user.usedStorageBytes + f.user.reservedStorageBytes).toBeLessThanOrEqual(f.user.storageLimitBytes);
  });

  it('shares the owner quota lock with a simulated upload reservation', async () => {
    const { f, claim } = await running(); f.user.storageLimitBytes = 400n;
    const upload = () => f.db.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw`SELECT "usedStorageBytes", "reservedStorageBytes", "storageLimitBytes" FROM "User" WHERE "id" = ${owner}::uuid FOR UPDATE`;
      if (user!.usedStorageBytes + user!.reservedStorageBytes + 150n > user!.storageLimitBytes) return 'blocked';
      await tx.user.update({ where: { id: owner }, data: { reservedStorageBytes: { increment: 150n } } });
      return 'reserved';
    });
    const results = await Promise.all([upload(), f.service.reserve(claim, candidate)]);
    expect(results[0]).toBe('reserved');
    expect(results[1]).toMatchObject({ kind: 'blocked' });
    expect(f.user.reservedStorageBytes).toBe(150n);
  });

  it('retains an old uncertain reservation when a new attempt wins', async () => {
    const { f, claim, job } = await running(); await f.service.reserve(claim, candidate);
    expire(f);
    const next = await f.service.claim(owner, fileId, job.id, worker);
    expect((await f.service.reserve(next!, { ...candidate, sizeBytes: 180 })).kind).toBe('reserved');
    await f.service.markStored(next!); await f.service.finalize(next!);
    expect(f.user.usedStorageBytes).toBe(280n);
    expect(f.user.reservedStorageBytes).toBe(200n);
    expect(f.attempts[0]!.reservationReleasedAt).toBeNull();
    expect(f.results).toHaveLength(1);
  });

  it.each([
    { sizeBytes: 0 }, { sizeBytes: 524289 }, { width: 513 }, { height: 0 },
    { sourceSha256: 'invalid' }, { outputSha256: 'invalid' }, { implementationFingerprint: 'd'.repeat(64) },
  ])('rejects malformed or wrong-build metadata %j without booking storage', async (change) => {
    const { f, claim } = await running();
    await expect(f.service.reserve(claim, { ...candidate, ...change })).rejects.toThrow();
    expect(f.user.reservedStorageBytes).toBe(0n);
    expect(f.attempts[0]!.phase).toBe('PREPARING');
  });
});

describe('ProcessingStateService publication and transaction failure', () => {
  it('publishes exactly once even for simultaneous finalization and lost delivery replay', async () => {
    const { f, claim } = await stored();
    const results = await Promise.all([f.service.finalize(claim), f.service.finalize(claim)]);
    expect(results[0].id).toBe(results[1].id);
    expect(f.results).toHaveLength(1);
    expect(f.audits.filter((row) => row.action === 'PROCESSING_SUCCEEDED')).toHaveLength(1);
    expect(f.user.usedStorageBytes).toBe(300n);
    expect(f.user.reservedStorageBytes).toBe(0n);
    expect(f.jobs[0]!.state).toBe('SUCCEEDED');
    expect(f.attempts[0]).toMatchObject({ phase: 'PUBLISHED', reservedBytes: 200n });
    expect((await f.service.reserve(claim, candidate)).kind).toBe('succeeded');
  });

  it.each(['reserve', 'heartbeat', 'finalize'] as const)('rechecks the original lease deadline after %s DB writes and rolls them back if time elapsed', async (operation) => {
    const prepared = operation === 'finalize' ? await stored() : await running();
    const { f, claim } = prepared; const before = structuredClone(f.store);
    let advanced = false;
    f.onWrite = () => { if (!advanced) { advanced = true; f.advance(90001); } };
    const action = operation === 'reserve' ? f.service.reserve(claim, candidate)
      : operation === 'heartbeat' ? f.service.heartbeat(claim) : f.service.finalize(claim);
    await expect(action).rejects.toEqual(code('PROCESSING_LEASE_LOST'));
    expect(f.store).toEqual(before);
  });

  it('returns committed success after the original commit response is lost', async () => {
    const { f, claim } = await stored(); f.loseCommitResponse = true;
    await expect(f.service.finalize(claim)).rejects.toThrow();
    expect(f.results).toHaveLength(1);
    await f.service.finalize(claim);
    expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.user.usedStorageBytes).toBe(300n); expect(f.user.reservedStorageBytes).toBe(0n);
  });

  it('rolls every publication DB write back, including audit failure', async () => {
    const probe = await stored(); probe.f.writes = 0; await probe.f.service.finalize(probe.claim);
    const writeCount = probe.f.writes;
    expect(writeCount).toBeGreaterThanOrEqual(4);
    for (let nth = 1; nth <= writeCount; nth++) {
      const { f, claim } = await stored();
      const before = structuredClone(f.store); f.writes = 0; f.failWrite = nth;
      await expect(f.service.finalize(claim)).rejects.toThrow();
      expect(f.store).toEqual(before);
      f.failWrite = 0;
      await f.service.finalize(claim);
      expect(f.user.usedStorageBytes).toBe(300n); expect(f.user.reservedStorageBytes).toBe(0n);
      expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1);
    }
  });

  it.each(['lease', 'owner', 'status', 'source', 'build'] as const)('rechecks %s immediately before publication', async (change) => {
    const { f, claim } = await stored();
    if (change === 'lease') expire(f);
    if (change === 'owner') f.file.ownerId = '00000000-0000-4000-8000-000000000199';
    if (change === 'status') f.file.status = 'SOFT_DELETED';
    if (change === 'source') f.file.storageKey += '-changed';
    if (change === 'build') f.jobs[0]!.implementationFingerprint = 'f'.repeat(64);
    await expect(f.service.finalize(claim)).rejects.toThrow();
    expect(f.results).toHaveLength(0); expect(f.audits).toHaveLength(0);
    expect(f.user.usedStorageBytes).toBe(100n); expect(f.user.reservedStorageBytes).toBe(200n);
  });
});

describe('ProcessingStateService caller-owned argument snapshots', () => {
  it.each(['heartbeat', 'reserve', 'markStored', 'finalize', 'fail'] as const)('snapshots Claim scalar fields before the first transaction await in %s', async (operation) => {
    const prepared = operation === 'finalize' ? await stored() : await running();
    const { f, claim } = prepared;
    if (operation === 'markStored') await f.service.reserve(claim, candidate);
    const mutable = { ...claim };
    const action = operation === 'heartbeat' ? f.service.heartbeat(mutable)
      : operation === 'reserve' ? f.service.reserve(mutable, candidate)
      : operation === 'markStored' ? f.service.markStored(mutable)
      : operation === 'finalize' ? f.service.finalize(mutable)
      : f.service.fail(mutable, 'PROCESSOR_TIMEOUT');
    Object.assign(mutable, {
      ownerId: '00000000-0000-4000-8000-000000000191', fileId: '00000000-0000-4000-8000-000000000192',
      jobId: '00000000-0000-4000-8000-000000000193', attemptId: '00000000-0000-4000-8000-000000000194',
      leaseOwner: '00000000-0000-4000-8000-000000000195', fence: 999n, implementationFingerprint: 'f'.repeat(64),
    });
    await action;
    expect(f.jobs).toHaveLength(1);
    expect(f.jobs[0]!.id).toBe(claim.jobId);
    expect(f.attempts[0]!.id).toBe(claim.attemptId);
    if (operation === 'reserve' || operation === 'markStored') expect(f.user.reservedStorageBytes).toBe(200n);
    if (operation === 'finalize') { expect(f.user.usedStorageBytes).toBe(300n); expect(f.results).toHaveLength(1); }
    if (operation === 'fail') expect(f.jobs[0]!.state).toBe('RETRY_WAIT');
  });

  it('snapshots validated candidate metadata before a caller can alter it', async () => {
    const { f, claim } = await running(); const mutable = { ...candidate };
    const pending = f.service.reserve(claim, mutable);
    mutable.sizeBytes = 1; mutable.width = 1; mutable.height = 1;
    mutable.sourceSha256 = 'f'.repeat(64); mutable.outputSha256 = 'e'.repeat(64);
    mutable.sourceETag = '"changed"'; mutable.implementationFingerprint = 'd'.repeat(64);
    expect((await pending).kind).toBe('reserved');
    expect(f.attempts[0]).toMatchObject({ outputBytes: 200n, reservedBytes: 200n, width: 32, height: 16,
      sourceSha256: candidate.sourceSha256, outputSha256: candidate.outputSha256, sourceETag: candidate.sourceETag });
    expect(f.user.reservedStorageBytes).toBe(200n);
  });
});

describe('ProcessingStateService bounded retry and conservative cleanup', () => {
  it('enforces 5s/30s backoff, three attempts per cycle, two manual cycles and nine lifetime attempts', async () => {
    const { f, job, claim: initial } = await running();
    let claim: Claim = initial;
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const before = +f.now;
        await f.service.fail(claim, 'PROCESSOR_TIMEOUT');
        if (attempt < 2) {
          const delay = attempt === 0 ? 5000 : 30000;
          expect(+new Date(f.jobs[0]!.nextAttemptAt)).toBe(before + delay);
          expect(await f.service.claim(owner, fileId, job.id, worker)).toBeNull();
          f.advance(delay);
          claim = (await f.service.claim(owner, fileId, job.id, worker))!;
        }
      }
      expect(f.jobs[0]!.state).toBe('FAILED');
      expect(f.jobs[0]!.totalAttemptCount).toBe((cycle + 1) * 3);
      if (cycle < 2) {
        await f.service.retry(owner, fileId, job.id, f.jobs[0]!.retryRevision);
        expect(f.jobs[0]!.cycleAttemptCount).toBe(0);
        expect(f.jobs[0]!.retryRevision).toBe(cycle + 1);
        claim = (await f.service.claim(owner, fileId, job.id, worker))!;
      }
    }
    await expect(f.service.retry(owner, fileId, job.id, f.jobs[0]!.retryRevision)).rejects.toThrow();
    expect(f.jobs[0]!.totalAttemptCount).toBe(9);
    expect(f.attempts).toHaveLength(9);
  });

  it('consumes a manual retry revision once even when the commit response is lost and an old request is replayed after another failed cycle', async () => {
    const { f, claim: first, job } = await running();
    let claim = first;
    const exhaustCycle = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await f.service.fail(claim, 'PROCESSOR_TIMEOUT');
        if (attempt < 2) {
          f.advance(attempt === 0 ? 5000 : 30000);
          claim = (await f.service.claim(owner, fileId, job.id, worker))!;
        }
      }
    };
    await exhaustCycle();
    f.loseCommitResponse = true;
    await expect(f.service.retry(owner, fileId, job.id, 0)).rejects.toThrow();
    expect(f.jobs[0]!.retryRevision).toBe(1);
    await f.service.retry(owner, fileId, job.id, 0);
    expect(f.jobs[0]!.retryRevision).toBe(1);
    claim = (await f.service.claim(owner, fileId, job.id, worker))!;
    await exhaustCycle();
    expect(f.jobs[0]).toMatchObject({ state: 'FAILED', totalAttemptCount: 6, retryRevision: 1 });
    await f.service.retry(owner, fileId, job.id, 0);
    expect(f.jobs[0]).toMatchObject({ state: 'FAILED', totalAttemptCount: 6, retryRevision: 1 });
    await expect(f.service.retry(owner, fileId, job.id, 2)).rejects.toEqual(code('PROCESSING_STATE_CONFLICT'));
  });

  it('serializes concurrent manual retries with one expected revision without spending two cycles', async () => {
    const { f, claim, job } = await running(); f.user.storageLimitBytes = 299n;
    await f.service.reserve(claim, candidate);
    const replies = await Promise.all([f.service.retry(owner, fileId, job.id, 0), f.service.retry(owner, fileId, job.id, 0)]);
    expect(replies.map((value) => value.retryRevision)).toEqual([1, 1]);
    expect(f.jobs[0]).toMatchObject({ retryRevision: 1, cycleAttemptCount: 0, totalAttemptCount: 1 });
  });

  it('treats retry delivery for an already successful job as a no-op', async () => {
    const { f, claim, job } = await stored(); await f.service.finalize(claim);
    const before = structuredClone(f.store);
    await f.service.retry(owner, fileId, job.id, 0);
    expect(f.store).toEqual(before);
    expect(f.jobs[0]!.state).toBe('SUCCEEDED');
    expect(f.results).toHaveLength(1);
  });

  it('rejects a false SOURCE_NOT_ACTIVE claim and rolls tentative attempt retirement back', async () => {
    const { f, claim } = await running(); const before = structuredClone(f.store);
    await expect(f.service.fail(claim, 'SOURCE_NOT_ACTIVE')).rejects.toEqual(code('PROCESSING_STATE_CONFLICT'));
    expect(f.store).toEqual(before);
    expect(f.jobs[0]!.state).toBe('RUNNING');
    expect(f.attempts[0]!.phase).toBe('PREPARING');
  });

  it('makes invalid input terminal and does not permit arbitrary manual retries', async () => {
    const { f, claim, job } = await running();
    await f.service.fail(claim, 'PROCESSOR_INPUT_INVALID');
    expect(f.jobs[0]).toMatchObject({ state: 'FAILED', retryable: false });
    await expect(f.service.retry(owner, fileId, job.id, f.jobs[0]!.retryRevision)).rejects.toThrow();
    expect(f.jobs[0]!.totalAttemptCount).toBe(1);
  });

  it('records a source-not-active failure as cancellation with no implicit restart after restore', async () => {
    const { f, claim, job } = await running(); await f.service.reserve(claim, candidate);
    f.file.status = 'SOFT_DELETED'; f.file.deletedAt = new Date(f.now);
    await f.service.fail(claim, 'SOURCE_NOT_ACTIVE');
    expect(f.jobs[0]).toMatchObject({ state: 'CANCELLED', leaseOwner: null, leaseUntil: null });
    expect(f.jobs[0]!.fence).toBeGreaterThan(claim.fence);
    expect(f.user.reservedStorageBytes).toBe(200n);
    f.file.status = 'ACTIVE'; f.file.deletedAt = null;
    expect(await f.service.claim(owner, fileId, job.id, worker)).toBeNull();
    await f.service.retry(owner, fileId, job.id, 0);
    const next = await f.service.claim(owner, fileId, job.id, worker);
    expect(next!.attemptId).not.toBe(claim.attemptId);
    expect(f.user.reservedStorageBytes).toBe(200n);
  });

  it('can record SOURCE_CHANGED permanently after the original snapshot no longer matches', async () => {
    const { f, claim } = await running(); f.file.storageKey += '-changed';
    await f.service.fail(claim, 'SOURCE_CHANGED');
    expect(f.jobs[0]).toMatchObject({ state: 'FAILED', retryable: false, lastErrorCode: 'SOURCE_CHANGED' });
    expect(f.user.reservedStorageBytes).toBe(0n);
  });

  it('cancels non-active parents without releasing uncertain bytes, and stale claims remain invalid after restore', async () => {
    const { f, claim, job } = await running(); await f.service.reserve(claim, candidate);
    f.file.status = 'SOFT_DELETED'; await f.service.cancel(owner, fileId, job.id);
    expect(f.jobs[0]!.state).toBe('CANCELLED'); expect(f.user.reservedStorageBytes).toBe(200n);
    f.file.status = 'ACTIVE';
    await expect(f.service.markStored(claim)).rejects.toEqual(code('PROCESSING_LEASE_LOST'));
    expect(await f.service.claim(owner, fileId, job.id, worker)).toBeNull();
  });

  it('blocks cleanup without fabricating write closure, absence or quota release', async () => {
    const { f, claim, job } = await running(); await f.service.reserve(claim, candidate);
    await expect(f.service.blockCleanup(owner, fileId, job.id, claim.attemptId)).rejects.toEqual(code('PROCESSING_STATE_CONFLICT'));
    expire(f);
    await f.service.blockCleanup(owner, fileId, job.id, claim.attemptId);
    expect(f.attempts[0]).toMatchObject({ phase: 'CLEANUP_BLOCKED', writesClosedAt: null,
      objectAbsentAt: null, closureEvidenceType: null, closureEvidenceRef: null, reservationReleasedAt: null });
    expect(f.user.reservedStorageBytes).toBe(200n);
    expect(f.user.usedStorageBytes).toBe(100n);
  });

  it('cannot route a published winner through orphan cleanup or subtract its usage', async () => {
    const { f, claim, job } = await stored(); await f.service.finalize(claim);
    await f.service.blockCleanup(owner, fileId, job.id, claim.attemptId);
    expect(f.attempts[0]!.phase).toBe('PUBLISHED');
    expect(f.user.usedStorageBytes).toBe(300n); expect(f.user.reservedStorageBytes).toBe(0n);
    expect(f.results).toHaveLength(1);
  });
});
