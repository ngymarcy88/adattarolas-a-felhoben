<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { galleryClient } from '../api/gallery';
import { createGallery } from '../gallery/state';

const props = defineProps<{ ownerId: string; disabled?: boolean }>();
const emit = defineEmits<{ unauthorized: [ownerId: string] }>();
const gallery = createGallery(galleryClient, () => emit('unauthorized', props.ownerId));
const { state } = gallery;
const now = ref(Date.now()); let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { void gallery.refresh(); timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { clearInterval(timer); gallery.dispose(); });
const wait = computed(() => Math.max(0, Math.ceil((state.retryAt - now.value) / 1000)));
const blocked = computed(() => props.disabled || !!state.loading || wait.value > 0 || state.unauthorized);
const date = (value: string) => new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1048576 ? 'KiB' : bytes < 1073741824 ? 'MiB' : 'GiB';
  const divisor = unit === 'KiB' ? 1024 : unit === 'MiB' ? 1048576 : 1073741824;
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}
</script>

<template>
  <section class="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" aria-labelledby="gallery-title" :aria-busy="!!state.loading || (!state.loaded && !state.error)">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="gallery-title" class="text-xl font-semibold">Képgaléria</h2>
      <button type="button" :disabled="blocked" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50" @click="gallery.refresh">Lista frissítése</button>
    </div>
    <p class="mt-3 text-sm text-slate-600">A képeid fájlneve, mérete és létrehozási ideje. A képes előnézet később válik elérhetővé.</p>
    <p v-if="state.loading === 'refresh' || (!state.loaded && !state.error)" role="status" aria-live="polite" class="mt-5 text-sm text-slate-600">Képek listájának betöltése…</p>
    <div v-if="state.error" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
      <p role="alert" class="text-sm text-red-700">{{ state.error }}</p>
      <p v-if="state.resetRequired && state.loaded" class="mt-2 text-xs text-slate-600">Az eddigi kártyák megmaradnak. Az újrapróbálás az első oldalt tölti újra.</p>
      <button v-if="!state.unauthorized" type="button" :disabled="blocked" class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" @click="gallery.retry">Újrapróbálás<span v-if="wait"> ({{ wait }} mp)</span></button>
    </div>
    <div v-if="state.loaded && !state.items.length && !state.error && !state.loading" class="mt-6 rounded-2xl bg-slate-50 p-6 text-center">
      <p class="font-medium">Még nincs feltöltött képed.</p>
      <a href="#upload-title" class="mt-3 inline-block font-semibold text-indigo-700 underline">Képek feltöltése</a>
    </div>
    <template v-if="state.items.length">
      <p role="status" aria-live="polite" class="mt-5 text-sm text-slate-500">{{ state.items.length }} betöltött kép</p>
      <ul class="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Saját képek">
        <li v-for="file in state.items" :key="file.id" class="min-w-0 rounded-2xl border border-slate-200 p-4">
          <h3 class="break-all font-semibold">{{ file.originalName }}</h3>
          <dl class="mt-4 space-y-2 text-sm">
            <div><dt class="text-slate-500">Méret</dt><dd class="font-medium">{{ size(file.sizeBytes) }}</dd></div>
            <div><dt class="text-slate-500">Létrehozva</dt><dd><time :datetime="file.createdAt">{{ date(file.createdAt) }}</time></dd></div>
          </dl>
        </li>
      </ul>
    </template>
    <p v-if="state.loading === 'more'" role="status" aria-live="polite" class="mt-4 text-sm text-slate-600">További képek betöltése…</p>
    <button v-if="state.nextCursor && !state.error && !state.resetRequired" type="button" :disabled="blocked" class="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" @click="gallery.loadMore">További képek</button>
  </section>
</template>
