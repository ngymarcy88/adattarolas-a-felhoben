<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { uploadClient } from '../api/uploads';
import { createUploadBatch, IMAGE_TYPES, type UploadStatus } from '../upload/batch';

const batch = createUploadBatch(uploadClient);
const props = defineProps<{ ownerId: string; disabled?: boolean }>();
const { state, summary, busy } = batch;
const emit = defineEmits<{ busy: [value: boolean]; completed: [ownerId: string] }>();
// Account logout stays disabled while a request is running; queued selection alone is safe to leave.
watch(() => state.running > 0, value => emit('busy', value));
watch(() => state.completionVersion, () => emit('completed', props.ownerId));
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { clearInterval(timer); batch.dispose(); emit('busy', false); });
const labels: Record<UploadStatus, string> = { queued: 'Várakozik', initializing: 'Előkészítés…', uploading: 'Feltöltés…', confirming: 'Ellenőrzés és véglegesítés…', success: 'Sikeresen feltöltve', error: 'Nem sikerült' };
const hasQueued = computed(() => state.rows.some(row => row.status === 'queued'));
const waits = (retryAt: number) => Math.max(0, Math.ceil((retryAt - now.value) / 1000));
function select(event: Event) {
  const input = event.target as HTMLInputElement;
  batch.add(Array.from(input.files ?? []));
  input.value = '';
}
const size = (bytes: number) => bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1048576).toFixed(1)} MiB`;
</script>

<template>
  <section class="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" aria-labelledby="upload-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="upload-title" class="text-xl font-semibold">Képek feltöltése</h2>
      <span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">JPEG · PNG · WebP · GIF</span>
    </div>
    <p id="upload-help" class="mt-3 text-sm text-slate-600">Válassz legfeljebb 20 képet, fájlonként legfeljebb 100 MiB méretben. A szerver további korlátokat is ellenőriz.</p>
    <div class="mt-5 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/40 p-5">
      <label for="upload-files" class="block font-semibold">Képek kiválasztása</label>
      <input id="upload-files" type="file" multiple :accept="IMAGE_TYPES.join(',')" :disabled="disabled || state.running > 0 || state.authRequired" aria-describedby="upload-help upload-lifetime" class="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-semibold file:text-white disabled:opacity-60" @change="select" />
    </div>
    <p id="upload-lifetime" class="mt-3 text-xs leading-relaxed text-slate-500">A köteg csak ezen a megnyitott oldalon marad meg. Ne frissítsd és ne hagyd el az oldalt feltöltés közben. A megszakadt fájl újraküldése elölről indul; a korábbi tárhelyfoglalás megmaradhat.</p>
    <p v-if="state.selectionError" role="alert" class="mt-3 text-sm text-amber-800">{{ state.selectionError }}</p>
    <p v-if="!state.rows.length" class="mt-6 text-sm text-slate-500">Még nem választottál képet.</p>
    <div v-else class="mt-5">
      <p role="status" aria-live="polite" class="text-sm font-medium">{{ summary.success }} / {{ summary.total }} sikeres · {{ summary.failed }} hibás<span v-if="state.running"> · Folyamatban…</span></p>
      <button type="button" :disabled="disabled || !hasQueued || state.running > 0 || state.authRequired" class="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50" @click="batch.start">{{ state.running ? 'Feltöltés folyamatban…' : 'Feltöltés indítása' }}</button>
      <ul class="mt-5 space-y-3" aria-label="Kiválasztott képek">
        <li v-for="row in state.rows" :key="row.id" class="rounded-2xl border border-slate-200 p-4" :aria-busy="['initializing', 'uploading', 'confirming'].includes(row.status)">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <p class="min-w-0 break-all font-medium">{{ row.name }}</p>
            <span class="text-xs text-slate-500">{{ size(row.size) }}</span>
          </div>
          <p v-if="row.notice" class="mt-2 break-words text-sm text-indigo-700">{{ row.notice }}</p>
          <p class="mt-2 text-sm" :class="row.status === 'success' ? 'text-emerald-700' : row.status === 'error' ? 'text-red-700' : 'text-slate-600'">{{ labels[row.status] }}<span v-if="row.status === 'uploading'"> {{ row.progress }}%</span></p>
          <progress v-if="row.status === 'uploading'" :value="row.progress" max="100" :aria-label="`${row.name} átvitele`" class="mt-2 h-2 w-full accent-indigo-600" />
          <p v-if="row.status === 'confirming'" class="mt-1 text-xs text-slate-500">Az átvitel után a szerver ellenőrzése szükséges a sikerhez.</p>
          <p v-if="row.error" role="alert" class="mt-2 text-sm text-red-700">{{ row.error }}</p>
          <button v-if="row.status === 'error' && row.retryable" type="button" :disabled="disabled || waits(row.retryAt) > 0 || state.authRequired" :aria-label="`${row.name} újrapróbálása`" class="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50" @click="batch.retry(row.id)">Újrapróbálás<span v-if="waits(row.retryAt) > 0"> ({{ waits(row.retryAt) }} mp)</span></button>
        </li>
      </ul>
      <p v-if="!busy && summary.success" class="mt-4 text-sm text-emerald-800">A sikeres fájlok tárolása véglegesítve. A galéria automatikus frissítést kér. Ha a lista lekérése hibázik, használd a Lista frissítése gombot. A kiskép feldolgozási állapotát a galériában követheted.</p>
    </div>
    <p v-if="state.authRequired" role="alert" class="mt-4 text-sm text-red-700">A munkamenet lejárt, további fájlokat nem indítunk. <RouterLink to="/login" class="font-semibold underline">Bejelentkezés</RouterLink>. Az oldal elhagyásakor a köteg helyi állapota elveszik; a szerveroldali foglalások megmaradhatnak.</p>
  </section>
</template>
