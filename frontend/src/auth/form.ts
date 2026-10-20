import { computed, reactive, watch } from 'vue';
import { AuthRequestError, type AuthClient } from '../api/auth';
import { passwordRequirements } from './password-policy';

type Field = 'email' | 'displayName' | 'password' | 'passwordConfirmation';
const isWellFormed = (value: string) => !Array.from(value).some((char) => {
  const point = char.codePointAt(0)!;
  return point >= 0xd800 && point <= 0xdfff;
});

/** Shared form behavior; the backend remains authoritative for validation. */
export function createAuthForm(mode: 'login' | 'register', client: AuthClient, onLogin: () => Promise<unknown>) {
  const state = reactive({ email: '', displayName: '', password: '', passwordConfirmation: '',
    passwordVisible: false, passwordConfirmationVisible: false,
    pending: false, registered: false, error: '', fields: {} as Partial<Record<Field, string>> });
  const requirements = computed(() => passwordRequirements(state.password));
  const validPasswordInput = (value: string) => Boolean(value) && value.length <= 1024 &&
    new TextEncoder().encode(value).length <= 1024 && isWellFormed(value);
  const stopPasswordWatch = watch(() => state.password, (value) => {
    if (mode === 'register' && validPasswordInput(value) && requirements.value.every((rule) => rule.met)) {
      delete state.fields.password;
    }
  }, { flush: 'sync' });
  let active = true;
  let controller: AbortController | undefined;
  const hidePasswords = () => { state.passwordVisible = false; state.passwordConfirmationVisible = false; };
  const clearPasswords = () => { state.password = ''; state.passwordConfirmation = ''; hidePasswords(); };
  function togglePasswordVisibility(field: 'password' | 'passwordConfirmation'): void {
    if (!active || state.pending || state.registered) return;
    const key = field === 'password' ? 'passwordVisible' : 'passwordConfirmationVisible';
    state[key] = !state[key];
  }

  function validate(): boolean {
    state.fields = {};
    if (!state.email.trim() || state.email.length > 320) state.fields.email = 'Adj meg egy érvényes e-mail-címet.';
    if (!validPasswordInput(state.password)) {
      state.fields.password = 'Adj meg egy legfeljebb 1024 bájtos, érvényes jelszót.';
    }
    if (mode === 'register') {
      const name = state.displayName.trim();
      if (!name || state.displayName.length > 200 || Array.from(name).length > 100 || !isWellFormed(name) || /[\u0000-\u001f\u007f-\u009f]/.test(name)) {
        state.fields.displayName = 'A megjelenítési név 1–100 karakter lehet, vezérlőkarakter nélkül.';
      }
      if (!state.fields.password && requirements.value.some((rule) => !rule.met)) {
        state.fields.password = 'A jelszó még nem teljesíti a jelzett követelményeket.';
      }
      if (state.password !== state.passwordConfirmation) state.fields.passwordConfirmation = 'A két jelszó nem egyezik.';
    }
    return Object.keys(state.fields).length === 0;
  }

  async function submit(): Promise<void> {
    if (!active || state.pending || state.registered) return;
    state.error = '';
    if (!validate()) return;
    hidePasswords();
    state.pending = true;
    controller = new AbortController();
    try {
      if (mode === 'register') {
        await client.register(state.email, state.displayName, state.password, controller.signal);
        if (active) state.registered = true;
      } else {
        await client.login(state.email, state.password, controller.signal);
        clearPasswords();
        if (active) await onLogin();
      }
    } catch (error) {
      if (active) state.error = error instanceof AuthRequestError ? error.message : 'A művelet nem sikerült. Próbáld újra.';
    } finally {
      clearPasswords();
      if (active) state.pending = false;
    }
  }

  return { state, requirements, togglePasswordVisibility, submit, dispose() { active = false; stopPasswordWatch(); controller?.abort(); clearPasswords(); } };
}
