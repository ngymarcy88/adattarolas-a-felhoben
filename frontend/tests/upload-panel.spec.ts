import { afterEach, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import UploadPanel from '../src/components/UploadPanel.vue';
import * as batches from '../src/upload/multipart-batch';
import { fixture, image, item, id } from './helpers/multipart-fixture';
async function render(disabled=false){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}},{path:'/login',component:{template:'<div />'}}]});await router.push('/');return renderToString(createSSRApp(UploadPanel,{ownerId:id(),disabled}).use(router));}
afterEach(()=>vi.restoreAllMocks());
it('renders accessible durable-import controls and honest small-part limits',async()=>{
 const html=await render();expect(html).toContain('type="file" multiple');expect(html).toContain('aria-describedby="upload-help upload-lifetime"');expect(html).toContain('legfeljebb 20');expect(html).toContain('100 MiB');expect(html).toContain('elölről indul');expect(html).toContain('Importok frissítése');expect(html).toContain('Új import');expect(html).toContain('Még nem választottál képet.');
});
it('escapes filenames and notices, renders per-file progress and pause',async()=>{
 const f=fixture();f.batch.add([image()]);Object.assign(f.batch.state.rows[0],{name:'<img src=x>.png',status:'uploading',progress:75,notice:'<notice>'});f.batch.state.running=1;vi.spyOn(batches,'createMultipartBatch').mockReturnValue(f.batch);const html=await render();expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).toContain('&lt;notice&gt;');expect(html).toContain('<progress value="75" max="100"');expect(html).toContain('75%');expect(html).toContain('Szüneteltetés');expect(html).toContain('aria-busy="true"');f.batch.state.running=0;f.batch.dispose();
});
it('offers file re-selection and manual continuation after refresh without calling library upload',async()=>{
 const f=fixture();await f.batch.open(id(99));vi.spyOn(batches,'createMultipartBatch').mockReturnValue(f.batch);const html=await render();expect(html).toContain('Az eredeti helyi fájl kiválasztása');expect(html).toContain('Folytatás / állapotellenőrzés');expect(html).toContain('Végleges megszakítás');expect(f.driver).not.toHaveBeenCalled();f.batch.dispose();
});
it('renders pending confirm independently of ACTIVE success and keeps gallery guidance',async()=>{
 const f=fixture();f.batch.add([image(),image()]);Object.assign(f.batch.state.rows[0],{status:'success'});Object.assign(f.batch.state.rows[1],{status:'confirming'});vi.spyOn(batches,'createMultipartBatch').mockReturnValue(f.batch);const html=await render();expect(html).toContain('1 / 2 sikeres');expect(html).toContain('Ellenőrzés és véglegesítés…');expect(html).toContain('A galéria automatikus frissítést kér.');expect(html).toContain('A kiskép feldolgozási állapotát a galériában követheted.');f.batch.dispose();
});
it('offers login and explains server recovery after auth loss',async()=>{
 const f=fixture();f.batch.state.authRequired=true;vi.spyOn(batches,'createMultipartBatch').mockReturnValue(f.batch);const html=await render();expect(html).toContain('href="/login"');expect(html).toContain('saját import újra megnyitható');expect(html).toMatch(/type="file"[^>]*disabled/);f.batch.dispose();
});
it('disables new selections during logout and shows safe loading/error/retry states',async()=>{
 const f=fixture();f.batch.state.loading=true;f.batch.state.loadError='Nem ellenőrizhető.';vi.spyOn(batches,'createMultipartBatch').mockReturnValue(f.batch);const html=await render(true);expect(html).toContain('Importok betöltése…');expect(html).toContain('Nem ellenőrizhető.');expect(html).toMatch(/type="file"[^>]*disabled/);f.batch.dispose();
});
