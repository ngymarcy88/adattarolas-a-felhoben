<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{ url: string; version: number; name: string; large?: boolean }>();
const emit = defineEmits<{ failed: [version: number] }>();
// Parent keys this component by version. Late events from an old img cannot fail a newer request.
const version = props.version; const loading = ref(true);
</script>
<template>
  <span v-if="loading" role="status" class="block p-3 text-sm text-slate-500">Kép betöltése…</span>
  <img :src="url" :alt="name" crossorigin="anonymous" referrerpolicy="no-referrer" :loading="large ? 'eager' : 'lazy'" decoding="async"
    :class="large ? 'mx-auto max-h-[75vh] max-w-full object-contain' : 'h-full w-full object-cover'"
    @load="loading = false" @error="emit('failed', version)" />
</template>
