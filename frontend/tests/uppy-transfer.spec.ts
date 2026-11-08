import { afterEach, expect, it, vi } from 'vitest';
import { transferWithUppy } from '../src/upload/uppy-transfer';
import { transfer, id } from './helpers/multipart-fixture';
class Xhr {
 static calls:{url:string;size:number}[]=[];static stalled=false;static active:Xhr[]=[];
 upload={onprogress:null as null|((e:unknown)=>void)};onload:(()=>void)|null=null;onerror:(()=>void)|null=null;status=200;statusText='OK';responseText='';withCredentials=false;url='';aborted=false;
 open(method:string,url:string){expect(method).toBe('PUT');this.url=url;}
 setRequestHeader(){}getResponseHeader(name:string){return name.toLowerCase()==='etag'?'"actual-part-tag"':null;}
 abort(){this.aborted=true;}
 send(body:Blob){Xhr.calls.push({url:this.url,size:body.size});Xhr.active.push(this);this.upload.onprogress?.({loaded:body.size,total:body.size,lengthComputable:true});if(!Xhr.stalled)queueMicrotask(()=>{if(!this.aborted)this.onload?.();});}
}
function setup(parts:{PartNumber:number;ETag:string}[]=[]){
 Xhr.calls=[];Xhr.active=[];Xhr.stalled=false;vi.stubGlobal('XMLHttpRequest',Xhr);
 const forbidden=new Proxy({}, {get(){throw new Error('Persistent browser storage is forbidden');}});vi.stubGlobal('localStorage',forbidden);vi.stubGlobal('indexedDB',forbidden);
 const fetch=vi.fn().mockImplementation(async(url:string,opts?:RequestInit)=>{
  expect(url).toContain('/api/v1/uppy/s3/multipart/');
  if(opts?.method==='DELETE')return new Response(null,{status:204});
  if(url.includes('/complete?'))return Response.json({key:id(),location:'http://frontend.invalid/app'});
  if(new RegExp(`/[0-9]+\\?`).test(url))return Response.json({url:'http://storage.invalid/synthetic-part-'+url.split('/').at(-1)!.split('?')[0]});
  return Response.json(parts);
 });vi.stubGlobal('fetch',fetch);return fetch;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('actual Uppy6 skips the retained first 5MiB part, sends only the missing part and uses server complete',async()=>{
 const fetch=setup([{PartNumber:1,ETag:'"retained-tag"'}]);const progress=vi.fn();const size=5242880+17;const file=new File([new Uint8Array(size)],'image.png',{type:'image/png'});
 await transferWithUppy(file,transfer({partCount:2}),new AbortController().signal,progress);
 expect(Xhr.calls).toHaveLength(1);expect(Xhr.calls[0]).toMatchObject({size:17});expect(Xhr.calls[0].url).toContain('part-2');expect(fetch.mock.calls.some(([url])=>url.includes('/complete?'))).toBe(true);expect(progress).toHaveBeenCalledWith(size);expect(fetch.mock.calls.some(([,opts])=>opts?.method==='POST'&&!String(opts.body).includes('parts'))).toBe(false);
});
it('actual Uppy6 supports a small single multipart part without any storage credentials',async()=>{
 setup();await transferWithUppy(new File(['small-image'],'a.png',{type:'image/png'}),transfer(),new AbortController().signal,()=>{});expect(Xhr.calls).toHaveLength(1);expect(Xhr.calls[0].size).toBe(11);expect(Xhr.active[0].withCredentials).toBe(false);
});
it('pause aborts the real library XHR and uses only the conservative detach hook',async()=>{
 const fetch=setup();Xhr.stalled=true;const c=new AbortController();const progress=vi.fn();const p=transferWithUppy(new File(['image'],'a.png',{type:'image/png'}),transfer(),c.signal,progress);const assertion=expect(p).rejects.toMatchObject({code:'UNAVAILABLE'});
 await vi.waitFor(()=>expect(Xhr.calls).toHaveLength(1));c.abort();await assertion;expect(Xhr.active[0].aborted).toBe(true);expect(fetch.mock.calls.some(([,opts])=>opts?.method==='DELETE')).toBe(true);expect(fetch.mock.calls.some(([url])=>url.includes('/complete?'))).toBe(false);
});
it('rejects pre-aborted work before allocating a library instance or sending requests',async()=>{
 const fetch=setup();const c=new AbortController();c.abort();await expect(transferWithUppy(new File(['x'],'a.png'),transfer(),c.signal,()=>{})).rejects.toMatchObject({code:'UNAVAILABLE'});expect(fetch).not.toHaveBeenCalled();expect(Xhr.calls).toHaveLength(0);
});
