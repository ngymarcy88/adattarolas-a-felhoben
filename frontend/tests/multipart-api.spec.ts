import { afterEach, expect, it, vi } from 'vitest';
import { createMultipartClient, parseTransfer } from '../src/api/multipart';
const id='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const date='2026-11-03T10:00:00.000Z';
const transfer=()=>({id,state:'OPEN',revision:0,partSizeBytes:5242880,partCount:2,expiresAt:date,completedBytes:5242880,partsObservedAt:date,parts:[{partNumber:1,sizeBytes:5242880}],cleanupState:'NOT_REQUIRED',reservationState:'HELD',lastErrorCode:null});
const imported=()=>({id,state:'OPEN',createdAt:'2026-11-02T10:00:00.000Z',expiresAt:date,acceptedFileCount:1});
const item=()=>({clientFileId:other,fileId:id,originalName:'a.png',mimeType:'image/png',sizeBytes:5242881,transfer:transfer()});
const client=()=>createMultipartClient('http://api.invalid/api/v1');
const signal=()=>new AbortController().signal;
function reply(data: unknown, status=200, headers: Record<string,string>={}) {const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}}));vi.stubGlobal('fetch',fetch);return fetch;}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('keeps cookie-auth JSON control plane separate from storage and sends stable init key',async()=>{
 const fetch=reply({item:item()},201);const input={clientFileId:other,originalName:'a.png',mimeType:'image/png',sizeBytes:5242881,contentSha256:'a'.repeat(64)};
 expect((await client().initiate(id,input,other,signal())).fileId).toBe(id);
 const [url,options]=fetch.mock.calls[0];expect(url).toBe(`http://api.invalid/api/v1/imports/${id}/files`);expect(options).toMatchObject({method:'POST',credentials:'include',cache:'no-store',redirect:'error',body:JSON.stringify(input),headers:{'Idempotency-Key':other,'Content-Type':'application/json'}});
});
it('retrieves persisted imports/items with cursors without browser storage',async()=>{
 const fetch=reply({items:[imported()],nextCursor:'opaque_cursor'});expect((await client().listImports(null,signal())).items[0].id).toBe(id);
 expect(fetch.mock.calls[0][1].method).toBe('GET');reply({import:imported(),items:[item()],nextCursor:null});expect((await client().getImport(id,'opaque_cursor',signal())).items[0].transfer.parts).toEqual([{partNumber:1,sizeBytes:5242880}]);
});
it('creates imports with exact empty JSON and stable idempotency key',async()=>{
 const fetch=reply({import:imported()},201);await client().createImport(other,signal());expect(fetch.mock.calls[0][1]).toMatchObject({body:'{}',headers:{'Idempotency-Key':other}});
});
it.each(['storageKey','url','ownerId','providerUploadId','etag','leaseOwner'])('rejects private/unexpected transfer field %s',field=>{
 expect(()=>parseTransfer({...transfer(),[field]:'private'})).toThrow(expect.objectContaining({code:'UNAVAILABLE'}));
});
it.each([
 {completedBytes:1},{partCount:0},{revision:-1},{parts:[{partNumber:1,sizeBytes:5242880},{partNumber:1,sizeBytes:1}]},
 {partSizeBytes:5242881},{partsObservedAt:'invalid'},{state:'PROVIDER_INTERNAL'},
])('rejects corrupt transfer geometry/state %#',patch=>expect(()=>parseTransfer({...transfer(),...patch})).toThrow());
it('does not trust a different returned resource identity',async()=>{
 reply({transfer:{...transfer(),id:other}});await expect(client().status(id,signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it('validates exact bytes for stored parts in import items',async()=>{
 reply({import:imported(),items:[{...item(),sizeBytes:1}],nextCursor:null});await expect(client().getImport(id,null,signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it('resumes using file size and full content hash, never name/mtime alone',async()=>{
 const fetch=reply({transfer:transfer()});await client().resume(id,{sizeBytes:5242881,contentSha256:'b'.repeat(64)},signal());expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({sizeBytes:5242881,contentSha256:'b'.repeat(64)});
});
it('complete sends no client manifest and handles a pending response without claiming success',async()=>{
 const fetch=reply({transfer:{...transfer(),state:'COMPLETE_UNKNOWN'}},202,{'Retry-After':'2'});const result=await client().complete(id,signal());expect(result.pending).toBe(true);expect(result.retryAfterMs).toBe(2000);expect(fetch.mock.calls[0][1].body).toBe('{}');
});
it('confirm remains bodyless and accepts 202 distinctly from ACTIVE',async()=>{
 const fetch=reply({transfer:{...transfer(),state:'CONFIRMING'}},202,{'Retry-After':'2'});expect((await client().confirm(id,signal())).file).toBeNull();expect(fetch.mock.calls[0][1].body).toBeUndefined();expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
 const file={id,status:'ACTIVE',originalName:'a.png',mimeType:'image/png',detectedMimeType:'image/png',sizeBytes:5242881,confirmBy:date};reply({file});expect((await client().confirm(id,signal())).file).toEqual(file);
});
it('sign exposes only a validated ephemeral part PUT grant',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
 const access={method:'PUT',partNumber:2,sizeBytes:1,url:'http://storage.invalid/synthetic-part',headers:{},expiresAt:'2026-11-02T10:02:00.000Z'};reply(access);expect(await client().sign(id,2,signal())).toEqual(access);
 reply({...access,headers:{Authorization:'private'}});await expect(client().sign(id,2,signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it.each(['http://user:password@storage.invalid/object','javascript:alert(1)','invalid'])('rejects unsafe part URL without leaking it: %#',async url=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));reply({method:'PUT',partNumber:1,sizeBytes:1,url,headers:{},expiresAt:date});await expect(client().sign(id,1,signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it('keeps safe error codes and cooldown while discarding provider text',async()=>{
 reply({error:{code:'TRANSFER_SOURCE_MISMATCH',message:'private provider text'}},409);await expect(client().resume(id,{sizeBytes:1,contentSha256:'a'.repeat(64)},signal())).rejects.toMatchObject({code:'TRANSFER_SOURCE_MISMATCH'});
 reply({error:{code:'ProviderRawError',message:'private provider text'}},503);await expect(client().status(id,signal())).rejects.toMatchObject({code:'UNAVAILABLE'});
 reply({},429,{'Retry-After':'7'});await expect(client().status(id,signal())).rejects.toMatchObject({code:'RATE_LIMITED',retryAfterMs:7000});
});
it('aborts during body consumption and rejects late parsed data',async()=>{
 const c=new AbortController();vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:200,headers:new Headers(),json:async()=>{c.abort();return{transfer:transfer()};}}));await expect(client().status(id,c.signal)).rejects.toMatchObject({code:'UNAVAILABLE'});
});
it('cancel is explicit and keeps the server cleanup/reservation state',async()=>{
 const fetch=reply({transfer:{...transfer(),state:'CANCELLED',cleanupState:'CLEANUP_BLOCKED'}},202);expect((await client().cancel(id,signal())).reservationState).toBe('HELD');expect(fetch.mock.calls[0][0]).toContain('/cancel');
});
