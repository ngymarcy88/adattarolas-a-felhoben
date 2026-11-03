<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createMultipartBatch, IMAGE_TYPES, type MultipartStatus } from '../upload/multipart-batch';
const props=defineProps<{ownerId:string;disabled?:boolean}>();
const emit=defineEmits<{busy:[value:boolean];completed:[ownerId:string]}>();
const batch=createMultipartBatch();const {state,summary,busy}=batch;const now=ref(Date.now());
watch(()=>state.running>0,value=>emit('busy',value));
watch(()=>state.completionVersion,()=>emit('completed',props.ownerId));
let timer:ReturnType<typeof setInterval>|undefined;
const stop=()=>batch.pauseAll();
onMounted(()=>{void batch.discover();timer=setInterval(()=>{now.value=Date.now();},1000);window.addEventListener('offline',stop);window.addEventListener('pagehide',stop);});
onBeforeUnmount(()=>{clearInterval(timer);window.removeEventListener('offline',stop);window.removeEventListener('pagehide',stop);batch.dispose();emit('busy',false);});
const labels:Record<MultipartStatus,string>={queued:'Várakozik',hashing:'Fájlazonosság ellenőrzése…',initializing:'Előkészítés…',uploading:'Feltöltés…',confirming:'Ellenőrzés és véglegesítés…',success:'Sikeresen feltöltve',error:'Nem sikerült',paused:'Szünetel', 'needs-file':'Folytatható feltöltés',cancelled:'Lezárva'};
const hasQueued=computed(()=>state.rows.some(r=>r.status==='queued'));
const working=(s:MultipartStatus)=>['hashing','initializing','uploading','confirming'].includes(s);
const waits=(at:number)=>Math.max(0,Math.ceil((at-now.value)/1000));
const size=(bytes:number)=>bytes<1048576?`${Math.ceil(bytes/1024)} KiB`:`${(bytes/1048576).toFixed(1)} MiB`;
function select(event:Event){const input=event.target as HTMLInputElement;batch.add(Array.from(input.files??[]));input.value='';}
function reselect(id:string,event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file)batch.attach(id,file);input.value='';}
</script>
<template>
<section class="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="upload-title">
 <h2 id="upload-title" class="text-xl font-semibold">Képek feltöltése</h2>
 <p id="upload-help" class="mt-3 text-sm text-slate-600">Egyszerre legfeljebb 20 kép választható, importonként legfeljebb 50, fájlonként 100 MiB. JPEG · PNG · WebP · GIF</p>
 <p id="upload-lifetime" class="mt-2 text-xs text-slate-500">A kész fájlok és teljes fájlrészek a szerveren megmaradnak. Oldalfrissítés után válaszd ki az importot, szükség esetén az eredeti helyi fájlt is. A félbemaradt rész újraküldődik; az 5 MiB alatti kép teljes átvitele elölről indul. A korábbi foglalás megmaradhat.</p>
 <div class="mt-4 space-y-2" aria-label="Korábbi importok">
  <button type="button" :disabled="disabled||busy||state.loading||state.authRequired" @click="batch.discover()" class="rounded-lg border px-3 py-2 text-sm">Importok frissítése</button>
  <span v-if="state.loading" role="status" class="ml-3 text-sm">Importok betöltése…</span>
  <p v-if="state.loadError" role="alert" class="text-sm text-red-700">{{ state.loadError }}</p>
  <ul class="space-y-1 text-sm"><li v-for="item in state.imports" :key="item.id">
   <button type="button" :disabled="disabled||busy||state.loading||state.authRequired" :aria-pressed="state.importId===item.id" @click="batch.open(item.id)" class="rounded-lg border px-3 py-2">{{ new Date(item.createdAt).toLocaleString('hu-HU') }} · {{ item.acceptedFileCount }} kép · {{ item.state==='EXPIRED'?'Lejárt':'Megnyitás' }}</button>
  </li></ul>
  <button v-if="state.importsCursor" type="button" :disabled="disabled||busy||state.loading||state.authRequired" @click="batch.discover(true)" class="rounded-lg border px-3 py-2 text-sm">További importok</button>
  <button type="button" :disabled="disabled||busy||state.loading||state.authRequired" @click="batch.fresh()" class="ml-2 rounded-lg border px-3 py-2 text-sm">Új import</button>
 </div>
 <div class="mt-5 rounded-2xl border border-dashed border-indigo-300 p-4">
  <label for="upload-files" class="block font-semibold">Képek kiválasztása</label>
  <input id="upload-files" type="file" multiple :accept="IMAGE_TYPES.join(',')" :disabled="disabled||busy||state.loading||state.authRequired" aria-describedby="upload-help upload-lifetime" class="mt-3 block w-full text-sm" @change="select" />
 </div>
 <p v-if="waits(state.cooldownUntil)>0" role="alert" class="mt-3 text-sm text-amber-800">Túl sok kérés. Kézi folytatás {{ waits(state.cooldownUntil) }} mp múlva.</p>
 <p v-if="state.selectionError" role="alert" class="mt-3 text-sm text-amber-800">{{ state.selectionError }}</p>
 <p v-if="!state.rows.length" class="mt-6 text-sm text-slate-500">Még nem választottál képet.</p>
 <div v-else class="mt-5">
  <p role="status" aria-live="polite">{{ summary.success }} / {{ summary.total }} sikeres · {{ summary.failed }} hibás</p>
  <button type="button" :disabled="disabled||!hasQueued||busy||state.loading||state.authRequired" @click="batch.start()" class="mt-3 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{{ busy?'Feltöltés folyamatban…':'Feltöltés indítása' }}</button>
  <button v-if="busy" type="button" @click="batch.pauseAll()" class="ml-2 rounded-lg border px-4 py-3">Mind szüneteltetése</button>
  <ul class="mt-5 space-y-3" aria-label="Kiválasztott képek">
   <li v-for="row in state.rows" :key="row.id" class="rounded-2xl border p-4" :aria-busy="working(row.status)">
    <p class="break-all font-medium">{{ row.name }} <span class="text-xs text-slate-500">{{ size(row.size) }}</span></p>
    <p v-if="row.notice" class="mt-2 text-sm text-indigo-700">{{ row.notice }}</p>
    <p class="mt-2 text-sm">{{ labels[row.status] }}<span v-if="row.status==='uploading'"> {{ row.progress }}%</span></p>
    <progress :value="row.progress" max="100" :aria-label="`${row.name} átvitele`" class="mt-2 h-2 w-full accent-indigo-600" />
    <p v-if="row.status==='confirming'" class="text-xs text-slate-500">Az átvitel után a szerver ellenőrzése szükséges a sikerhez.</p>
    <p v-if="row.transfer" class="text-xs text-slate-500">Határidő: {{ new Date(row.transfer.expiresAt).toLocaleString('hu-HU') }}</p>
    <p v-if="row.error" role="alert" class="mt-2 text-sm text-red-700">{{ row.error }}</p>
    <button v-if="working(row.status)" type="button" @click="batch.pause(row.id)" :aria-label="`${row.name} szüneteltetése`" class="mt-2 rounded-lg border px-3 py-2">Szüneteltetés</button>
    <div v-if="['paused','error','needs-file'].includes(row.status)" class="mt-2 space-y-2">
     <label :for="`resume-${row.id}`" class="block text-sm">Az eredeti helyi fájl kiválasztása (ha még vannak hiányzó részek)</label>
     <input :id="`resume-${row.id}`" type="file" :accept="IMAGE_TYPES.join(',')" :disabled="disabled||state.authRequired||busy" @change="reselect(row.id,$event)" />
     <button type="button" :disabled="disabled||waits(row.retryAt)>0||state.authRequired" @click="batch.retry(row.id)" :aria-label="`${row.name} folytatása`" class="rounded-lg border px-3 py-2">Folytatás / állapotellenőrzés<span v-if="waits(row.retryAt)>0"> ({{ waits(row.retryAt) }} mp)</span></button>
     <button type="button" :disabled="disabled||busy||state.authRequired" @click="batch.cancel(row.id)" class="ml-2 rounded-lg border px-3 py-2">Végleges megszakítás</button>
    </div>
   </li>
  </ul>
  <p v-if="summary.success" class="mt-4 text-sm text-emerald-800">A sikeres fájlok tárolása véglegesítve. A galéria automatikus frissítést kér. Ha a lista lekérése hibázik, használd a Lista frissítése gombot. A kiskép feldolgozási állapotát a galériában követheted.</p>
 </div>
 <p v-if="state.authRequired" role="alert" class="mt-4 text-sm text-red-700">A munkamenet lejárt, további fájlokat nem indítunk. <RouterLink to="/login" class="underline">Bejelentkezés</RouterLink> után a saját import újra megnyitható, a helyi fájl ismét kiválasztható.</p>
</section>
</template>
