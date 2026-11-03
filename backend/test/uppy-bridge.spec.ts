import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UppyController, UppySameOriginGuard } from '../src/multipart/uppy.controller';
import { SessionGuard } from '../src/auth/session.guard';
import { OriginGuard } from '../src/auth/origin.guard';
import { MultipartLimits } from '../src/multipart/multipart.limit';
import { multipartFixture, multipartOwner as owner, multipartOther as other } from './helpers/multipart-fixture';
const response=()=>{const r={setHeader:jest.fn(),json:jest.fn(),status:jest.fn(),end:jest.fn()};r.status.mockReturnValue(r);return r;};
const request=(id=owner)=>({user:{id}} as never);
function controller(){const f=multipartFixture();return{...f,controller:new UppyController(f.service,f.store,new MultipartLimits(),f.config)};}
it('requires a current session and same-origin fetch metadata on every compatibility operation',()=>{
 expect(Reflect.getMetadata(GUARDS_METADATA,UppyController)).toEqual([SessionGuard,UppySameOriginGuard]);
 for(const name of ['create','complete','detach'] as const)expect(Reflect.getMetadata(GUARDS_METADATA,UppyController.prototype[name])).toEqual([OriginGuard]);
});
it.each([undefined,'cross-site','same-site','none'])('rejects non-same-origin fetch metadata %s even with a cookie',site=>{
 const guard=new UppySameOriginGuard(new ConfigService({app:{frontendPublicUrl:'http://localhost:5173'}}));
 const context={switchToHttp:()=>({getRequest:()=>({headers:{cookie:'synthetic', 'sec-fetch-site':site}})})} as never;
 expect(()=>guard.canActivate(context)).toThrow(expect.objectContaining({code:'ORIGIN_NOT_ALLOWED'}));
});
it('rejects an explicit mismatched Origin and accepts normal same-origin browser requests',()=>{
 const guard=new UppySameOriginGuard(new ConfigService({app:{frontendPublicUrl:'http://localhost:5173'}}));
 const headers:Record<string,string>={'sec-fetch-site':'same-origin'};const c={switchToHttp:()=>({getRequest:()=>({headers})})} as never;expect(guard.canActivate(c)).toBe(true);headers.origin='http://foreign.invalid';expect(()=>guard.canActivate(c)).toThrow();
});
it('create attaches to an existing owner-bound transfer without a second provider session/reservation',async()=>{
 const f=controller(),s=await f.start(),r=response(),before=f.tables.user[0].reservedStorageBytes;
 await f.controller.create(request(),{filename:s.transferId,type:'image/png',metadata:{}},{},r as never);
 expect(r.json).toHaveBeenCalledWith({key:s.transferId,uploadId:s.transferId});expect(f.storage.initiateMultipart).toHaveBeenCalledTimes(1);expect(f.tables.user[0].reservedStorageBytes).toBe(before);
});
it('compatibility handles and payload cannot choose a storage key/provider uploadId',async()=>{
 const f=controller(),s=await f.start();await expect(f.controller.sign(request(),s.transferId,'1',{key:'originals/forged'},response() as never)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 await expect(f.controller.create(request(),{filename:s.transferId,type:'image/png',metadata:{storageKey:'forged'}},{},response() as never)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 expect(f.storage.createMultipartPartAccess).not.toHaveBeenCalled();
});
it('returns only fresh completed part numbers/ETags; storage identities never reach the library',async()=>{
 const f=controller(),s=await f.start(),r=response();f.ready(s.transferId);await f.controller.parts(request(),s.transferId,{key:s.transferId},r as never);
 expect(r.json).toHaveBeenCalledWith([{PartNumber:1,ETag:'"part-1"'}]);expect(JSON.stringify(r.json.mock.calls)).not.toContain('providerUploadId');
});
it('ignores a forged client complete manifest and relies on fresh service ListParts',async()=>{
 const f=controller(),s=await f.start(),r=response();f.ready(s.transferId);
 await f.controller.complete(request(),s.transferId,{key:s.transferId},{parts:[{PartNumber:1,ETag:'forged-client-etag'}]},r as never);
 expect(f.storage.completeMultipart.mock.calls[0][0].parts).toEqual([{partNumber:1,sizeBytes:s.input.sizeBytes,etag:'"part-1"'}]);expect(f.tables.fileObject[0].status).toBe('PENDING_UPLOAD');expect(f.tables.user[0].usedStorageBytes).toBe(100n);expect(f.tables.processingJob).toHaveLength(0);expect(r.json.mock.calls[0][0]).toMatchObject({key:s.transferId});
});
it('incomplete storage parts never return a library completion success',async()=>{
 const f=controller(),s=await f.start();await expect(f.controller.complete(request(),s.transferId,{key:s.transferId},{parts:[{PartNumber:1,ETag:'forged'}]},response() as never)).rejects.toMatchObject({code:'UPLOAD_PARTS_INCOMPLETE'});expect(f.storage.completeMultipart).not.toHaveBeenCalled();
});
it('destroy/pause detach cannot abort provider work, cancel transfer or release reservation',async()=>{
 const f=controller(),s=await f.start(),r=response();await f.controller.detach(request(),s.transferId,{key:s.transferId},undefined,r as never);
 expect(r.status).toHaveBeenCalledWith(204);expect(f.tables.multipartTransfer[0].state).toBe('OPEN');expect(f.storage.abortMultipart).not.toHaveBeenCalled();expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(s.input.sizeBytes));
});
it('foreign owner is denied on list/sign/complete/detach before receiving any capability',async()=>{
 const f=controller(),s=await f.start();
 await expect(f.controller.parts(request(other),s.transferId,{key:s.transferId},response() as never)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
 await expect(f.controller.sign(request(other),s.transferId,'1',{key:s.transferId},response() as never)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
 await expect(f.controller.complete(request(other),s.transferId,{key:s.transferId},{parts:[{PartNumber:1,ETag:'tag'}]},response() as never)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
 await expect(f.controller.detach(request(other),s.transferId,{key:s.transferId},undefined,response() as never)).rejects.toMatchObject({code:'TRANSFER_NOT_FOUND'});
 expect(f.storage.createMultipartPartAccess).not.toHaveBeenCalled();expect(f.storage.completeMultipart).not.toHaveBeenCalled();
});
it('terminal cancel and expired transfers cannot issue part access',async()=>{
 const f=controller(),s=await f.start();await f.service.cancel(owner,s.transferId);
 await expect(f.controller.sign(request(),s.transferId,'1',{key:s.transferId},response() as never)).rejects.toMatchObject({code:'UPLOAD_CANCELLED'});expect(f.storage.createMultipartPartAccess).not.toHaveBeenCalled();
});

it.each(['GET','DELETE'])('rejects a body on compatibility %s',method=>{
 const guard=new UppySameOriginGuard(new ConfigService({app:{frontendPublicUrl:'http://localhost:5173'}}));
 const context={switchToHttp:()=>({getRequest:()=>({method,body:{forged:true},headers:{'sec-fetch-site':'same-origin'}})})} as never;
 expect(()=>guard.canActivate(context)).toThrow(expect.objectContaining({code:'VALIDATION_ERROR'}));
});

it('never hands the credential-less library a same-origin PUT URL that would attach application cookies',async()=>{
 const f=controller(),s=await f.start();f.storage.createMultipartPartAccess.mockImplementationOnce(async input=>({method:'PUT',url:f.configData.frontendPublicUrl+'/unsafe',expiresAt:input.expiresAt,partNumber:input.partNumber,sizeBytes:s.input.sizeBytes,headers:{}}));
 await expect(f.controller.sign(request(),s.transferId,'1',{key:s.transferId},response() as never)).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
});
