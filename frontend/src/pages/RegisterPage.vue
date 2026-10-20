<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { authClient } from '../api/auth';
import { createAuthForm } from '../auth/form';
import PasswordInput from '../components/PasswordInput.vue';

const { state, requirements, togglePasswordVisibility, submit, dispose } = createAuthForm('register', authClient, async () => {});
onBeforeUnmount(dispose);
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <RouterLink to="/" class="mb-8 text-xl font-semibold text-indigo-600">CloudVault</RouterLink>
    <section class="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="register-title" :aria-busy="state.pending">
      <h1 id="register-title" class="text-2xl font-semibold">Regisztráció</h1>
      <div v-if="state.registered" class="mt-6">
        <p role="status" class="leading-7 text-emerald-800">Sikeres regisztráció. Most jelentkezz be az új fiókoddal.</p>
        <RouterLink to="/login" class="mt-6 block rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700">Tovább a bejelentkezéshez</RouterLink>
      </div>
      <template v-else>
        <p class="mt-3 text-sm text-slate-600">Hozd létre a saját fiókodat.</p>
        <form class="mt-6 space-y-5" @submit.prevent="submit">
          <div>
            <label for="display-name" class="mb-2 block text-sm font-medium">Megjelenítési név</label>
            <input id="display-name" v-model="state.displayName" type="text" name="displayName" autocomplete="nickname" maxlength="200" required :disabled="state.pending" :aria-invalid="Boolean(state.fields.displayName)" :aria-describedby="state.fields.displayName ? 'name-error' : undefined" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
            <p v-if="state.fields.displayName" id="name-error" class="mt-2 text-sm text-red-700">{{ state.fields.displayName }}</p>
          </div>
          <div>
            <label for="email" class="mb-2 block text-sm font-medium">E-mail-cím</label>
            <input id="email" v-model="state.email" type="email" name="email" autocomplete="username" maxlength="320" required :disabled="state.pending" :aria-invalid="Boolean(state.fields.email)" :aria-describedby="state.fields.email ? 'email-error' : undefined" class="w-full rounded-xl border border-slate-300 px-3 py-3" />
            <p v-if="state.fields.email" id="email-error" class="mt-2 text-sm text-red-700">{{ state.fields.email }}</p>
          </div>
          <div>
            <label for="password" class="mb-2 block text-sm font-medium">Jelszó</label>
            <PasswordInput id="password" v-model="state.password" name="password" autocomplete="new-password" :disabled="state.pending" :invalid="Boolean(state.fields.password)" :describedby="state.fields.password ? 'password-hint password-error' : 'password-hint'" :visible="state.passwordVisible" @toggle="togglePasswordVisibility('password')" />
            <div id="password-hint" class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p class="mb-2 font-medium text-slate-700">Jelszókövetelmények</p>
              <ul class="space-y-1" aria-live="polite" aria-atomic="true">
                <li v-for="rule in requirements" :key="rule.key" :class="rule.met ? 'text-emerald-800' : state.password || state.fields.password ? 'text-red-700' : 'text-slate-600'">
                  {{ rule.met ? '✓ Teljesítve: ' : state.password || state.fields.password ? 'Hiányzik: ' : '– ' }}{{ rule.label }}
                </li>
              </ul>
              <p class="mt-2 text-xs text-slate-500">Szóköz és ékezet is használható; legfeljebb 1024 UTF-8 bájt. A szóköz nem speciális karakter.</p>
            </div>
            <p v-if="state.fields.password" id="password-error" class="mt-2 text-sm text-red-700">{{ state.fields.password }}</p>
          </div>
          <div>
            <label for="password-confirmation" class="mb-2 block text-sm font-medium">Jelszó megerősítése</label>
            <PasswordInput id="password-confirmation" v-model="state.passwordConfirmation" name="passwordConfirmation" autocomplete="new-password" :disabled="state.pending" :invalid="Boolean(state.fields.passwordConfirmation)" :describedby="state.fields.passwordConfirmation ? 'confirmation-error' : undefined" :visible="state.passwordConfirmationVisible" @toggle="togglePasswordVisibility('passwordConfirmation')" />
            <p v-if="state.fields.passwordConfirmation" id="confirmation-error" class="mt-2 text-sm text-red-700">{{ state.fields.passwordConfirmation }}</p>
          </div>
          <p v-if="Object.keys(state.fields).length" role="alert" class="text-sm text-red-700">Javítsd a jelzett mezőket, majd próbáld újra.</p>
          <p v-if="state.error" role="alert" class="text-sm text-red-700">{{ state.error }}</p>
          <p v-if="state.pending" role="status" class="text-sm text-slate-600">Fiók létrehozása folyamatban…</p>
          <button type="submit" :disabled="state.pending" class="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{{ state.pending ? 'Regisztráció…' : 'Fiók létrehozása' }}</button>
        </form>
        <p class="mt-6 text-sm text-slate-600">Már van fiókod? <RouterLink to="/login" class="font-semibold text-indigo-600 underline">Bejelentkezés</RouterLink></p>
      </template>
    </section>
  </main>
</template>
