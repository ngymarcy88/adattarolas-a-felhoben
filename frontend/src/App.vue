<script setup lang="ts">
import { session } from './auth/session';
const checking = session.checking;
import { RouterView } from 'vue-router';
</script>

<template>
  <main v-if="checking" class="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6" aria-busy="true">
    <p role="status" aria-live="polite">Munkamenet ellenőrzése…</p>
  </main>
  <RouterView v-else />
</template>
