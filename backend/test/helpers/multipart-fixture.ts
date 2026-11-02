import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { validateEnvironment } from '../../src/config/environment';
import { MultipartStore } from '../../src/multipart/multipart.store';
import { MultipartService } from '../../src/multipart/multipart.service';
import { MultipartImportsService } from '../../src/multipart/multipart-imports.service';
import { MultipartLimits } from '../../src/multipart/multipart.limit';
import { StorageError } from '../../src/storage/storage-error';

export const multipartOwner = 'aaaaaa00-0000-4000-8000-000000000001';
export const multipartOther = 'aaaaaa00-0000-4000-8000-000000000002';
export const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export const hash = createHash('sha256').update(image).digest('hex');
const clone = <T>(v: T): T => structuredClone(v);

/** Unit-only Prisma port with serialization, rollback and post-commit response loss. Not PostgreSQL evidence. */
export function multipartFixture() {
  const configData = validateEnvironment({ DATABASE_URL: 'postgresql://unit:unit@localhost/db', JWT_SECRET: 'unit-only-secret-longer-than-32-characters',
    FRONTEND_PUBLIC_URL: 'http://localhost:5173', BACKEND_PUBLIC_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://minio:9000',
    S3_REGION: 'us-east-1', S3_BUCKET: 'unit-bucket', S3_ACCESS_KEY_ID: 'unit-access', S3_SECRET_ACCESS_KEY: 'unit-secret' });
  const config = new ConfigService({ app: configData });
  const names = ['user','fileObject','uploadOperation','importSession','importFile','multipartTransfer','multipartPart','multipartManifestPart','multipartIoOperation','processingJob','auditEvent'];
  const tables: Record<string, any[]> = Object.fromEntries(names.map(n => [n, []]));
  tables.user.push(...[multipartOwner, multipartOther].map(id => ({ id, usedStorageBytes: 100n, reservedStorageBytes: 0n, storageLimitBytes: 10000000n })));
  let failure: string | undefined; let loseCommit = false; let mutex = Promise.resolve();
  const calls: string[] = [];
  const match = (row: any, where: any): boolean => !where || Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((w: any) => match(row, w));
    if (k === 'AND') return v.every((w: any) => match(row, w));
    if (k.includes('_')) return match(row, v);
    if (v && typeof v === 'object' && !(v instanceof Date)) return Object.entries(v).every(([op, target]: [string, any]) => {
      const a = row[k] instanceof Date ? +row[k] : row[k]; const b = target instanceof Date ? +target : target;
      return op === 'gt' ? a > b : op === 'lt' ? a < b : op === 'in' ? target.includes(a) : op === 'not' ? a !== b : a === b;
    });
    return row[k] instanceof Date ? +row[k] === +v : row[k] === v;
  });
  function include(name: string, row: any, opts: any = {}): any {
    if (!row) return null;
    const result = clone(row); const ins = opts.include ?? {};
    for (const [rel, nested] of Object.entries(ins)) {
      const o = nested === true ? {} : nested as any; let target = ''; let many = false; let found: any;
      if (name === 'multipartTransfer') {
        target = rel === 'parts' ? 'multipartPart' : rel === 'manifestParts' ? 'multipartManifestPart' : rel === 'ioOperations' ? 'multipartIoOperation' : rel;
        many = ['parts','manifestParts','ioOperations'].includes(rel);
        found = many ? tables[target].filter(r => r.transferId === row.id) : tables[target].find(r => r.id === row[rel+'Id']);
      } else if (name === 'uploadOperation' && rel === 'fileObject') { target='fileObject'; found=tables[target].find(r=>r.id===row.fileObjectId); }
      else if (name === 'importFile') {
        target = rel === 'importSession' ? 'importSession' : rel === 'transfer' ? 'multipartTransfer' : rel;
        found = tables[target].find(r => rel === 'transfer' ? r.importFileId === row.id : r.id === row[rel === 'importSession' ? 'importId' : 'fileObjectId']);
      }
      result[rel] = many ? order(found, o.orderBy).map((r: any) => include(target,r,o)) : include(target,found,o);
    }
    return opts.select ? Object.fromEntries(Object.keys(opts.select).filter(k=>opts.select[k]).map(k=>[k,result[k]])) : result;
  }
  function order(rows: any[], by: any) {
    const sorting = by ? Array.isArray(by) ? by : [by] : [];
    return [...rows].sort((a,b) => { for (const field of sorting) { const [k,d] = Object.entries(field)[0]; if(a[k]<b[k])return d==='desc'?1:-1;if(a[k]>b[k])return d==='desc'?-1:1; } return 0; });
  }
  const db: any = {};
  for (const name of names) {
    const checkpoint = (method: string) => { calls.push(`${name}.${method}`); if (failure === `${name}.${method}`) { failure=undefined; throw new Error('synthetic database fault'); } };
    db[name] = {
      findFirst: async (q: any) => include(name,tables[name].find(r=>match(r,q.where)),q),
      findUnique: async (q: any) => include(name,tables[name].find(r=>match(r,q.where)),q),
      findMany: async (q: any) => order(tables[name].filter(r=>match(r,q?.where)),q?.orderBy).slice(0,q?.take).map(r=>include(name,r,q)),
      count: async (q: any) => tables[name].filter(r=>match(r,q.where)).length,
      create: async ({data}: any) => {
        checkpoint('create'); const now = new Date();
        const defaults: any = { id: randomUUID(), createdAt: now, updatedAt: now };
        if(name==='importSession')Object.assign(defaults,{state:'OPEN',acceptedFileCount:0,nextOrdinal:1,fileLimit:50});
        if(name==='fileObject')Object.assign(defaults,{status:'PENDING_UPLOAD',detectedMimeType:null,deletedAt:null,visibility:'PRIVATE'});
        if(name==='uploadOperation')Object.assign(defaults,{state:'OPEN',terminalErrorCode:null,closedAt:null,reservationReleasedAt:null,writesClosedAt:null});
        if(name==='multipartTransfer')Object.assign(defaults,{state:'CREATING',revision:0,fence:0n,leaseOwner:null,leaseUntil:null,recoveryAfter:null,recoveryAttemptCount:0,
          providerUploadId:null,manifestSealedAt:null,manifestHash:null,storedETag:null,storedAt:null,verifiedAt:null,verifiedSha256:null,lastErrorCode:null,cleanupState:'NOT_REQUIRED',publicationExcludedAt:null});
        if(name==='multipartPart')Object.assign(defaults,{observedSizeBytes:null,observedETag:null,observedAt:null,maxIssuedExpiresAt:null,lastIssuedRevision:null});
        if(name==='multipartIoOperation')Object.assign(defaults,{settledAt:null,lastErrorCode:null});
        const row={...defaults,...clone(data)}; tables[name].push(row); return include(name,row);
      },
      createMany: async ({data}: any) => { for(const d of data)await db[name].create({data:d}); return {count:data.length}; },
      update: async ({where,data}: any) => {
        checkpoint('update'); const row=tables[name].find(r=>match(r,where)); if(!row)throw Error('missing fixture row');
        for(const[k,v]of Object.entries(data) as any){ if(v!==undefined)row[k]=v&&typeof v==='object'&&('increment'in v||'decrement'in v)?row[k]+(typeof row[k]==='bigint'?BigInt(v.increment??-v.decrement):(v.increment??-v.decrement)):clone(v); }
        row.updatedAt=new Date(); return include(name,row);
      },
    };
  }
  db.$executeRaw=async()=>0;
  db.$queryRaw=async (strings: TemplateStringsArray,...args: any[])=>{
    const text=strings.join('');
    if(text.includes('clock_timestamp'))return [{now:new Date()}];
    if(text.includes('FROM "User"'))return clone(tables.user.filter(r=>r.id===args[0]));
    if(text.includes('FROM "ImportSession"'))return tables.importSession.filter(r=>r.id===args[0]&&(args.length<2||r.ownerId===args[1])).map(r=>({id:r.id}));
    return [{id:args[0]}];
  };
  db.$transaction=async (fn: any)=>{
    const previous=mutex;let release!:()=>void;mutex=new Promise(r=>release=r);await previous;
    const before=clone(tables);let committed=false;
    try{const result=await fn(db);committed=true;if(loseCommit){loseCommit=false;throw Error('lost commit response');}return result;}
    catch(error){if(!committed)for(const n of names)tables[n]=before[n];throw error;}finally{release();}
  };
  const objects=new Map<string,{etag:string;sha256:string;prefix:Uint8Array}>();
  const uploads=new Map<string,{key:string;parts: any[]}>();let next=0;
  const storage={
    initiateMultipart:jest.fn(async(input:any)=>{const uploadId=`opaque-${++next}`;uploads.set(uploadId,{key:input.key,parts:[]});return{uploadId};}),
    findMultipartUploads:jest.fn(async(key:string)=>[...uploads].filter(([,u])=>u.key===key).map(([id])=>id)),
    listMultipartParts:jest.fn(async(input:any)=>{const u=uploads.get(input.uploadId);if(!u)throw new StorageError('UPLOAD_NOT_FOUND');return clone(u.parts);}),
    createMultipartPartAccess:jest.fn(async(input:any)=>({method:'PUT',url:'https://storage.invalid/synthetic',headers:{},partNumber:input.partNumber,
      sizeBytes:Math.min(input.partSizeBytes,input.sizeBytes-(input.partNumber-1)*input.partSizeBytes),expiresAt:input.expiresAt})),
    completeMultipart:jest.fn(async(input:any)=>{const result={etag:'"opaque-complete"',sha256:hash,prefix:image.subarray(0,16)};objects.set(input.key,result);return{etag:result.etag};}),
    verifyMultipartObject:jest.fn(async(input:any)=>{const r=objects.get(input.key);if(!r)throw new StorageError('NOT_FOUND');return clone(r);}),
    abortMultipart:jest.fn(async()=>({writeClosureEvidence:'unproven'})),writeClosureEvidence:'unproven',
  };
  const processing={enqueueConfirmedFile:jest.fn(async(tx:any,file:any)=>{
    if(tx!==db)throw Error('not the same transaction');return tx.processingJob.create({data:{fileObjectId:file.id,processorKey:'thumbnail',processorVersion:'1.0.0'}});
  })};
  const store=new MultipartStore(db); const limits=new MultipartLimits();
  const makeService=()=>new MultipartService(store,config,storage as never,processing as never,limits);
  const service=makeService();const imports=new MultipartImportsService(store,config,service);
  const input=(patch:any={})=>({clientFileId:randomUUID(),originalName:'fixture.png',mimeType:'image/png',sizeBytes:image.length,contentSha256:hash,...patch});
  async function start(value=input(),owner=multipartOwner) {
    const imported=await imports.create(owner,randomUUID());const importId=imported.body.import.id;
    const key=randomUUID();const initialized=await imports.initiate(owner,importId,key,value);
    const transferId=initialized.body.item.transfer.id;
    return{importId,key,input:value,transferId,fileId:initialized.body.item.fileId,initialized};
  }
  function ready(id:string) {
    const t=tables.multipartTransfer.find(r=>r.id===id);uploads.get(t.providerUploadId)!.parts=tables.multipartPart.filter(r=>r.transferId===id).map(p=>({partNumber:p.partNumber,sizeBytes:p.expectedSizeBytes,etag:`"part-${p.partNumber}"`}));
  }
  return{config,configData,db,tables,calls,storage,objects,uploads,processing,store,service,imports,makeService,input,start,ready,
    fail:(value:string)=>{failure=value;},loseNextCommit:()=>{loseCommit=true;}};
}
