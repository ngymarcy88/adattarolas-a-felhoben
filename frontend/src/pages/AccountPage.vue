<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { authClient, AuthRequestError } from '../api/auth';
import { session } from '../auth/session';

const router = useRouter();
const user = session.user;
const pending = ref(false);
const error = ref('');
let active = true;
let controller: AbortController | undefined;
async function logout() {
  if (pending.value) return;
  pending.value = true;
  error.value = '';
  controller = new AbortController();
  try {
    await authClient.logout(controller.signal);
    if (active) {
      session.user.value = null;
      await router.replace({ name: 'login' });
    }
  } catch (cause) {
    // A failed request does not prove that the browser cookie was cleared.
    if (active) error.value = cause instanceof AuthRequestError ? cause.message : 'A kijelentkezés nem sikerült. Próbáld újra.';
  } finally { if (active) pending.value = false; }
}
onBeforeUnmount(() => { active = false; controller?.abort(); });
</script>

<template>
  <main class="mx-auto min-h-screen max-w-2xl px-6 py-12">
    <RouterLink to="/" class="text-xl font-semibold text-indigo-600">CloudVault</RouterLink>
    <section v-if="user" class="mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="account-title" :aria-busy="pending">
      <h1 id="account-title" class="text-2xl font-semibold">Saját fiók</h1>
      <p class="mt-6 break-words text-lg font-medium">{{ user.displayName }}</p>
      <p class="mt-2 break-all text-slate-600">{{ user.email }}</p>
      <p v-if="error" role="alert" class="mt-5 text-sm text-red-700">{{ error }}</p>
      <button type="button" :disabled="pending" class="mt-7 rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60" @click="logout">{{ pending ? 'Kijelentkezés…' : 'Kijelentkezés' }}</button>
    </section>
  </main>
</template>
