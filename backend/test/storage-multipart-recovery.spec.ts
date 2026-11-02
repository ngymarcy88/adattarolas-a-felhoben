import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, HeadBucketCommand, ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { validateEnvironment } from '../src/config/environment';
import { S3StorageAdapter } from '../src/storage/s3-storage.adapter';
import { originalStorageKey } from '../src/storage/storage-key';
const id='abcdef00-0000-4000-8000-000000000001';const key=originalStorageKey(id,id);const bytes=Buffer.from([0x89,0x50,0x4e,0x47,0xd,0xa,0x1a,0xa]);
const input={key,transferId:id,sizeBytes:bytes.length,partSizeBytes:5242880};
const config=validateEnvironment({DATABASE_URL:'postgresql://unit:unit@localhost/db',JWT_SECRET:'unit-only-secret-longer-than-32-characters',FRONTEND_PUBLIC_URL:'http://localhost:5173',
  BACKEND_PUBLIC_URL:'http://localhost:3000',S3_ENDPOINT:'http://minio:9000',S3_REGION:'us-east-1',S3_BUCKET:'unit-bucket',S3_ACCESS_KEY_ID:'unit-access',S3_SECRET_ACCESS_KEY:'unit-secret'});
function fixture(){const send=jest.fn();return{send,adapter:new S3StorageAdapter(config,{client:{send,destroy:jest.fn()}as unknown as S3Client})};}
const head=()=>({ContentLength:bytes.length,ETag:'"opaque"',VersionId:'version-1',$metadata:{httpStatusCode:200},Metadata:{'cloudvault-transfer-id':id,'cloudvault-size-bytes':String(bytes.length),'cloudvault-part-size-bytes':'5242880'}});
const body=()=>({ContentLength:bytes.length,ETag:'"opaque"',VersionId:'version-1',$metadata:{httpStatusCode:200},Body:Readable.from([bytes.subarray(0,3),bytes.subarray(3)])});
it('discovers only the exact original key across bounded upload markers',async()=>{
  const f=fixture();f.send.mockResolvedValueOnce({$metadata:{httpStatusCode:200},Bucket:config.storage.bucket,IsTruncated:true,Uploads:[{Key:key,UploadId:'first'}],NextKeyMarker:key,NextUploadIdMarker:'first'})
    .mockResolvedValueOnce({$metadata:{httpStatusCode:200},Bucket:config.storage.bucket,IsTruncated:false,Uploads:[{Key:key+'-other',UploadId:'ignored'},{Key:key,UploadId:'second'}]});
  await expect(f.adapter.findMultipartUploads(key)).resolves.toEqual(['first','second']);expect(f.send.mock.calls[0][0]).toBeInstanceOf(ListMultipartUploadsCommand);
  expect(f.send.mock.calls[1][0].input).toMatchObject({Prefix:key,KeyMarker:key,UploadIdMarker:'first'});
});
it.each([
  {Bucket:'foreign',IsTruncated:false},{Bucket:config.storage.bucket,IsTruncated:true,Uploads:[]},
  {Bucket:config.storage.bucket,IsTruncated:false,Uploads:[{Key:'foreign',UploadId:'id'}]},
  {Bucket:config.storage.bucket,IsTruncated:false,Uploads:Array.from({length:101},()=>({Key:key,UploadId:'id'}))},
])('rejects unsafe upload discovery response %#',async result=>{const f=fixture();f.send.mockResolvedValue({$metadata:{httpStatusCode:200},...result});await expect(f.adapter.findMultipartUploads(key)).rejects.toMatchObject({code:'INVALID_RESPONSE'});});
it('streams content hash and prefix while pinning the HEAD identity/version',async()=>{
  const f=fixture();const output=body();f.send.mockResolvedValueOnce(head()).mockResolvedValueOnce(output);
  await expect(f.adapter.verifyMultipartObject(input)).resolves.toEqual({etag:'"opaque"',sha256:createHash('sha256').update(bytes).digest('hex'),prefix:bytes});
  expect(f.send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);expect(f.send.mock.calls[1][0].input).toMatchObject({IfMatch:'"opaque"',VersionId:'version-1'});expect(output.Body.destroyed).toBe(true);
});
it.each(['foreign-transfer','size','expected-etag'])('refuses mismatched object %s before reading',async mode=>{
  const f=fixture();const result=head();if(mode==='foreign-transfer')result.Metadata['cloudvault-transfer-id']='foreign';if(mode==='size')result.ContentLength++;
  f.send.mockResolvedValue(result);await expect(f.adapter.verifyMultipartObject({...input,...(mode==='expected-etag'?{etag:'"changed"'}:{})})).rejects.toMatchObject({code:mode==='size'?'CONTENT_MISMATCH':'OBJECT_CHANGED'});expect(f.send).toHaveBeenCalledTimes(1);
});
it('does not confuse bucket failure with absent original',async()=>{
  const f=fixture();f.send.mockRejectedValueOnce({name:'NotFound',$metadata:{httpStatusCode:404}}).mockRejectedValueOnce({name:'NoSuchBucket',$metadata:{httpStatusCode:404}});
  await expect(f.adapter.verifyMultipartObject(input)).rejects.toMatchObject({code:'UNAVAILABLE'});expect(f.send.mock.calls[1][0]).toBeInstanceOf(HeadBucketCommand);
});
it('rejects short body and destroys it without manufacturing a digest',async()=>{
  const f=fixture();const response=body();response.Body=Readable.from([bytes.subarray(0,2)]);f.send.mockResolvedValueOnce(head()).mockResolvedValueOnce(response);
  await expect(f.adapter.verifyMultipartObject(input)).rejects.toMatchObject({code:'INVALID_RESPONSE'});expect(response.Body.destroyed).toBe(true);
});
it('pre-abort issues no HEAD and the 60s hash deadline bounds a stalled transport',async()=>{
  const f=fixture();const c=new AbortController();c.abort();await expect(f.adapter.verifyMultipartObject({...input,signal:c.signal})).rejects.toMatchObject({code:'UNAVAILABLE'});expect(f.send).not.toHaveBeenCalled();
  jest.useFakeTimers();try{f.send.mockReturnValue(new Promise(()=>{}));const p=f.adapter.verifyMultipartObject(input);const assertion=expect(p).rejects.toMatchObject({code:'UNAVAILABLE'});await jest.advanceTimersByTimeAsync(60000);await assertion;}finally{jest.useRealTimers();}
});
