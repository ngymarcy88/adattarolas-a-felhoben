import { processingFixture, processingOwner as owner, processingFile as file, processingWorker as worker, candidate } from './helpers/processing-fixture';
import { ProcessingStateError } from '../src/processing/processing-state.types';

async function reserved(stored = false) {
  const f = processingFixture(); const job = await f.service.createJob(owner, file);
  const claim = (await f.service.claim(owner, file, job.id, worker))!;
  await f.service.captureSource(claim, candidate.sourceSha256, candidate.sourceETag);
  await f.service.reserve(claim, candidate); if (stored) await f.service.markStored(claim);
  return { f, job, claim };
}
describe('Fenced recovery and durable restart state', () => {
  it.each([false, true])('adopts a validated %s candidate once with a NEW publication fence and no new reservation/attempt', async stored => {
    const { f, job, claim } = await reserved(stored); f.advance(90001);
    const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    expect(recovery.attemptId).toBe(claim.attemptId); expect(recovery.fence).toBeGreaterThan(claim.fence);
    expect(f.jobs[0]).toMatchObject({ totalAttemptCount: 1, cycleAttemptCount: 1, recoveryProbeCount: 1 });
    await f.service.heartbeat(recovery); expect((await f.service.loadClaim(recovery)).attempt.fence).toBe(claim.fence);
    const results = await Promise.all([f.service.finalizeRecovered(recovery, candidate), f.service.finalizeRecovered(recovery, candidate)]);
    expect(results[0].id).toBe(results[1].id); expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1);
    expect(f.results[0]!.publicationFence).toBe(recovery.fence); expect(f.attempts[0]!.fence).toBe(claim.fence);
    expect(f.user).toMatchObject({ usedStorageBytes: 300n, reservedStorageBytes: 0n }); expect(f.attempts).toHaveLength(1);
    await expect(f.service.markStored(claim)).rejects.toThrow();
  });
  it('never takes an unexpired lease and normal finalize cannot use a recovery claim', async () => {
    const { f, job, claim } = await reserved(true);
    expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull();
    f.advance(90001); const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    await expect(f.service.finalize(recovery)).rejects.toMatchObject({ code: 'PROCESSING_LEASE_LOST' });
    await expect(f.service.markStored(claim)).rejects.toThrow(); expect(f.results).toHaveLength(0);
  });
  it.each(['sourceSha256', 'outputSha256', 'sourceETag', 'width', 'sizeBytes'] as const)('rejects conflicting recovery evidence %s without accounting', async field => {
    const { f, job } = await reserved(); f.advance(90001);
    const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    const evidence = { ...candidate, [field]: field === 'width' || field === 'sizeBytes' ? 2 : field === 'sourceETag' ? '"changed"' : 'f'.repeat(64) };
    await expect(f.service.finalizeRecovered(recovery, evidence)).rejects.toThrow();
    expect(f.results).toHaveLength(0); expect(f.user).toMatchObject({ usedStorageBytes: 100n, reservedStorageBytes: 200n });
  });
  it('generation fallback cannot retire a valid candidate if the lease expires between the two claim transactions', async () => {
    const { f, job } = await reserved(true);
    expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull();
    f.advance(90001);
    expect(await f.service.claim(owner, file, job.id, worker, true)).toBeNull();
    expect(f.attempts[0]!.phase).toBe('STORED'); expect(f.jobs[0]!.totalAttemptCount).toBe(1);
    const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    await f.service.finalizeRecovered(recovery, candidate); expect(f.results).toHaveLength(1); expect(f.attempts).toHaveLength(1);
  });
  it('blocks cleanup during live recovery, then makes retired candidates permanently nonadoptable', async () => {
    const { f, job, claim } = await reserved(); f.advance(90001);
    const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    await expect(f.service.blockCleanup(owner, file, job.id, claim.attemptId)).rejects.toThrow();
    await f.service.failRecovery(recovery, 'PROCESSING_STORAGE_UNAVAILABLE', true);
    expect(f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED'); expect(f.user.reservedStorageBytes).toBe(200n);
    await expect(f.service.finalizeRecovered(recovery, candidate)).rejects.toThrow();
    f.advance(5000); expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull();
    const next = (await f.service.claim(owner, file, job.id, worker))!;
    expect(next.attemptId).not.toBe(claim.attemptId); await f.service.reserve(next, candidate);
    expect(f.user.reservedStorageBytes).toBe(400n);
  });
  it('limits recovery-only probes to three with 5s/30s backoff and retains the candidate/R on transient failures', async () => {
    const { f, job } = await reserved(); f.advance(90001);
    for (let i = 1; i <= 3; i++) {
      const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
      await f.service.failRecovery(recovery, 'PROCESSING_STORAGE_UNAVAILABLE');
      expect(f.jobs[0]!.recoveryProbeCount).toBe(i); expect(f.jobs[0]!.totalAttemptCount).toBe(1);
      expect(f.attempts[0]!.phase).toBe('WRITE_PENDING'); expect(f.user.reservedStorageBytes).toBe(200n);
      if (i < 3) { expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull(); f.advance(i === 1 ? 5000 : 30000); }
    }
    expect(f.jobs[0]!.state).toBe('FAILED');
    expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull();
    await f.service.retry(owner, file, job.id, 0);
    expect(f.jobs[0]!.recoveryProbeCount).toBe(0); expect(f.attempts[0]!.phase).toBe('WRITE_PENDING');
    expect(await f.service.claimRecovery(owner, file, job.id, worker)).not.toBeNull();
  });
  it('also bounds repeated crash-without-failure-record recovery probes', async () => {
    const { f, job } = await reserved();
    for (let i = 0; i < 3; i++) { f.advance(90001); expect(await f.service.claimRecovery(owner, file, job.id, worker)).not.toBeNull(); }
    f.advance(90001); expect(await f.service.claimRecovery(owner, file, job.id, worker)).toBeNull();
    expect(f.jobs[0]!.state).toBe('FAILED'); expect(f.attempts).toHaveLength(1); expect(f.user.reservedStorageBytes).toBe(200n);
  });
  it('can finalize a valid candidate when the GENERATION budget has been exhausted', async () => {
    const { f, job } = await reserved();
    Object.assign(f.jobs[0]!, { totalAttemptCount: 9, cycleAttemptCount: 3, retryRevision: 2, fence: 9n }); f.advance(90001);
    const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    expect(recovery).not.toBeNull(); await f.service.finalizeRecovered(recovery, candidate);
    expect(f.jobs[0]!.totalAttemptCount).toBe(9); expect(f.results).toHaveLength(1);
  });
  it.each(['derivedObject.create', 'processingAttempt.update', 'processingJob.update', 'user.update', 'auditEvent.create'])(
    'rolls back recovery publication failure at %s and replays without extra accounting', async operation => {
      const { f, job } = await reserved(); f.advance(90001);
      const recovery = (await f.service.claimRecovery(owner, file, job.id, worker))!;
      f.onWrite = name => { if (name === operation) throw new Error('synthetic DB failure'); };
      await expect(f.service.finalizeRecovered(recovery, candidate)).rejects.toMatchObject({ code: 'PROCESSING_DATABASE_UNAVAILABLE' });
      expect(f.results).toHaveLength(0); expect(f.audits).toHaveLength(0); expect(f.user.reservedStorageBytes).toBe(200n);
      f.onWrite = undefined; await f.service.finalizeRecovered(recovery, candidate); expect(f.results).toHaveLength(1);
    });
  it('cancels a source deleted during recovery and allows bounded explicit retry only after restore', async () => {
    const { f, job } = await reserved(); f.advance(90001); const claim = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    f.file.status = 'SOFT_DELETED'; f.file.deletedAt = new Date(f.now);
    await f.service.failRecovery(claim, 'SOURCE_NOT_ACTIVE');
    expect(f.jobs[0]).toMatchObject({ state: 'CANCELLED', retryable: true }); expect(f.jobs[0]!.fence).toBeGreaterThan(claim.fence);
    expect(f.user.reservedStorageBytes).toBe(200n); await expect(f.service.retry(owner, file, job.id, 0)).rejects.toThrow();
    f.file.status = 'ACTIVE'; f.file.deletedAt = null;
    await f.service.retry(owner, file, job.id, 0); expect(f.jobs[0]!.state).toBe('QUEUED');
    expect(f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED'); expect(f.user.reservedStorageBytes).toBe(200n);
  });
  it('lost publication commit response is a no-op replay of the durable winner', async () => {
    const { f, job } = await reserved(); f.advance(90001); const claim = (await f.service.claimRecovery(owner, file, job.id, worker))!;
    f.loseCommitResponse = true;
    await expect(f.service.finalizeRecovered(claim, candidate)).rejects.toThrow();
    await f.service.finalizeRecovered(claim, candidate);
    expect(f.results).toHaveLength(1); expect(f.audits).toHaveLength(1); expect(f.user.reservedStorageBytes).toBe(0n);
  });
  it('persists source digest before decode and refuses changed bytes on a new generation', async () => {
    const f = processingFixture(); const job = await f.service.createJob(owner, file); const old = (await f.service.claim(owner, file, job.id, worker))!;
    await f.service.captureSource(old, candidate.sourceSha256, candidate.sourceETag); f.advance(90001);
    const next = (await f.service.claim(owner, file, job.id, worker))!;
    await expect(f.service.captureSource(next, 'f'.repeat(64), candidate.sourceETag)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(f.user.reservedStorageBytes).toBe(0n);
  });
  it('selects a bounded policy-matching hint with DB time and statement/transaction timeouts', async () => {
    const f = processingFixture(); const job = await f.service.createJob(owner, file);
    expect(await f.service.listReady()).toEqual([{ id: job.id, ownerId: owner, fileObjectId: file }]);
    expect(f.tx.processingJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1, where: expect.objectContaining({
      implementationFingerprint: 'a'.repeat(64), OR: expect.any(Array) }) }));
    expect(f.tx.$executeRaw.mock.calls.some(([parts]) => parts.join('').includes('statement_timeout'))).toBe(true);
    expect(f.db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ timeout: 5000 }));
  });
  it.each(['SOFT_DELETED', 'CHANGED'])('reconciles a selected %s source to prevent a permanently stuck queue head', async status => {
    const { f, job } = await reserved();
    if (status === 'SOFT_DELETED') { f.file.status = status; f.file.deletedAt = new Date(f.now); } else f.file.sizeBytes++;
    await f.service.reconcileSource(owner, file, job.id);
    expect(f.jobs[0]!.state).toBe(status === 'SOFT_DELETED' ? 'CANCELLED' : 'FAILED');
    expect(f.attempts[0]!.phase).toBe('CLEANUP_BLOCKED'); expect(f.user.reservedStorageBytes).toBe(200n);
  });
});
