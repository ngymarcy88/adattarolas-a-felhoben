import { vi } from 'vitest';
import type { MultipartClient, Transfer } from '../../src/api/multipart';
import { createMultipartBatch } from '../../src/upload/multipart-batch';
export const id=(n=1)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const image=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],'image.png',{type:'image/png'});
export const transfer=(patch:Partial<Transfer>={}):Transfer=>({id:id(),state:'OPEN',revision:0,partSizeBytes:5242880,partCount:1,expiresAt:'2099-01-01T00:00:00.000Z',completedBytes:0,partsObservedAt:null,parts:[],cleanupState:'NOT_REQUIRED',reservationState:'HELD',lastErrorCode:null,...patch});
export const imported=()=>({id:id(99),state:'OPEN' as const,createdAt:'2026-11-03T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',acceptedFileCount:1});
export const item=(patch:Record<string,unknown>={})=>({clientFileId:id(50),fileId:id(51),originalName:'image.png',mimeType:'image/png',sizeBytes:16,transfer:transfer(),...patch});
export function fixture(){let next=100;const transfers=new Map<string,Transfer>();
 const client={
 createImport:vi.fn().mockResolvedValue(imported()),listImports:vi.fn().mockResolvedValue({items:[imported()],nextCursor:null}),getImport:vi.fn().mockResolvedValue({import:imported(),items:[item()],nextCursor:null}),
 initiate:vi.fn().mockImplementation(async(_i,input)=>{const t=transfer({id:input.clientFileId});transfers.set(t.id,t);return item({clientFileId:input.clientFileId,fileId:t.id,originalName:input.originalName,sizeBytes:input.sizeBytes,transfer:t});}),
 status:vi.fn().mockImplementation(async id=>transfers.get(id)??transfer({id})),resume:vi.fn().mockImplementation(async id=>transfers.get(id)??transfer({id})),
 sign:vi.fn(),complete:vi.fn().mockImplementation(async id=>({transfer:transfer({id,state:'STORED'}),pending:false,retryAfterMs:0})),
 cancel:vi.fn().mockImplementation(async id=>transfer({id,state:'CANCELLED',cleanupState:'CLEANUP_BLOCKED'})),
 confirm:vi.fn().mockImplementation(async id=>({file:{id,status:'ACTIVE',originalName:'image.png',mimeType:'image/png',detectedMimeType:'image/png',sizeBytes:16,confirmBy:'2099-01-01T00:00:00.000Z'},transfer:null,retryAfterMs:0})),
 } satisfies Record<keyof MultipartClient,unknown>;
 const driver=vi.fn().mockResolvedValue(undefined),hash=vi.fn().mockResolvedValue('a'.repeat(64));
 const batch=createMultipartBatch(client as MultipartClient,{driver,hash,readGapMs:0,newId:()=>id(next++)});
 return {client,driver,hash,batch,transfers};
}
export async function settled(f:ReturnType<typeof fixture>){await vi.waitFor(()=>{if(f.batch.state.running)throw new Error('still running');});}
