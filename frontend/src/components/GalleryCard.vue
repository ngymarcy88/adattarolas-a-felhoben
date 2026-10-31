<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GalleryFile } from '../api/gallery';
import type { Previews } from '../gallery/previews';
import { observeVisibility } from '../gallery/modal';
import type { Processing } from '../gallery/processing';
import GalleryImage from './GalleryImage.vue';
const props = defineProps<{ file: GalleryFile; previews: Previews; processing: Processing; now: number; disabled?: boolean }>();
const emit = defineEmits<{ open: [opener: HTMLElement] }>();
const button = ref<HTMLButtonElement | null>(null); const visible = ref(false); let unobserve: (() => void) | undefined;
function open() { if (button.value) emit('open', button.value); }
const entry = computed(() => props.previews.state.entries[props.file.id]);
const job = computed(() => props.processing.state.entries[props.file.id]);
const ready = computed(() => job.value?.status?.state === 'SUCCEEDED' && !!job.value.status.result);
const jobWait = computed(() => Math.max(0, Math.ceil((props.processing.state.retryAt - props.now) / 1000)));
const statusText = computed(() => ({ NOT_SCHEDULED: 'Kiskép nincs ütemezve', QUEUED: 'Kisképre várakozik', RUNNING: 'Kiskép készítése…',
  RETRY_WAIT: 'Újabb feldolgozásra vár', SUCCEEDED: ready.value ? 'Kiskép elkészült' : 'A kiskép nem érhető el',
  FAILED: 'A kiskép feldolgozása sikertelen', BLOCKED_QUOTA: 'Nincs elég tárhely a kisképhez', CANCELLED: 'A kiskép feldolgozása leállt' })[job.value?.status?.state ?? 'NOT_SCHEDULED']);
const wait = computed(() => Math.max(0, Math.ceil((Math.max(entry.value?.retryAt ?? 0, props.previews.state.retryAt) - props.now) / 1000)));
watch(() => job.value?.status?.result?.id, () => props.previews.invalidate(props.file.id));
watch(() => [visible.value, props.disabled, ready.value, entry.value === undefined], () => { if (visible.value && !props.disabled && ready.value) props.previews.request(props.file.id); });
onMounted(() => { if (button.value) unobserve = observeVisibility(button.value, value => { visible.value = value; props.processing.setVisible(props.file.id, value); }); });
onBeforeUnmount(() => unobserve?.());
const date = (value: string) => new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1048576 ? 'KiB' : bytes < 1073741824 ? 'MiB' : 'GiB';
  const divisor = unit === 'KiB' ? 1024 : unit === 'MiB' ? 1048576 : 1073741824;
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(bytes / divisor)} ${unit}`;
}
</script>
<template>
  <li class="min-w-0 rounded-2xl border border-slate-200 p-4">
    <button ref="button" type="button" :disabled="disabled" :aria-label="`Nagy előnézet: ${file.originalName}`" class="relative mb-4 block aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 disabled:opacity-50" @click="open">
      <GalleryImage v-if="ready && entry?.phase === 'ready' && entry.url" :key="entry.version" :url="entry.url" :version="entry.version" :name="file.originalName" @failed="previews.imageFailed(file.id, $event)" />
      <span v-else-if="entry?.phase === 'queued' || entry?.phase === 'loading'" role="status" class="p-3 text-sm text-slate-600">Kiskép betöltése…</span>
      <span v-else class="p-3 text-sm text-slate-600">{{ entry?.phase === 'error' ? 'A kiskép nem érhető el' : 'Kép megnyitása' }}</span>
    </button>
    <p role="status" aria-live="polite" class="mb-3 text-sm text-slate-600">{{ job?.status ? statusText : job?.error ? 'Feldolgozási állapot nem érhető el' : 'Feldolgozási állapot betöltése…' }}</p>
    <p v-if="job?.error" role="alert" class="mb-2 text-sm text-red-700">{{ job.error }}</p>
    <button v-if="job?.error" type="button" :disabled="disabled || jobWait > 0 || job.loading" class="mb-3 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50" @click="processing.refresh(file.id)">Állapot újrapróbálása<span v-if="jobWait"> ({{ jobWait }} mp)</span></button>
    <p v-if="job?.status?.cleanupPending" class="mb-2 text-xs text-slate-500">Egy korábbi feldolgozás tárhelyfoglalásának rendezése még szükséges.</p>
    <p v-if="job?.retryError" role="alert" class="mb-2 text-sm text-red-700">{{ job.retryError }}</p>
    <button v-if="processing.canRetry(file.id)" type="button" :disabled="disabled || !!processing.state.retryingId || jobWait > 0" :aria-label="`${file.originalName} kiskép-feldolgozásának újrapróbálása`" class="mb-3 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold disabled:opacity-50" @click="processing.retry(file.id)">{{ processing.state.retryingId === file.id ? 'Feldolgozás indítása…' : 'Feldolgozás újrapróbálása' }}<span v-if="jobWait"> ({{ jobWait }} mp)</span></button>
    <p v-if="!ready || entry?.phase === 'error'" class="mb-3 text-xs text-slate-500">Az eredeti kép a fenti gombbal megnyitható.</p>
    <h3 class="break-all font-semibold">{{ file.originalName }}</h3>
    <dl class="mt-4 space-y-2 text-sm"><div><dt class="text-slate-500">Méret</dt><dd class="font-medium">{{ size(file.sizeBytes) }}</dd></div>
      <div><dt class="text-slate-500">Létrehozva</dt><dd><time :datetime="file.createdAt">{{ date(file.createdAt) }}</time></dd></div></dl>
    <p v-if="entry?.error" role="alert" class="mt-3 text-sm text-red-700">{{ entry.error }}</p>
    <button v-if="entry?.phase === 'error' && entry.retryable" type="button" :disabled="disabled || wait > 0" :aria-label="`${file.originalName} kiskép letöltésének újrapróbálása`" class="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50" @click="previews.retry(file.id)">Kiskép újrapróbálása<span v-if="wait"> ({{ wait }} mp)</span></button>
  </li>
</template>
