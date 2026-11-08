import { computed, reactive } from 'vue';
import { multipartClient, type MultipartClient, type ImportItem, type ImportSession, type Transfer } from '../api/multipart';
import { UploadRequestError } from '../api/uploads';
import { prepareImage } from './image-format';
import { validateImage, IMAGE_TYPES } from './batch';
import { transferWithUppy, type TransferDriver } from './uppy-transfer';
export { IMAGE_TYPES };
export type MultipartStatus='queued'|'hashing'|'initializing'|'uploading'|'confirming'|'success'|'error'|'paused'|'needs-file'|'cancelled';
export interface MultipartRow { id:string;name:string;size:number;mime:string;status:MultipartStatus;progress:number;error:string;notice:string;retryAt:number;transfer?:Transfer;fileId?:string }
interface Context { file?:File;hash?:string;prepared?:boolean;key:string }
interface Options { driver?:TransferDriver;hash?:(file:File)=>Promise<string>;readGapMs?:number;newId?:()=>string }
const terminal=new Set(['REJECTED','CANCELLED','EXPIRED']);
const safeError=(e:unknown)=>e instanceof UploadRequestError ? e : new UploadRequestError('UNAVAILABLE');
export async function hashImage(file:File) {const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Durable identity lives on the backend. This state contains no persisted capabilities or file bytes. */
export function createMultipartBatch(client:MultipartClient=multipartClient,options:Options={}) {
 const key=options.newId??(()=>crypto.randomUUID() as string),driver=options.driver??transferWithUppy,hash=options.hash??hashImage;
 const state=reactive({rows:[] as MultipartRow[],imports:[] as ImportSession[],importId:'',importsCursor:null as string|null,loading:false,cooldownUntil:0,loadError:'',selectionError:'',authRequired:false,running:0,completionVersion:0});
 const contexts=new Map<string,Context>(),active=new Map<string,AbortController>();let disposed=false,wave=false,importKey=key(),createPromise:Promise<string>|undefined,discovery:AbortController|undefined;
 let readTail:Promise<unknown>=Promise.resolve(),lastRead=0;
 const summary=computed(()=>({total:state.rows.length,success:state.rows.filter(r=>r.status==='success').length,failed:state.rows.filter(r=>r.status==='error').length}));
 const busy=computed(()=>state.running>0);
 function alive(signal:AbortSignal){if(disposed||signal.aborted)throw new UploadRequestError('UNAVAILABLE');}
 function error(e:unknown){const v=safeError(e);if(v.code==='RATE_LIMITED')state.cooldownUntil=Math.max(state.cooldownUntil,Date.now()+Math.max(1000,v.retryAfterMs));if(v.code==='AUTH_REQUIRED'){state.authRequired=true;for(const c of active.values())c.abort();}return v;}
 // Serialize all transfer status/resume reads. No per-file polling timers or automatic error retry.
 async function read<T>(signal:AbortSignal,fn:()=>Promise<T>):Promise<T> {
   const previous=readTail;let release!:()=>void;readTail=new Promise<void>(resolve=>{release=resolve;});
   await previous.catch(()=>{});
   try {alive(signal);const delay=Math.max(0,lastRead+(options.readGapMs??2000)-Date.now());
     if(delay)await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new UploadRequestError('UNAVAILABLE'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},delay);signal.addEventListener('abort',abort,{once:true});});
     alive(signal);lastRead=Date.now();return await fn();
   }finally{release();}
 }
 function receive(row:MultipartRow,t:Transfer){if(row.transfer&&row.transfer.id!==t.id)throw new UploadRequestError('UNAVAILABLE');row.transfer=t;row.progress=Math.floor(t.completedBytes/row.size*100);}
 async function ensureImport(signal:AbortSignal){
  if(state.importId)return state.importId;
  if(!createPromise)createPromise=client.createImport(importKey,signal).then(i=>{alive(signal);state.importId=i.id;state.imports.unshift(i);return i.id;}).finally(()=>{createPromise=undefined;});
  return createPromise;
 }
 function completed(row:MultipartRow){row.status='success';row.progress=100;row.error='';wave=true;const c=contexts.get(row.id);if(c){c.file=undefined;c.hash=undefined;}}
 async function finish(row:MultipartRow,signal:AbortSignal){
  row.status='confirming';
  const result=await client.confirm(row.fileId!,signal);alive(signal);
  if(result.file){if(result.file.id!==row.fileId||result.file.sizeBytes!==row.size||result.file.mimeType!==row.mime)throw new UploadRequestError('UNAVAILABLE');completed(row);return;}
  if(result.transfer)receive(row,result.transfer);
  throw new UploadRequestError('UPLOAD_NOT_READY',Math.max(2000,result.retryAfterMs));
 }
 async function run(row:MultipartRow,signal:AbortSignal){
  const ctx=contexts.get(row.id)!;row.error='';
  if(!row.transfer){
    if(!ctx.file){row.status='needs-file';return;}
    row.status='hashing';
    const invalid=validateImage(ctx.file);if(invalid)throw new UploadRequestError('VALIDATION_ERROR');
    if(!ctx.prepared){const p=await prepareImage(ctx.file);alive(signal);ctx.file=p.file;ctx.prepared=true;row.notice=p.notice;row.name=p.file.name;row.mime=p.file.type;}
    ctx.hash??=await hash(ctx.file);alive(signal);
    const imported=await ensureImport(signal);alive(signal);row.status='initializing';
    const item=await client.initiate(imported,{clientFileId:row.id,originalName:row.name,mimeType:row.mime,sizeBytes:row.size,contentSha256:ctx.hash},ctx.key,signal);alive(signal);row.fileId=item.fileId;receive(row,item.transfer);
  }
  let t=await read(signal,()=>client.status(row.transfer!.id,signal));alive(signal);receive(row,t);
  if(t.state==='SUCCEEDED'){await finish(row,signal);return;}
  if(terminal.has(t.state))throw new UploadRequestError(t.state==='EXPIRED'?'UPLOAD_EXPIRED':t.state==='CANCELLED'?'UPLOAD_CANCELLED':'UPLOAD_VALIDATION_FAILED');
  if(['STORED','CONFIRMING'].includes(t.state)){await finish(row,signal);return;}
  if(['SEALING','COMPLETING','COMPLETE_UNKNOWN'].includes(t.state)){
    const result=await client.complete(t.id,signal);alive(signal);receive(row,result.transfer);
    if(result.pending)throw new UploadRequestError('UPLOAD_NOT_READY',Math.max(2000,result.retryAfterMs));await finish(row,signal);return;
  }
  if(t.state==='OPEN'&&t.completedBytes===row.size){
    const result=await client.complete(t.id,signal);alive(signal);receive(row,result.transfer);
    if(result.pending)throw new UploadRequestError('UPLOAD_NOT_READY',Math.max(2000,result.retryAfterMs));await finish(row,signal);return;
  }
  if(!ctx.file){row.status='needs-file';return;}
  row.status='hashing';if(!ctx.hash){const p=await prepareImage(ctx.file);alive(signal);if(p.file.type!==row.mime)throw new UploadRequestError('TRANSFER_SOURCE_MISMATCH');ctx.file=p.file;ctx.hash=await hash(ctx.file);alive(signal);}
  if(t.state==='CREATING'||t.state==='CREATE_UNKNOWN'){
    const item=await client.initiate(state.importId,{clientFileId:row.id,originalName:row.name,mimeType:row.mime,sizeBytes:row.size,contentSha256:ctx.hash},ctx.key,signal);alive(signal);receive(row,item.transfer);t=item.transfer;
  }
  if(t.state!=='OPEN')throw new UploadRequestError('UPLOAD_NOT_READY',2000);
  t=await read(signal,()=>client.resume(t.id,{sizeBytes:row.size,contentSha256:ctx.hash!},signal));alive(signal);receive(row,t);
  row.status='uploading';await driver(ctx.file,t,signal,bytes=>{if(!disposed&&!signal.aborted)row.progress=Math.min(100,Math.max(0,Math.floor(bytes/row.size*100)));});alive(signal);
  await finish(row,signal);
 }
 function pump(){
  if(disposed||state.authRequired||state.cooldownUntil>Date.now())return;
  while(state.running<2){const row=state.rows.find(r=>r.status==='queued');if(!row)break;
   const c=new AbortController();active.set(row.id,c);state.running++;row.status='initializing';
   void run(row,c.signal).catch(async e=>{if(disposed)return;if(c.signal.aborted){row.status='paused';return;}let v=safeError(e);if(v.code==='UNAVAILABLE'&&row.transfer){try{await read(c.signal,()=>client.status(row.transfer!.id,c.signal));}catch(check){if(check instanceof UploadRequestError&&check.code==='AUTH_REQUIRED')v=check;}}if(disposed)return;if(c.signal.aborted){row.status='paused';return;}v=error(v);row.status='error';row.error=v.message;row.retryAt=Date.now()+v.retryAfterMs;}).finally(()=>{active.delete(row.id);state.running--;if(disposed)return;
     if(state.running===0&&wave){state.completionVersion++;wave=false;}pump();});
  }
 }
 function add(files:File[]){
  if(disposed||state.authRequired||state.loading||state.running)return;state.selectionError='';
  if(files.length>20||state.rows.length+files.length>50){state.selectionError='Egyszerre legfeljebb 20 kép választható, importonként legfeljebb 50.';return;}
  for(const file of files){const message=validateImage(file);const id=key();state.rows.push({id,name:file.name,size:file.size,mime:file.type,status:message?'error':'queued',progress:0,error:message,notice:'',retryAt:0});contexts.set(id,{file,key:key()});}
 }
 function start(){if(state.loading||state.running||disposed||state.authRequired)return;pump();}
 function pause(id:string){const r=state.rows.find(r=>r.id===id);if(!r||r.status==='success')return;const c=active.get(id);if(c)c.abort();else if(r.status==='queued')r.status='paused';}
 function pauseAll(){for(const r of state.rows)pause(r.id);}
 function retry(id:string){const r=state.rows.find(r=>r.id===id);if(!r||disposed||state.authRequired||active.has(id)||r.status==='success'||r.status==='cancelled'||r.retryAt>Date.now())return;r.status='queued';r.error='';pump();}
 function attach(id:string,file:File){const r=state.rows.find(r=>r.id===id),c=contexts.get(id);if(!r||!c||active.has(id)||state.loading||r.status==='success')return;
  const message=validateImage(file);if(message||file.size!==r.size){c.file=undefined;c.hash=undefined;r.status='needs-file';r.error=message||'A kiválasztott fájl mérete eltér az eredetitől.';return;}
  c.file=file;c.hash=undefined;c.prepared=false;r.error='';r.status='paused';
 }
 async function discover(more=false){
  if(disposed||state.running||state.loading)return;discovery?.abort();const c=discovery=new AbortController();state.loading=true;state.loadError='';
  try{const page=await client.listImports(more?state.importsCursor:null,c.signal);alive(c.signal);const map=new Map((more?state.imports:[]).map(i=>[i.id,i]));for(const i of page.items)map.set(i.id,i);state.imports=[...map.values()];state.importsCursor=page.nextCursor;}
  catch(e){if(!disposed&&!c.signal.aborted)state.loadError=error(e).message;}finally{if(!disposed)state.loading=false;}
 }
 async function open(importId:string){
  if(disposed||state.running||state.loading)return;discovery?.abort();const c=discovery=new AbortController();state.loading=true;state.loadError='';
  try{let cursor:string|null=null;const items:ImportItem[]=[];const cursors=new Set<string>();
   for(let i=0;i<3;i++){const page=await client.getImport(importId,cursor,c.signal);alive(c.signal);items.push(...page.items);cursor=page.nextCursor;if(!cursor)break;if(cursors.has(cursor))throw new UploadRequestError('UNAVAILABLE');cursors.add(cursor);}
   if(cursor||items.length>50||new Set(items.map(i=>i.clientFileId)).size!==items.length||new Set(items.map(i=>i.fileId)).size!==items.length)throw new UploadRequestError('UNAVAILABLE');
   contexts.clear();state.rows=[];state.importId=importId;
   for(const item of items){const t=item.transfer;state.rows.push({id:item.clientFileId,name:item.originalName,size:item.sizeBytes,mime:item.mimeType,status:t.state==='SUCCEEDED'?'success':terminal.has(t.state)?'cancelled':'needs-file',progress:Math.floor(t.completedBytes/item.sizeBytes*100),error:terminal.has(t.state)?'A feltöltés lezárult; a korábbi foglalás megmaradhat.':'',notice:'',retryAt:0,transfer:t,fileId:item.fileId});contexts.set(item.clientFileId,{key:key()});}
  }catch(e){if(!disposed&&!c.signal.aborted)state.loadError=error(e).message;}finally{if(!disposed)state.loading=false;}
 }
 function fresh(){if(state.running||state.loading)return;contexts.clear();state.rows=[];state.importId='';importKey=key();state.selectionError='';}
 async function cancel(id:string){const row=state.rows.find(r=>r.id===id);if(!row||active.has(id)||state.running>=2||row.status==='success'||disposed)return;
  if(!row.transfer){row.status='cancelled';contexts.delete(id);return;}
  const c=new AbortController();active.set(id,c);state.running++;
  try{const t=await client.cancel(row.transfer.id,c.signal);alive(c.signal);receive(row,t);row.status='cancelled';row.error='A feltöltés lezárva. A tárhelyfoglalás igazolt takarításig megmaradhat.';contexts.delete(id);}
  catch(e){if(!disposed){row.status='error';row.error=error(e).message;}}finally{active.delete(id);state.running--;}
 }
 function dispose(){disposed=true;discovery?.abort();for(const c of active.values())c.abort();contexts.clear();}
 return {state,summary,busy,add,start,pause,pauseAll,retry,attach,discover,open,fresh,cancel,dispose};
}
