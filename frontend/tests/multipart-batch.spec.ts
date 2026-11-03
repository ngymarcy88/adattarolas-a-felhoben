import { afterEach, expect, it, vi } from 'vitest';
import { fixture, id, image, item, transfer, settled } from './helpers/multipart-fixture';
import { UploadRequestError } from '../src/api/uploads';
import { hashImage } from '../src/upload/multipart-batch';
afterEach(()=>vi.useRealTimers());
it('hashes actual bytes rather than name or modification time',async()=>{
 const a=image();expect(await hashImage(a)).toMatch(/^[a-f0-9]{64}$/);expect(await hashImage(new File([a],'renamed.png'))).toBe(await hashImage(a));expect(await hashImage(new File(['other'],'image.png'))).not.toBe(await hashImage(a));
});
it('uses at most two global workers and coalesces successful ACTIVE notifications',async()=>{
 const f=fixture();const releases:(()=>void)[]=[];let running=0,max=0;
 f.driver.mockImplementation(()=>new Promise<void>(resolve=>{running++;max=Math.max(max,running);releases.push(()=>{running--;resolve();});}));
 f.batch.add([image(),image(),image()]);f.batch.start();await vi.waitFor(()=>expect(releases).toHaveLength(2));expect(f.client.createImport).toHaveBeenCalledTimes(1);expect(f.batch.state.completionVersion).toBe(0);
 releases[0]();await vi.waitFor(()=>expect(releases).toHaveLength(3));expect(f.batch.state.completionVersion).toBe(0);releases[1]();releases[2]();await settled(f);expect(max).toBe(2);expect(f.batch.summary.value.success).toBe(3);expect(f.batch.state.completionVersion).toBe(1);f.batch.dispose();
});
it('keeps one file failure isolated and notifies the partial ACTIVE success once',async()=>{
 const f=fixture();f.client.confirm.mockRejectedValueOnce(new UploadRequestError('UPLOAD_VALIDATION_FAILED'));f.batch.add([image(),image()]);f.batch.start();await settled(f);expect(f.batch.summary.value).toMatchObject({success:1,failed:1});expect(f.batch.state.completionVersion).toBe(1);f.batch.dispose();
});
it('does not treat pending confirm or successful binary upload as ACTIVE',async()=>{
 const f=fixture();f.client.confirm.mockResolvedValue({file:null,transfer:transfer({state:'CONFIRMING'}),retryAfterMs:2000} as never);f.batch.add([image()]);f.batch.start();await settled(f);expect(f.driver).toHaveBeenCalledTimes(1);expect(f.batch.state.completionVersion).toBe(0);expect(f.batch.state.rows[0].status).toBe('error');f.batch.dispose();
});
it('retains stable init identity after response loss and never starts a replacement import',async()=>{
 const f=fixture();f.client.initiate.mockRejectedValueOnce(new UploadRequestError('UNAVAILABLE'));f.batch.add([image()]);f.batch.start();await settled(f);const first=f.client.initiate.mock.calls[0];f.batch.retry(f.batch.state.rows[0].id);await settled(f);expect(f.client.initiate.mock.calls[1].slice(0,3)).toEqual(first.slice(0,3));expect(f.client.createImport).toHaveBeenCalledTimes(1);f.batch.dispose();
});
it('fresh instance restores server imports; missing local bytes never sends a PUT',async()=>{
 const f=fixture();await f.batch.discover();await f.batch.open(id(99));expect(f.batch.state.rows[0].status).toBe('needs-file');f.batch.retry(id(50));await settled(f);expect(f.batch.state.rows[0].status).toBe('needs-file');expect(f.driver).not.toHaveBeenCalled();expect(f.hash).not.toHaveBeenCalled();expect(f.client.initiate).not.toHaveBeenCalled();f.batch.dispose();
});
it('verifies reselected content hash through resume before calling the real transfer driver',async()=>{
 const f=fixture();await f.batch.open(id(99));f.batch.attach(id(50),image());f.batch.retry(id(50));await settled(f);expect(f.client.resume).toHaveBeenCalledWith(id(),{sizeBytes:16,contentSha256:'a'.repeat(64)},expect.any(AbortSignal));expect(f.driver).toHaveBeenCalledTimes(1);expect(f.client.initiate).not.toHaveBeenCalled();f.batch.dispose();
});
it('mismatched source prevents part upload and does not create a replacement session',async()=>{
 const f=fixture();f.client.resume.mockRejectedValue(new UploadRequestError('TRANSFER_SOURCE_MISMATCH'));await f.batch.open(id(99));f.batch.attach(id(50),image());f.batch.retry(id(50));await settled(f);expect(f.batch.state.rows[0].error).toContain('tartalma eltér');expect(f.driver).not.toHaveBeenCalled();expect(f.client.initiate).not.toHaveBeenCalled();f.batch.dispose();
});
it('rejects a wrong reselected size before hashing or requesting grants',async()=>{
 const f=fixture();await f.batch.open(id(99));f.batch.attach(id(50),new File(['wrong'],'other.png'));expect(f.batch.state.rows[0].error).toContain('mérete eltér');expect(f.hash).not.toHaveBeenCalled();expect(f.driver).not.toHaveBeenCalled();f.batch.dispose();
});
it.each(['STORED','CONFIRMING','SUCCEEDED'] as const)('finalizes %s without re-upload or local re-selection',async state=>{
 const f=fixture();f.client.status.mockResolvedValue(transfer({state}));f.client.getImport.mockResolvedValue({import:{} as never,items:[item({transfer:transfer({state:state==='SUCCEEDED'?'OPEN':state})})],nextCursor:null});await f.batch.open(id(99));f.batch.retry(id(50));await settled(f);expect(f.client.confirm).toHaveBeenCalledTimes(1);expect(f.driver).not.toHaveBeenCalled();expect(f.hash).not.toHaveBeenCalled();expect(f.batch.summary.value.success).toBe(1);f.batch.dispose();
});
it('already successful persisted files remain successful with no new notification or requests',async()=>{
 const f=fixture();f.client.getImport.mockResolvedValue({import:{} as never,items:[item({transfer:transfer({state:'SUCCEEDED'})})],nextCursor:null});await f.batch.open(id(99));f.batch.retry(id(50));f.batch.start();expect(f.batch.summary.value.success).toBe(1);expect(f.batch.state.completionVersion).toBe(0);expect(f.client.confirm).not.toHaveBeenCalled();expect(f.driver).not.toHaveBeenCalled();f.batch.dispose();
});
it('fully received parts complete without local bytes and without another PUT',async()=>{
 const f=fixture();f.client.status.mockResolvedValue(transfer({completedBytes:16,parts:[{partNumber:1,sizeBytes:16}]}));await f.batch.open(id(99));f.batch.retry(id(50));await settled(f);expect(f.client.complete).toHaveBeenCalledTimes(1);expect(f.client.confirm).toHaveBeenCalledTimes(1);expect(f.driver).not.toHaveBeenCalled();f.batch.dispose();
});
it('manual pause aborts local work without terminal server cancellation',async()=>{
 const f=fixture();f.driver.mockImplementation((_file,_t,signal)=>new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true})));
 f.batch.add([image()]);f.batch.start();await vi.waitFor(()=>expect(f.driver).toHaveBeenCalledTimes(1));f.batch.pauseAll();await settled(f);expect(f.batch.state.rows[0].status).toBe('paused');expect(f.client.cancel).not.toHaveBeenCalled();expect(f.batch.state.completionVersion).toBe(0);f.driver.mockResolvedValue(undefined);f.batch.retry(f.batch.state.rows[0].id);await settled(f);expect(f.client.initiate).toHaveBeenCalledTimes(1);expect(f.batch.summary.value.success).toBe(1);f.batch.dispose();
});
it('explicit terminal cancellation preserves the server-held reservation status',async()=>{
 const f=fixture();await f.batch.open(id(99));await f.batch.cancel(id(50));expect(f.batch.state.rows[0].status).toBe('cancelled');expect(f.batch.state.rows[0].transfer?.reservationState).toBe('HELD');expect(f.driver).not.toHaveBeenCalled();f.batch.dispose();
});
it('logout/401 stops further queued files and never emits a false success',async()=>{
 const f=fixture();f.client.createImport.mockRejectedValue(new UploadRequestError('AUTH_REQUIRED'));f.batch.add([image(),image(),image()]);f.batch.start();await settled(f);expect(f.batch.state.authRequired).toBe(true);expect(f.client.initiate).not.toHaveBeenCalled();expect(f.batch.state.completionVersion).toBe(0);f.batch.dispose();
});
it('respects Retry-After without an automatic retry storm',async()=>{
 const f=fixture();f.client.createImport.mockRejectedValue(new UploadRequestError('RATE_LIMITED',60000));f.batch.add([image(),image(),image()]);f.batch.start();await settled(f);expect(f.client.createImport).toHaveBeenCalledTimes(1);expect(f.batch.state.cooldownUntil).toBeGreaterThan(Date.now());expect(f.batch.state.rows[2].status).toBe('queued');f.batch.start();expect(f.client.createImport).toHaveBeenCalledTimes(1);f.batch.dispose();
});
it('disposal fences out a delayed hash and does not create a durable operation',async()=>{
 const f=fixture();let resolve!:(hash:string)=>void;f.hash.mockImplementation(()=>new Promise<string>(r=>{resolve=r;}));f.batch.add([image()]);f.batch.start();await vi.waitFor(()=>expect(f.hash).toHaveBeenCalledTimes(1));f.batch.dispose();resolve('a'.repeat(64));await settled(f);expect(f.client.createImport).not.toHaveBeenCalled();expect(f.client.initiate).not.toHaveBeenCalled();expect(f.batch.state.completionVersion).toBe(0);
});
it('restores all import pages once and rejects cyclic cursors without replacing existing rows',async()=>{
 const f=fixture();f.client.getImport.mockResolvedValueOnce({import:{} as never,items:[item()],nextCursor:'next'}).mockResolvedValueOnce({import:{} as never,items:[item({clientFileId:id(52),fileId:id(53)})],nextCursor:null});await f.batch.open(id(99));expect(f.batch.state.rows).toHaveLength(2);f.client.getImport.mockResolvedValue({import:{} as never,items:[],nextCursor:'loop'});await f.batch.open(id(98));expect(f.batch.state.rows).toHaveLength(2);expect(f.batch.state.loadError).not.toBe('');f.batch.dispose();
});

it('terminal cancel cannot exceed the global two-operation budget',async()=>{
 const f=fixture();await f.batch.open(id(99));f.batch.add([image(),image()]);const releases:(()=>void)[]=[];
 f.driver.mockImplementation(()=>new Promise<void>(r=>releases.push(r)));f.batch.start();await vi.waitFor(()=>expect(releases).toHaveLength(2));
 await f.batch.cancel(id(50));expect(f.client.cancel).not.toHaveBeenCalled();expect(f.batch.state.running).toBe(2);releases.forEach(r=>r());await settled(f);f.batch.dispose();
});
