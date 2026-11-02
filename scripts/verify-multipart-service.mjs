/** Called only by the existing disposable-schema verifier. Storage is a synthetic port, never MinIO. */
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
export async function verifyMultipartService(root, datasource) {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  require('reflect-metadata');
  const { PrismaClient } = require(`${root}/backend/dist/generated/prisma/client.js`);
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { ConfigService } = require('@nestjs/config');
  const { validateEnvironment } = require(`${root}/backend/dist/config/environment.js`);
  const { MultipartStore } = require(`${root}/backend/dist/multipart/multipart.store.js`);
  const { MultipartService } = require(`${root}/backend/dist/multipart/multipart.service.js`);
  const { MultipartImportsService } = require(`${root}/backend/dist/multipart/multipart-imports.service.js`);
  const { MultipartLimits } = require(`${root}/backend/dist/multipart/multipart.limit.js`);
  const { ProcessingStateService } = require(`${root}/backend/dist/processing/processing-state.service.js`);
  const { thumbnailProcessingPolicy } = require(`${root}/backend/dist/processing/thumbnail-processor.js`);
  const { StorageError, MultipartMutationError } = require(`${root}/backend/dist/storage/storage-error.js`);
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: datasource, connectionTimeoutMillis: 5000 }) });
  // The disposable server uses trust; app validation still requires a syntactic password.
  const configuredDatasource = new URL(datasource); configuredDatasource.password = 'synthetic-only';
  const app = validateEnvironment({ DATABASE_URL: configuredDatasource.toString(), JWT_SECRET: 'synthetic-only-and-longer-than-32-characters',
    FRONTEND_PUBLIC_URL: 'http://localhost:5173', BACKEND_PUBLIC_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://storage.invalid',
    S3_REGION: 'unit-region', S3_BUCKET: 'unit-bucket', S3_ACCESS_KEY_ID: 'unit-access', S3_SECRET_ACCESS_KEY: 'unit-secret' });
  const config = new ConfigService({ app }); const store = new MultipartStore(client);
  const processing = new ProcessingStateService(client, config, thumbnailProcessingPolicy);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const uploads = new Map(); const objects = new Map(); let creates = 0, completes = 0, verifies = 0, aborts = 0, loseComplete = false;
  const storage = {
    initiateMultipart: async input => { const uploadId=randomUUID(); uploads.set(uploadId,{key:input.key,parts:[]});creates++;return{uploadId}; },
    findMultipartUploads: async key => [...uploads].filter(([,u])=>u.key===key).map(([id])=>id),
    listMultipartParts: async input => uploads.get(input.uploadId).parts,
    completeMultipart: async input => { completes++;objects.set(input.key,{etag:'"synthetic-result"',sha256,prefix:bytes.subarray(0,16)});if(loseComplete){loseComplete=false;throw new MultipartMutationError('UNAVAILABLE','unknown');}return{etag:'"synthetic-result"'}; },
    verifyMultipartObject: async input => { verifies++;const o=objects.get(input.key);if(!o)throw new StorageError('NOT_FOUND');return o; },
    abortMultipart: async () => { aborts++;return{writeClosureEvidence:'unproven'}; }, writeClosureEvidence:'unproven',
  };
  const makeService = () => new MultipartService(store,config,storage,processing,new MultipartLimits());
  const service=makeService(); const imports=new MultipartImportsService(store,config,service);
  const owner='20000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002';
  try {
    const before=await client.user.findUniqueOrThrow({where:{id:owner}});
    const importKey=randomUUID(); const imported=await imports.create(owner,importKey); const importId=imported.body.import.id;
    assert.equal((await imports.create(owner,importKey)).body.import.id,importId);
    const value=()=>({clientFileId:randomUUID(),originalName:'synthetic.png',mimeType:'image/png',sizeBytes:bytes.length,contentSha256:sha256});
    async function start(input=value(), key=randomUUID()) {
      const result=await imports.initiate(owner,importId,key,input);
      const t=await client.multipartTransfer.findUniqueOrThrow({where:{id:result.body.item.transfer.id}});
      uploads.get(t.providerUploadId).parts=[{partNumber:1,sizeBytes:bytes.length,etag:'"synthetic-part"'}];
      return{result,t};
    }
    const input=value(),key=randomUUID();
    const results=await Promise.all([imports.initiate(owner,importId,key,input),imports.initiate(owner,importId,key,input)]);
    assert.equal(results[0].body.item.fileId,results[1].body.item.fileId);assert.equal(creates,1);
    const first=await client.multipartTransfer.findUniqueOrThrow({where:{id:results[0].body.item.transfer.id}});
    uploads.get(first.providerUploadId).parts=[{partNumber:1,sizeBytes:bytes.length,etag:'"synthetic-part"'}];
    await Promise.all([service.complete(owner,first.id),makeService().complete(owner,first.id)]);assert.equal(completes,1);
    await Promise.all([service.confirmFile(owner,first.fileObjectId),makeService().confirmFile(owner,first.fileObjectId)]);
    assert.equal(await client.processingJob.count({where:{fileObjectId:first.fileObjectId}}),1);
    const once=await client.user.findUniqueOrThrow({where:{id:owner}});
    assert.equal(once.usedStorageBytes,before.usedStorageBytes+BigInt(bytes.length));assert.equal(once.reservedStorageBytes,before.reservedStorageBytes);
    await makeService().confirmFile(owner,first.fileObjectId);
    assert.equal((await client.user.findUniqueOrThrow({where:{id:owner}})).usedStorageBytes,once.usedStorageBytes);
    assert.equal(await client.auditEvent.count({where:{resourceId:first.fileObjectId,action:'UPLOAD_CONFIRMED'}}),1);
    const cancelled=await start();await service.cancel(owner,cancelled.t.id);await makeService().cancel(owner,cancelled.t.id);assert.equal(aborts,1);
    const cancelledOp=await client.uploadOperation.findUniqueOrThrow({where:{id:cancelled.t.uploadOperationId}});
    assert.equal(cancelledOp.reservationReleasedAt,null);
    const unknown=await start();loseComplete=true;assert.equal((await service.complete(owner,unknown.t.id)).status,202);
    await new Promise(resolve=>setTimeout(resolve,2100));
    assert.equal((await makeService().status(owner,unknown.t.id)).state,'STORED');
    const pending=await client.multipartIoOperation.findFirstOrThrow({where:{transferId:unknown.t.id,kind:'COMPLETE'}});
    assert.equal(pending.state,'UNKNOWN');assert.equal(pending.settledAt,null);
    await makeService().confirmFile(owner,unknown.t.fileObjectId);
    const count=verifies;await assert.rejects(service.status(other,unknown.t.id),e=>e.code==='TRANSFER_NOT_FOUND');assert.equal(verifies,count);
    const after=await client.user.findUniqueOrThrow({where:{id:owner}});
    assert.equal(after.usedStorageBytes,before.usedStorageBytes+BigInt(bytes.length*2));
    assert.equal(after.reservedStorageBytes,before.reservedStorageBytes+BigInt(bytes.length));
    console.log('PASS real PostgreSQL multipart service: concurrent init/complete/confirm, actual thumbnail-job/audit/counters, replay, cancel HELD and lost-complete adoption. Storage was synthetic.');
  } finally { await client.$disconnect(); }
}
