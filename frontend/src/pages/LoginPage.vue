<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { authClient } from '../api/auth';
import { createAuthForm } from '../auth/form';

const router = useRouter();
const { state, submit, dispose } = createAuthForm('login', authClient, () => router.replace({ name: 'account' }));
onBeforeUnmount(dispose);
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <RouterLink to="/" class="mb-8 text-xl font-semibold text-indigo-600">CloudVault</RouterLink>
    <section class="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="login-title" :aria-busy="state.pending">
      <h1 id="login-title" class="text-2xl font-semibold">Bejelentkezés</h1>
      <p class="mt-3 text-sm text-slate-600">Lépj be a saját fiókodba.</p>
      <form class="mt-6 space-y-5" @submit.prevent="submit">
        <div>
          <label for="email" class="mb-2 block text-sm font-medium">E-mail-cím</label>
          <input id="email" v-model="state.email" type="email" name="email" autocomplete="username" maxlength="320" required :disabled="state.pending" :aria-invalid="Boolean(state.fields.email)" :aria-describedby="state.fields.email ? 'email-error' : undefined" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
          <p v-if="state.fields.email" id="email-error" class="mt-2 text-sm text-red-700">{{ state.fields.email }}</p>
        </div>
        <div>
          <label for="password" class="mb-2 block text-sm font-medium">Jelszó</label>
          <input id="password" v-model="state.password" type="password" name="password" autocomplete="current-password" maxlength="1024" required :disabled="state.pending" :aria-invalid="Boolean(state.fields.password)" :aria-describedby="state.fields.password ? 'password-error' : undefined" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
          <p v-if="state.fields.password" id="password-error" class="mt-2 text-sm text-red-700">{{ state.fields.password }}</p>
        </div>
        <p v-if="Object.keys(state.fields).length" role="alert" class="text-sm text-red-700">Javítsd a jelzett mezőket, majd próbáld újra.</p>
        <p v-if="state.error" role="alert" class="text-sm text-red-700">{{ state.error }}</p>
        <p v-if="state.pending" role="status" class="text-sm text-slate-600">Bejelentkezés folyamatban…</p>
        <button type="submit" :disabled="state.pending" class="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{{ state.pending ? 'Bejelentkezés…' : 'Bejelentkezés' }}</button>
      </form>
      <p class="mt-6 text-sm text-slate-600">Még nincs fiókod? <RouterLink to="/register" class="font-semibold text-indigo-600 underline">Regisztráció</RouterLink></p>
    </section>
  </main>
</template>
