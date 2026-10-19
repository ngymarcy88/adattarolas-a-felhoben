<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { authClient, AuthRequestError } from '../api/auth';

const router = useRouter();
const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref('');
let active = true;
let controller: AbortController | undefined;
async function submit() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  controller = new AbortController();
  try {
    await authClient.login(email.value, password.value, controller.signal);
    password.value = '';
    if (active) await router.replace({ name: 'account' });
  } catch (cause) {
    if (active) error.value = cause instanceof AuthRequestError ? cause.message : 'A bejelentkezés nem sikerült. Próbáld újra.';
  } finally {
    password.value = '';
    if (active) pending.value = false;
  }
}
onBeforeUnmount(() => { active = false; controller?.abort(); password.value = ''; });
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <RouterLink to="/" class="mb-8 text-xl font-semibold text-indigo-600">CloudVault</RouterLink>
    <section class="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="login-title" :aria-busy="pending">
      <h1 id="login-title" class="text-2xl font-semibold">Bejelentkezés</h1>
      <p class="mt-3 text-sm text-slate-600">Lépj be a saját fiókodba.</p>
      <form class="mt-6 space-y-5" @submit.prevent="submit">
        <div>
          <label for="email" class="mb-2 block text-sm font-medium">E-mail-cím</label>
          <input id="email" v-model="email" type="email" name="email" autocomplete="username" maxlength="320" required :disabled="pending" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
        </div>
        <div>
          <label for="password" class="mb-2 block text-sm font-medium">Jelszó</label>
          <input id="password" v-model="password" type="password" name="password" autocomplete="current-password" maxlength="1024" required :disabled="pending" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
        </div>
        <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
        <button type="submit" :disabled="pending" class="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{{ pending ? 'Bejelentkezés…' : 'Bejelentkezés' }}</button>
      </form>
    </section>
  </main>
</template>
