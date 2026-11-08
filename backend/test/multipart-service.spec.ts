import { randomUUID } from 'node:crypto';
import { StorageError, MultipartMutationError } from '../src/storage/storage-error';
import { multipartFixture, multipartOwner as owner, multipartOther as other, image, hash } from './helpers/multipart-fixture';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-02T10:00:00Z')); });
afterEach(() => jest.useRealTimers());
const advance=(ms:number)=>jest.setSystemTime(new Date(Date.now()+ms));
const flush=async()=>{for(let i=0;i<500;i++)await Promise.resolve();};
function gate<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}

describe('durable import identity, ownership and quota',()=>{
  it('replays import creation without moving expiry or duplicating a collection',async()=>{
    const f=multipartFixture();const key=randomUUID();const first=await f.imports.create(owner,key);advance(1000);
    const replay=await f.imports.create(owner,key);expect(replay.status).toBe(200);expect(replay.body).toEqual(first.body);expect(f.tables.importSession).toHaveLength(1);
    expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
  });
  it('concurrent init/replay and clientFileId alias reserve and create only once',async()=>{
    const f=multipartFixture();const imp=(await f.imports.create(owner,randomUUID())).body.import.id;const key=randomUUID();const input=f.input();
    const [a,b]=await Promise.all([f.imports.initiate(owner,imp,key,input),f.imports.initiate(owner,imp,key,input)]);
    expect(a.body.item.fileId).toBe(b.body.item.fileId);const alias=await f.imports.initiate(owner,imp,randomUUID(),input);expect(alias.body.item.fileId).toBe(a.body.item.fileId);
    expect(f.tables.uploadOperation).toHaveLength(1);expect(f.tables.multipartTransfer).toHaveLength(1);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
    expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);
  });
  it('conflicting key/client identity changes do not change reservation or source',async()=>{
    const f=multipartFixture();const s=await f.start();
    for(const key of [s.key,randomUUID()])await expect(f.imports.initiate(owner,s.importId,key,{...s.input,contentSha256:'b'.repeat(64)})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    expect(f.tables.fileObject).toHaveLength(1);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('accepts exact quota and isolates a rejected second file',async()=>{
    const f=multipartFixture();f.tables.user[0].storageLimitBytes=100n+BigInt(image.length);const s=await f.start();
    await expect(f.imports.initiate(owner,s.importId,randomUUID(),f.input())).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
    expect(f.tables.fileObject).toHaveLength(1);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
    f.ready(s.transferId);await f.service.complete(owner,s.transferId);await f.service.confirmFile(owner,s.fileId);
    expect(f.tables.user[0].reservedStorageBytes).toBe(0n);expect(f.tables.user[0].usedStorageBytes).toBe(100n+BigInt(image.length));
  });
  it('lost init commit response is resolved by the same key after a new process instance',async()=>{
    const f=multipartFixture();const imp=(await f.imports.create(owner,randomUUID())).body.import.id;const key=randomUUID();const input=f.input();f.loseNextCommit();
    await expect(f.imports.initiate(owner,imp,key,input)).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
    expect(f.tables.fileObject).toHaveLength(1);expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
    const result=await f.imports.initiate(owner,imp,key,input);expect(result.status).toBe(200);expect(result.body.item.transfer.state).toBe('OPEN');
    expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);
  });
  it.each(['fileObject.create','uploadOperation.create','importFile.create','multipartTransfer.create','multipartPart.create','user.update','importSession.update'])('init failure at %s rolls back the entire reservation graph',async checkpoint=>{
    const f=multipartFixture();const imp=(await f.imports.create(owner,randomUUID())).body.import.id;f.fail(checkpoint);
    await expect(f.imports.initiate(owner,imp,randomUUID(),f.input())).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
    expect(f.tables.fileObject).toHaveLength(0);expect(f.tables.user[0].reservedStorageBytes).toBe(0n);expect(f.tables.importSession[0].acceptedFileCount).toBe(0);
    expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
  });
  it('caps accepted files and open imports independently',async()=>{
    const f=multipartFixture();f.configData.multipart.maxFiles=1;const s=await f.start();
    await expect(f.imports.initiate(owner,s.importId,randomUUID(),f.input())).rejects.toMatchObject({code:'IMPORT_FILE_LIMIT'});
    for(let i=0;i<4;i++)await f.imports.create(owner,randomUUID());await expect(f.imports.create(owner,randomUUID())).rejects.toMatchObject({code:'ACTIVE_IMPORT_LIMIT'});
  });
  it('hides foreign and nonexistent transfers/files/imports without storage access',async()=>{
    const f=multipartFixture();const s=await f.start();for(const method of ['status','complete','cancel'] as const){
      for(const id of [s.transferId,randomUUID()])await expect(f.service[method](other,id)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
    }
    for(const id of [s.transferId,randomUUID()]) {
      await expect(f.service.sign(other,id,1)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
      await expect(f.service.resume(other,id,{sizeBytes:image.length,contentSha256:hash})).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
    }
    await expect(f.service.confirmFile(other,s.fileId)).rejects.toMatchObject({code:'FILE_NOT_FOUND'});
    await expect(f.imports.get(other,s.importId,{})).rejects.toMatchObject({code:'IMPORT_NOT_FOUND'});
    await expect(f.imports.initiate(other,s.importId,randomUUID(),f.input())).rejects.toMatchObject({code:'IMPORT_NOT_FOUND'});
    expect(f.storage.listMultipartParts).not.toHaveBeenCalled();expect(f.storage.verifyMultipartObject).not.toHaveBeenCalled();
  });
});

describe('uncertain create, grants and observation',()=>{
  it('discovers a committed create after response loss, never retries create or invents I/O settlement',async()=>{
    const f=multipartFixture();const original=f.storage.initiateMultipart.getMockImplementation()!;
    f.storage.initiateMultipart.mockImplementationOnce(async input=>{await original(input);throw new MultipartMutationError('UNAVAILABLE','unknown');});
    const s=await f.start();expect(s.initialized.body.item.transfer.state).toBe('CREATE_UNKNOWN');advance(3000);
    const recovered=await f.makeService().status(owner,s.transferId);expect(recovered.state).toBe('OPEN');expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);
    expect(f.tables.multipartIoOperation[0]).toMatchObject({state:'UNKNOWN',settledAt:null});expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('a crash/unknown create without a discoverable session remains blocked and accounted',async()=>{
    const f=multipartFixture();f.storage.initiateMultipart.mockRejectedValueOnce(new MultipartMutationError('UNAVAILABLE','unknown'));
    const s=await f.start();advance(91000);expect((await f.makeService().status(owner,s.transferId)).state).toBe('CREATE_UNKNOWN');
    expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('records grant expiry before signing and never returns a grant after concurrent cancel',async()=>{
    const f=multipartFixture();const s=await f.start();const waiting=gate<any>();f.storage.createMultipartPartAccess.mockImplementationOnce(async input=>{
      expect(+f.tables.multipartPart[0].maxIssuedExpiresAt).toBe(+input.expiresAt);return waiting.promise;
    });
    const pending=f.service.sign(owner,s.transferId,1);const assertion=expect(pending).rejects.toMatchObject({code:'UPLOAD_CANCELLED'});await flush();
    await f.service.cancel(owner,s.transferId);waiting.resolve({method:'PUT',url:'https://storage.invalid/synthetic',headers:{},partNumber:1,sizeBytes:image.length,expiresAt:new Date(Date.now()+120000)});await assertion;
    expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('does not re-sign a ready part or reset the source on resume',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);
    await expect(f.service.sign(owner,s.transferId,1)).rejects.toMatchObject({code:'PART_ALREADY_UPLOADED'});
    await expect(f.service.resume(owner,s.transferId,{sizeBytes:image.length,contentSha256:'b'.repeat(64)})).rejects.toMatchObject({code:'TRANSFER_SOURCE_MISMATCH'});
    const status=await f.service.resume(owner,s.transferId,{sizeBytes:image.length,contentSha256:hash});expect(status.completedBytes).toBe(image.length);
    expect(f.storage.createMultipartPartAccess).not.toHaveBeenCalled();expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);
  });
  it('projects only public fields and never promotes XHR/DB snapshots to accounting',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const status=await f.service.status(owner,s.transferId);
    expect(Object.keys(status).sort()).toEqual(['id','state','revision','partSizeBytes','partCount','expiresAt','completedBytes','partsObservedAt','parts','cleanupState','reservationState','lastErrorCode'].sort());
    const text=JSON.stringify(status);for(const field of ['storageKey','providerUploadId','fence','etag','ownerId','contentSha256'])expect(text).not.toContain(field);
    expect(f.tables.user[0].usedStorageBytes).toBe(100n);expect(status.reservationState).toBe('HELD');
  });
});

describe('complete/confirm race and recovery',()=>{
  it('refuses incomplete parts without sending complete, and allows later completion',async()=>{
    const f=multipartFixture();const s=await f.start();await expect(f.service.complete(owner,s.transferId)).rejects.toMatchObject({code:'UPLOAD_PARTS_INCOMPLETE'});
    expect(f.tables.multipartTransfer[0].state).toBe('OPEN');expect(f.storage.completeMultipart).not.toHaveBeenCalled();f.ready(s.transferId);
    expect((await f.service.complete(owner,s.transferId)).status).toBe(200);expect(f.tables.fileObject[0].status).toBe('PENDING_UPLOAD');
  });
  it('rejects invalid provider geometry without freeing or charging bytes',async()=>{
    const f=multipartFixture();const s=await f.start();f.storage.listMultipartParts.mockRejectedValueOnce(new StorageError('PARTS_INVALID'));
    await expect(f.service.complete(owner,s.transferId)).rejects.toMatchObject({code:'TRANSFER_PARTS_INVALID'});
    expect(f.tables.multipartTransfer[0]).toMatchObject({state:'REJECTED',cleanupState:'CLEANUP_BLOCKED'});
    expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));expect(f.storage.completeMultipart).not.toHaveBeenCalled();
  });
  it('parallel complete creates one immutable manifest and one SDK operation',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const waiting=gate<any>();f.storage.completeMultipart.mockReturnValueOnce(waiting.promise);
    const first=f.service.complete(owner,s.transferId);await flush();expect(f.storage.completeMultipart).toHaveBeenCalledTimes(1);
    expect((await f.makeService().complete(owner,s.transferId)).status).toBe(202);waiting.resolve({etag:'"opaque-complete"'});await first;
    expect((await f.service.complete(owner,s.transferId)).status).toBe(200);expect(f.storage.completeMultipart).toHaveBeenCalledTimes(1);expect(f.tables.multipartManifestPart).toHaveLength(1);
  });
  it('adopts a verified object after lost complete response without a replacement upload or fake closure',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const original=f.storage.completeMultipart.getMockImplementation()!;
    f.storage.completeMultipart.mockImplementationOnce(async input=>{await original(input);throw new MultipartMutationError('UNAVAILABLE','unknown');});
    expect((await f.service.complete(owner,s.transferId)).status).toBe(202);advance(3000);
    expect((await f.makeService().status(owner,s.transferId)).state).toBe('STORED');expect(f.storage.completeMultipart).toHaveBeenCalledTimes(1);
    expect(f.tables.multipartIoOperation.find(r=>r.kind==='COMPLETE')).toMatchObject({state:'UNKNOWN',settledAt:null});
    await f.service.confirmFile(owner,s.fileId);expect(f.tables.processingJob).toHaveLength(1);expect(f.tables.user[0].reservedStorageBytes).toBe(0n);
  });
  it('retries the same manifest after a crash before complete effect, fencing out the old late result',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const waiting=gate<any>();f.storage.completeMultipart.mockReturnValueOnce(waiting.promise);
    const old=f.service.complete(owner,s.transferId);await flush();advance(91000);
    expect((await f.makeService().status(owner,s.transferId)).state).toBe('STORED');expect(f.storage.completeMultipart).toHaveBeenCalledTimes(2);
    expect(f.storage.completeMultipart.mock.calls[0][0]).toEqual(f.storage.completeMultipart.mock.calls[1][0]);
    const fence=f.tables.multipartTransfer[0].fence;waiting.resolve({etag:'"late-old"'});await old;
    expect(f.tables.multipartTransfer[0]).toMatchObject({state:'STORED',fence,storedETag:'"opaque-complete"'});
    expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('caps durable complete attempts instead of resetting retry budget on each HTTP replay',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);f.storage.completeMultipart.mockRejectedValue(new MultipartMutationError('UNAVAILABLE','unknown'));
    await f.service.complete(owner,s.transferId);for(let i=0;i<5;i++){advance(60000);await f.makeService().complete(owner,s.transferId);}
    expect(f.storage.completeMultipart).toHaveBeenCalledTimes(3);expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
  it('parallel confirms finalize original, reservation, audit and job exactly once',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);
    const waiting=gate<any>();f.storage.verifyMultipartObject.mockReturnValueOnce(waiting.promise);const first=f.service.confirmFile(owner,s.fileId);await flush();
    expect((await f.makeService().confirmFile(owner,s.fileId))!.status).toBe(202);waiting.resolve({etag:'"opaque-complete"',sha256:hash,prefix:image.subarray(0,16)});await first;
    const calls=f.storage.verifyMultipartObject.mock.calls.length;expect((await f.service.confirmFile(owner,s.fileId))!.status).toBe(200);
    expect(f.storage.verifyMultipartObject).toHaveBeenCalledTimes(calls);expect(f.tables.processingJob).toHaveLength(1);expect(f.tables.auditEvent).toHaveLength(1);
    expect(f.tables.user[0]).toMatchObject({reservedStorageBytes:0n,usedStorageBytes:100n+BigInt(image.length)});expect(f.tables.uploadOperation[0].state).toBe('FINALIZED');
  });
  it.each(['fileObject.update','uploadOperation.update','user.update','processingJob.create','auditEvent.create'])('finalization failure at %s rolls every accounting/job write back',async checkpoint=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);f.fail(checkpoint);
    await expect(f.service.confirmFile(owner,s.fileId)).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
    expect(f.tables.fileObject[0].status).toBe('PENDING_UPLOAD');expect(f.tables.user[0]).toMatchObject({reservedStorageBytes:BigInt(image.length),usedStorageBytes:100n});
    expect(f.tables.processingJob).toHaveLength(0);expect(f.tables.auditEvent).toHaveLength(0);advance(91000);await f.makeService().confirmFile(owner,s.fileId);
    expect(f.tables.processingJob).toHaveLength(1);expect(f.tables.user[0].reservedStorageBytes).toBe(0n);
  });
  it('lost finalization commit response replays ACTIVE without re-reading/charging or enqueueing',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);
    const original=f.storage.verifyMultipartObject.getMockImplementation()!;f.storage.verifyMultipartObject.mockImplementationOnce(async input=>{const result=await original(input);f.loseNextCommit();return result;});
    await expect(f.service.confirmFile(owner,s.fileId)).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
    expect(f.tables.fileObject[0].status).toBe('ACTIVE');await f.makeService().confirmFile(owner,s.fileId);
    expect(f.storage.verifyMultipartObject).toHaveBeenCalledTimes(1);expect(f.tables.processingJob).toHaveLength(1);expect(f.tables.auditEvent).toHaveLength(1);
  });
  it.each(['hash','signature'])('rejects wrong %s and preserves original reservation',async mode=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);
    f.storage.verifyMultipartObject.mockResolvedValueOnce({etag:'"opaque-complete"',sha256:mode==='hash'?'b'.repeat(64):hash,prefix:mode==='signature'?Buffer.from('<html>'):image.subarray(0,16)});
    await expect(f.service.confirmFile(owner,s.fileId)).rejects.toMatchObject({code:'UPLOAD_VALIDATION_FAILED'});
    expect(f.tables.fileObject[0].status).toBe('PENDING_UPLOAD');expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));expect(f.tables.processingJob).toHaveLength(0);
  });
  it('cancel wins over late complete and repeats no abort or release',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const waiting=gate<any>();f.storage.completeMultipart.mockReturnValueOnce(waiting.promise);
    const old=f.service.complete(owner,s.transferId);const assertion=expect(old).rejects.toMatchObject({code:'UPLOAD_CANCELLED'});await flush();
    await f.service.cancel(owner,s.transferId);waiting.resolve({etag:'"late"'});await assertion;await f.service.cancel(owner,s.transferId);
    expect(f.storage.abortMultipart).toHaveBeenCalledTimes(1);expect(f.tables.multipartTransfer[0]).toMatchObject({state:'CANCELLED',cleanupState:'CLEANUP_BLOCKED'});
    expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));expect(f.tables.processingJob).toHaveLength(0);
  });
  it('expiry during hash validation cannot activate and grant renewal never extends the import',async()=>{
    const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);const deadline=+f.tables.importSession[0].expiresAt;
    f.storage.verifyMultipartObject.mockImplementationOnce(async()=>{jest.setSystemTime(new Date(deadline));return{etag:'"opaque-complete"',sha256:hash,prefix:image.subarray(0,16)};});
    await expect(f.service.confirmFile(owner,s.fileId)).rejects.toMatchObject({code:'UPLOAD_EXPIRED'});expect(+f.tables.importSession[0].expiresAt).toBe(deadline);
    expect(f.tables.multipartTransfer[0].state).toBe('EXPIRED');expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
  });
});

it('ACTIVE multipart confirm remains valid after a successful receipt has been pruned',async()=>{
  const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);await f.service.confirmFile(owner,s.fileId);
  f.tables.multipartTransfer=[];f.tables.uploadOperation=[];
  const before=f.storage.verifyMultipartObject.mock.calls.length;expect((await f.makeService().confirmFile(owner,s.fileId))!.status).toBe(200);
  expect(f.storage.verifyMultipartObject).toHaveBeenCalledTimes(before);expect(f.tables.processingJob).toHaveLength(1);
});
it('lost stored-result DB response never issues a replacement complete',async()=>{
  const f=multipartFixture();const s=await f.start();f.ready(s.transferId);const original=f.storage.completeMultipart.getMockImplementation()!;
  f.storage.completeMultipart.mockImplementationOnce(async input=>{const result=await original(input);f.loseNextCommit();return result;});
  await expect(f.service.complete(owner,s.transferId)).rejects.toMatchObject({code:'DATABASE_UNAVAILABLE'});
  expect((await f.makeService().complete(owner,s.transferId)).status).toBe(200);expect(f.storage.completeMultipart).toHaveBeenCalledTimes(1);
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});
it('deadline elapsed during final DB work rolls back writes, then persists EXPIRED separately',async()=>{
  const f=multipartFixture();const s=await f.start();f.ready(s.transferId);await f.service.complete(owner,s.transferId);
  const original=f.processing.enqueueConfirmedFile.getMockImplementation()!;
  f.processing.enqueueConfirmedFile.mockImplementationOnce(async(tx,file)=>{const result=await original(tx,file);jest.setSystemTime(f.tables.importSession[0].expiresAt);return result;});
  await expect(f.service.confirmFile(owner,s.fileId)).rejects.toMatchObject({code:'UPLOAD_EXPIRED'});
  expect(f.tables.multipartTransfer[0].state).toBe('EXPIRED');expect(f.tables.fileObject[0].status).toBe('PENDING_UPLOAD');expect(f.tables.processingJob).toHaveLength(0);
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});
