<script setup lang="ts">
const model = defineModel<string>({ required: true });
defineProps<{
  id: string;
  name: string;
  autocomplete: 'new-password' | 'current-password';
  visible: boolean;
  disabled: boolean;
  invalid: boolean;
  describedby?: string;
}>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <div class="relative">
    <input :id="id" v-model="model" :type="visible ? 'text' : 'password'" :name="name" :autocomplete="autocomplete" maxlength="1024" required :disabled="disabled" :aria-invalid="invalid" :aria-describedby="describedby" class="w-full rounded-xl border border-slate-300 py-3 pl-3 pr-24" />
    <button type="button" :disabled="disabled" :aria-controls="id" :aria-pressed="visible" :aria-label="id === 'password-confirmation' ? 'Jelszómegerősítés megjelenítése' : 'Jelszó megjelenítése'" class="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60" @click="$emit('toggle')">{{ visible ? 'Elrejtés' : 'Mutatás' }}</button>
  </div>
</template>
