<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { galleryClient } from '../api/gallery';
import { previewClient, thumbnailClient } from '../api/preview';
import { processingClient } from '../api/processing';
import { createProcessing } from '../gallery/processing';
import { createGallery } from '../gallery/state';
import { createPreviews, createPreviewPool } from '../gallery/previews';
import { restoreModalFocus, bindPageVisibility } from '../gallery/modal';
import GalleryCard from './GalleryCard.vue';
import PreviewDialog from './PreviewDialog.vue';

const props = defineProps<{ ownerId: string; disabled?: boolean; refreshVersion?: number }>();
const emit = defineEmits<{ unauthorized: [ownerId: string] }>();
function expired() { gallery.dispose(); previews.dispose(); thumbnails.dispose(); processing.dispose(); closePreview(); emit('unauthorized', props.ownerId); }
const gallery = createGallery(galleryClient, expired);
const pool = createPreviewPool();
const previews = createPreviews(pool(previewClient), expired);
const thumbnails = createPreviews(pool(thumbnailClient), expired);
const processing = createProcessing(processingClient, expired);
const hidden = ref(false);
const inactive = computed(() => !!props.disabled || hidden.value);
watch(() => props.refreshVersion, () => gallery.requestRefresh());
const { state } = gallery;
const selectedId = ref<string | null>(null); const refreshButton = ref<HTMLButtonElement | null>(null);
const selected = computed(() => state.items.find(file => file.id === selectedId.value));
let opener: HTMLElement | null = null; let alive = true;
function openPreview(id: string, button: HTMLElement) {
  if (props.disabled) return;
  opener = button; selectedId.value = id; previews.request(id);
}
function closePreview() {
  if (!selectedId.value) return;
  const returnTo = opener; opener = null;
  selectedId.value = null;
  void nextTick(() => { if (alive && !selectedId.value) restoreModalFocus(returnTo, refreshButton.value); });
}
watch(() => state.items.map(file => file.id), ids => {
  processing.retain(ids); thumbnails.retain(inactive.value ? [] : ids); previews.retain(ids); if (selectedId.value && !ids.includes(selectedId.value)) closePreview();
}, { immediate: true, flush: 'sync' });
const now = ref(Date.now()); let timer: ReturnType<typeof setInterval> | undefined;
let stopVisibility: (() => void) | undefined;
watch(inactive, value => {
  processing.setActive(!value); thumbnails.retain(value ? [] : state.items.map(file => file.id));
}, { immediate: true, flush: 'sync' });
onMounted(() => { stopVisibility = bindPageVisibility(value => { hidden.value = value; }, document); void gallery.refresh(); timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { alive = false; clearInterval(timer); gallery.dispose(); previews.dispose(); thumbnails.dispose(); processing.dispose(); stopVisibility?.(); });
const wait = computed(() => Math.max(0, Math.ceil((state.retryAt - now.value) / 1000)));
const blocked = computed(() => props.disabled || !!state.loading || wait.value > 0 || state.unauthorized);
async function refreshGallery() {
  await gallery.refresh();
  if (alive && state.loaded && !state.error && !state.loading) { previews.clearErrors(); thumbnails.clearErrors(); processing.refresh(); }
}
</script>

<template>
  <section class="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" aria-labelledby="gallery-title" :aria-busy="!!state.loading || (!state.loaded && !state.error)">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="gallery-title" class="text-xl font-semibold">Képgaléria</h2>
      <button ref="refreshButton" type="button" :disabled="blocked" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50" @click="refreshGallery">Lista frissítése</button>
    </div>
    <p class="mt-3 text-sm text-slate-600">A kártyákon kiskép látható, amint elkészül. Kattints a képre az eredeti nagy előnézetéhez.</p>
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
        <GalleryCard v-for="file in state.items" :key="file.id" :file="file" :previews="thumbnails" :processing="processing" :now="now" :disabled="inactive" @open="openPreview(file.id, $event)" />
      </ul>
    </template>
    <p v-if="state.loading === 'more'" role="status" aria-live="polite" class="mt-4 text-sm text-slate-600">További képek betöltése…</p>
    <button v-if="state.nextCursor && !state.error && !state.resetRequired" type="button" :disabled="blocked" class="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" @click="gallery.loadMore">További képek</button>
    <PreviewDialog v-if="selected" :file="selected" :previews="previews" :now="now" :disabled="disabled" @close="closePreview" />
  </section>
</template>
