<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { GalleryFile } from '../api/gallery';
import type { Previews } from '../gallery/previews';
import { mountModal } from '../gallery/modal';
import GalleryImage from './GalleryImage.vue';
const props = defineProps<{ file: GalleryFile; previews: Previews; now: number; disabled?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null); const close = ref<HTMLButtonElement | null>(null); let cleanup: (() => void) | undefined;
const entry = computed(() => props.previews.state.entries[props.file.id]);
const wait = computed(() => Math.max(0, Math.ceil((Math.max(entry.value?.retryAt ?? 0, props.previews.state.retryAt) - props.now) / 1000)));
onMounted(() => { if (dialog.value && close.value) cleanup = mountModal(dialog.value, close.value); });
onBeforeUnmount(() => cleanup?.());
</script>
<template>
  <dialog ref="dialog" aria-modal="true" aria-labelledby="preview-dialog-title" aria-describedby="preview-dialog-help" class="fixed inset-0 m-auto max-h-[95vh] w-[min(95vw,72rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/70" @cancel.prevent="emit('close')">
    <div class="mb-4 flex items-start justify-between gap-4"><h2 id="preview-dialog-title" class="break-all text-lg font-semibold">{{ file.originalName }}</h2>
      <button ref="close" autofocus type="button" class="shrink-0 rounded-lg border border-slate-300 px-4 py-2 font-semibold" @click="emit('close')">Bezárás</button></div>
    <p id="preview-dialog-help" class="mb-4 text-sm text-slate-500">Nagy előnézet. Az Escape billentyűvel vagy a Bezárás gombbal léphetsz vissza.</p>
    <GalleryImage v-if="entry?.phase === 'ready' && entry.url" :key="entry.version" :url="entry.url" :version="entry.version" :name="file.originalName" large @failed="previews.imageFailed(file.id, $event)" />
    <p v-else-if="!entry || entry.phase === 'queued' || entry.phase === 'loading'" role="status">Előnézet betöltése…</p>
    <p v-if="entry?.error" role="alert" class="text-sm text-red-700">{{ entry.error }}</p>
    <button v-if="entry?.phase === 'error' && entry.retryable" type="button" :disabled="disabled || wait > 0" class="mt-4 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50" @click="previews.retry(file.id)">Kép újrapróbálása<span v-if="wait"> ({{ wait }} mp)</span></button>
  </dialog>
</template>
