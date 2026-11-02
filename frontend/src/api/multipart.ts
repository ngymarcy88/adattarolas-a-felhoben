import { parseApiBaseUrl } from './health';
import { UploadRequestError, type UploadedFile } from './uploads';
import { readRetryAfter } from './retry-after';

export const TRANSFER_STATES = ['CREATING', 'CREATE_UNKNOWN', 'OPEN', 'SEALING', 'COMPLETING', 'COMPLETE_UNKNOWN', 'STORED', 'CONFIRMING', 'SUCCEEDED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;
export interface Transfer {
  id: string; state: typeof TRANSFER_STATES[number]; revision: number; partSizeBytes: number; partCount: number;
  expiresAt: string; completedBytes: number; partsObservedAt: string | null; parts: { partNumber: number; sizeBytes: number }[];
  cleanupState: 'NOT_REQUIRED' | 'PENDING' | 'CLEANUP_BLOCKED' | 'VERIFIED';
  reservationState: 'HELD' | 'CONVERTED_TO_USED' | 'RELEASED'; lastErrorCode: string | null;
}
export interface ImportSession { id: string; state: 'OPEN' | 'EXPIRED'; createdAt: string; expiresAt: string; acceptedFileCount: number }
export interface ImportItem { clientFileId: string; fileId: string; originalName: string; mimeType: string; sizeBytes: number; transfer: Transfer }
export interface MultipartInput { clientFileId: string; originalName: string; mimeType: string; sizeBytes: number; contentSha256: string }
export interface PartAccess { method: 'PUT'; partNumber: number; sizeBytes: number; url: string; headers: Record<string, string>; expiresAt: string }
const fail = (): never => { throw new UploadRequestError('UNAVAILABLE'); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function exact(v: unknown, keys: string[]): Record<string, unknown> {
  if (!object(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) return fail();
  return v;
}
const id = (v: unknown): v is string => typeof v === 'string' && v.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const mime = (v: unknown): v is string => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(v));
const errors = new Set(['AUTH_REQUIRED','ORIGIN_NOT_ALLOWED','VALIDATION_ERROR','INVALID_FILE_NAME','UNSUPPORTED_MEDIA_TYPE','FILE_TOO_LARGE','QUOTA_EXCEEDED','IDEMPOTENCY_CONFLICT','IMPORT_FILE_LIMIT','ACTIVE_IMPORT_LIMIT','FILE_NOT_FOUND','IMPORT_NOT_FOUND','TRANSFER_NOT_FOUND','PART_ALREADY_UPLOADED','TRANSFER_SOURCE_MISMATCH','TRANSFER_STATE_CONFLICT','RESOURCE_STATE_CONFLICT','UPLOAD_NOT_READY','UPLOAD_PARTS_INCOMPLETE','TRANSFER_PARTS_INVALID','UPLOAD_EXPIRED','UPLOAD_CANCELLED','UPLOAD_VALIDATION_FAILED','RATE_LIMITED','STORAGE_UNAVAILABLE','UPLOAD_VERIFICATION_UNAVAILABLE','DATABASE_UNAVAILABLE','INTERNAL_ERROR']);
export function parseTransfer(value: unknown): Transfer {
  const v = exact(value, ['id','state','revision','partSizeBytes','partCount','expiresAt','completedBytes','partsObservedAt','parts','cleanupState','reservationState','lastErrorCode']);
  if (!id(v.id) || !TRANSFER_STATES.includes(v.state as Transfer['state']) || !integer(v.revision) || !integer(v.partSizeBytes,5242880,16777216) || v.partSizeBytes % 1048576 || !integer(v.partCount,1,20) || !date(v.expiresAt) || !integer(v.completedBytes,0,104857600) || !(v.partsObservedAt === null || date(v.partsObservedAt)) || !Array.isArray(v.parts) || v.parts.length > v.partCount || !['NOT_REQUIRED','PENDING','CLEANUP_BLOCKED','VERIFIED'].includes(String(v.cleanupState)) || !['HELD','CONVERTED_TO_USED','RELEASED'].includes(String(v.reservationState)) || !(v.lastErrorCode === null || typeof v.lastErrorCode === 'string' && errors.has(v.lastErrorCode))) return fail();
  let previous = 0, total = 0;
  for (const item of v.parts) {
    const p = exact(item, ['partNumber','sizeBytes']);
    if (!integer(p.partNumber,previous+1,v.partCount) || !integer(p.sizeBytes,1,v.partSizeBytes)) return fail();
    previous = p.partNumber; total += p.sizeBytes;
  }
  if (total !== v.completedBytes) return fail();
  return v as unknown as Transfer;
}
function parseImport(value: unknown): ImportSession {
  const v = exact(value,['id','state','createdAt','expiresAt','acceptedFileCount']);
  if (!id(v.id) || !['OPEN','EXPIRED'].includes(String(v.state)) || !date(v.createdAt) || !date(v.expiresAt) || !integer(v.acceptedFileCount,0,50)) return fail();
  return v as unknown as ImportSession;
}
function parseItem(value: unknown): ImportItem {
  const v = exact(value,['clientFileId','fileId','originalName','mimeType','sizeBytes','transfer']);
  if (!id(v.clientFileId) || !id(v.fileId) || typeof v.originalName !== 'string' || v.originalName.length > 1024 || !mime(v.mimeType) || !integer(v.sizeBytes,1,104857600)) return fail();
  const transfer = parseTransfer(v.transfer);
  if (transfer.partCount !== Math.ceil(v.sizeBytes / transfer.partSizeBytes) || transfer.completedBytes > v.sizeBytes) return fail();
  for (const p of transfer.parts) if (p.sizeBytes !== Math.min(transfer.partSizeBytes, v.sizeBytes - (p.partNumber-1)*transfer.partSizeBytes)) return fail();
  return { ...v, transfer } as unknown as ImportItem;
}
function cursor(v: unknown): string | null {
  if (v === null || typeof v === 'string' && v.length > 0 && v.length <= 1024 && /^[A-Za-z0-9_-]+$/.test(v)) return v;
  return fail();
}
function pathId(v: string): string { if (!id(v)) throw new UploadRequestError('VALIDATION_ERROR'); return v; }
export function createMultipartClient(baseUrl: string | undefined) {
  async function request(path: string, signal: AbortSignal, body?: unknown, key?: string, empty = false) {
    const controller = new AbortController(); const abort = () => controller.abort();
    signal.addEventListener('abort',abort,{once:true}); if (signal.aborted) abort();
    const timer = setTimeout(abort, empty ? 70000 : 15000);
    try {
      const r = await fetch(`${parseApiBaseUrl(baseUrl)}/${path}`, { method: body === undefined && !empty ? 'GET' : 'POST', credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Accept:'application/json',...(body === undefined ? {} : {'Content-Type':'application/json'}),...(key ? {'Idempotency-Key':pathId(key)} : {})},...(body === undefined ? {} : {body:JSON.stringify(body)}) });
      if (![200,201,202].includes(r.status)) {
        let code = r.status === 401 ? 'AUTH_REQUIRED' : r.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE';
        try { const data: unknown = await r.json(); if (object(data) && object(data.error) && typeof data.error.code === 'string' && errors.has(data.error.code)) code = data.error.code; } catch { /* Never expose raw server/storage text. */ }
        throw new UploadRequestError(code, readRetryAfter(r.headers.get('Retry-After')));
      }
      const data: unknown = await r.json(); if (controller.signal.aborted) return fail();
      return { data, pending:r.status === 202, retryAfterMs:r.status === 202 ? readRetryAfter(r.headers.get('Retry-After')) : 0 };
    } catch (error) { if (error instanceof UploadRequestError) throw error; return fail(); }
    finally { clearTimeout(timer); signal.removeEventListener('abort',abort); }
  }
  return {
    async createImport(key: string, signal: AbortSignal) { const {data}=await request('imports',signal,{},key); return parseImport(exact(data,['import']).import); },
    async listImports(next: string | null, signal: AbortSignal) {
      const {data}=await request(`imports?limit=20${next ? `&cursor=${encodeURIComponent(cursor(next)!)}` : ''}`,signal); const v=exact(data,['items','nextCursor']);
      if (!Array.isArray(v.items) || v.items.length>20) return fail(); return {items:v.items.map(parseImport),nextCursor:cursor(v.nextCursor)};
    },
    async getImport(importId: string, next: string | null, signal: AbortSignal) {
      const {data}=await request(`imports/${pathId(importId)}?limit=20${next ? `&cursor=${encodeURIComponent(cursor(next)!)}` : ''}`,signal); const v=exact(data,['import','items','nextCursor']);
      const imported=parseImport(v.import); if (imported.id!==importId || !Array.isArray(v.items) || v.items.length>20) return fail();
      return {import:imported,items:v.items.map(parseItem),nextCursor:cursor(v.nextCursor)};
    },
    async initiate(importId: string, input: MultipartInput, key: string, signal: AbortSignal) {
      const {data}=await request(`imports/${pathId(importId)}/files`,signal,input,key); const item=parseItem(exact(data,['item']).item);
      if (item.clientFileId!==input.clientFileId || item.originalName!==input.originalName || item.mimeType!==input.mimeType || item.sizeBytes!==input.sizeBytes) return fail(); return item;
    },
    async status(transferId: string, signal: AbortSignal) { const {data}=await request(`transfers/${pathId(transferId)}`,signal); const t=parseTransfer(exact(data,['transfer']).transfer); if(t.id!==transferId)return fail();return t; },
    async resume(transferId: string, input: {sizeBytes:number;contentSha256:string}, signal: AbortSignal) {const {data}=await request(`transfers/${pathId(transferId)}/resume`,signal,input);const t=parseTransfer(exact(data,['transfer']).transfer);if(t.id!==transferId)return fail();return t;},
    async sign(transferId: string, partNumber: number, signal: AbortSignal): Promise<PartAccess> {
      if (!integer(partNumber,1,20)) throw new UploadRequestError('VALIDATION_ERROR');
      const {data}=await request(`transfers/${pathId(transferId)}/parts/${partNumber}/sign`,signal,{});const v=exact(data,['method','partNumber','sizeBytes','url','headers','expiresAt']);
      if(v.method!=='PUT' || v.partNumber!==partNumber || !integer(v.sizeBytes,1,16777216) || typeof v.url!=='string' || !date(v.expiresAt) || Date.parse(v.expiresAt)<=Date.now() || !object(v.headers) || Object.keys(v.headers).length) return fail();
      try { const url=new URL(v.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.origin===globalThis.location?.origin)return fail(); } catch { return fail(); }
      return v as unknown as PartAccess;
    },
    async complete(transferId: string, signal: AbortSignal) {const r=await request(`transfers/${pathId(transferId)}/complete`,signal,{});const t=parseTransfer(exact(r.data,['transfer']).transfer);if(t.id!==transferId)return fail();return {transfer:t,pending:r.pending,retryAfterMs:r.retryAfterMs};},
    async cancel(transferId: string, signal: AbortSignal) {const r=await request(`transfers/${pathId(transferId)}/cancel`,signal,{});const t=parseTransfer(exact(r.data,['transfer']).transfer);if(t.id!==transferId)return fail();return t;},
    async confirm(fileId: string, signal: AbortSignal): Promise<{file: UploadedFile|null;transfer:Transfer|null;retryAfterMs:number}> {
      const r=await request(`files/${pathId(fileId)}/confirm`,signal,undefined,undefined,true);
      if(r.pending)return {file:null,transfer:parseTransfer(exact(r.data,['transfer']).transfer),retryAfterMs:r.retryAfterMs};
      const v=exact(exact(r.data,['file']).file,['id','status','originalName','mimeType','detectedMimeType','sizeBytes','confirmBy']);
      if(v.id!==fileId||v.status!=='ACTIVE'||typeof v.originalName!=='string'||!mime(v.mimeType)||v.mimeType!==v.detectedMimeType||!integer(v.sizeBytes,1,104857600)||!date(v.confirmBy))return fail();
      return {file:v as unknown as UploadedFile,transfer:null,retryAfterMs:0};
    },
  };
}
export type MultipartClient = ReturnType<typeof createMultipartClient>;
export const multipartClient = createMultipartClient(import.meta.env.VITE_API_BASE_URL);
