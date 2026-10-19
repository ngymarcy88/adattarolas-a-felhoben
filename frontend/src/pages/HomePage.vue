<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchHealth, parseApiBaseUrl } from '../api/health';

type ConnectionState = 'loading' | 'available' | 'error';
const state = ref<ConnectionState>('loading');
let controller: AbortController | undefined;
let active = true;
const statusLabel = computed(() => ({
  loading: 'Kapcsolat ellenőrzése…',
  available: 'Az alkalmazásszerver elérhető',
  error: 'A kapcsolat nem ellenőrizhető',
})[state.value]);

async function checkConnection() {
  if (controller) controller.abort();
  controller = new AbortController();
  const request = controller;
  const timeout = window.setTimeout(() => request.abort(), 5000);
  state.value = 'loading';
  try {
    await fetchHealth(parseApiBaseUrl(import.meta.env.VITE_API_BASE_URL), request.signal);
    if (active && request === controller) state.value = 'available';
  } catch {
    if (active && request === controller) state.value = 'error';
  } finally {
    window.clearTimeout(timeout);
  }
}

onMounted(checkConnection);
onBeforeUnmount(() => { active = false; controller?.abort(); });
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col px-6 sm:px-10">
    <header class="flex items-center justify-between border-b border-slate-200 py-6 sm:py-8">
      <a href="/" class="flex items-center gap-3 text-xl font-semibold tracking-tight" aria-label="CloudVault kezdőlap">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M7 18a5 5 0 0 1-1-9.9 6 6 0 0 1 11.6-1A5.5 5.5 0 0 1 18 18H7Z" />
          </svg>
        </span>
        CloudVault
      </a>
      <span class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 sm:text-sm">Fejlesztési alap</span>
    </header>

    <main class="flex flex-1 flex-col justify-center py-16 sm:py-24">
      <div class="grid items-start gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
        <div>
          <p class="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Adattárolás a felhőben</p>
          <h1 class="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">A médiáid helye.<br /><span class="text-slate-400">Lépésről lépésre.</span></h1>
          <p class="mt-6 max-w-lg text-base leading-7 text-slate-600">A CloudVault személyes képek és videók kezelésére készül. Ez a kezdőoldal az alkalmazás technikai alapját és a szerverkapcsolat állapotát mutatja.</p>
          <p class="mt-4 max-w-lg text-sm leading-6 text-slate-500">Hozz létre fiókot, vagy jelentkezz be. A fájlkezelés hamarosan érkezik.</p>
          <RouterLink to="/register" class="mt-7 mr-4 inline-block rounded-xl border border-indigo-200 px-5 py-3 font-semibold text-indigo-600 hover:bg-indigo-50">Regisztráció</RouterLink>
          <RouterLink to="/app" class="mt-7 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">Saját fiók</RouterLink>
        </div>

        <section class="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9" aria-labelledby="connection-title" :aria-busy="state === 'loading'">
          <div class="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="4" y="3" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5" stroke-linecap="round" />
            </svg>
          </div>
          <h2 id="connection-title" class="text-lg font-semibold">Szerverkapcsolat</h2>
          <div role="status" aria-live="polite" class="mt-4">
            <p class="flex items-center gap-2.5 text-sm font-medium" :class="state === 'error' ? 'text-amber-800' : 'text-slate-700'">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="{ 'animate-pulse bg-slate-400': state === 'loading', 'bg-emerald-500': state === 'available', 'bg-amber-500': state === 'error' }" aria-hidden="true"></span>
              {{ statusLabel }}
            </p>
            <p class="mt-3 text-sm leading-6 text-slate-500">{{ state === 'available' ? 'Az alap API válaszol. A fájlkezelési funkciók fejlesztés alatt állnak.' : state === 'error' ? 'Az alkalmazásszerver átmenetileg nem érhető el, vagy a kapcsolat beállítása ellenőrzést igényel.' : 'Rövid ellenőrzéssel megvizsgáljuk az alkalmazásszerver elérhetőségét.' }}</p>
          </div>
          <button type="button" class="mt-7 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-50" :disabled="state === 'loading'" @click="checkConnection">{{ state === 'loading' ? 'Ellenőrzés folyamatban…' : 'Újraellenőrzés' }}</button>
        </section>
      </div>
    </main>

    <footer class="border-t border-slate-200 py-6 text-xs leading-5 text-slate-500 sm:text-sm">CloudVault · Szakdolgozati projekt · Kezdeti fejlesztési változat</footer>
  </div>
</template>
