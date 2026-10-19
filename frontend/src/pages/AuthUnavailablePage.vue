<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <h1 class="text-2xl font-semibold">A kapcsolat most nem ellenőrizhető</h1>
    <p role="alert" class="mt-4 leading-7 text-slate-600">A fiókod betöltése nem sikerült. Ellenőrizd az internetkapcsolatot, majd próbáld újra.</p>
    <RouterLink to="/app" class="mt-7 rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700">Újrapróbálás</RouterLink>
    <RouterLink to="/" class="mt-5 text-center text-indigo-600">Vissza a kezdőlapra</RouterLink>
  </main>
</template>
