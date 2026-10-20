import { reactive } from 'vue';
import { AuthRequestError, type AuthClient } from '../api/auth';

type Field = 'email' | 'displayName' | 'password' | 'passwordConfirmation';
const isWellFormed = (value: string) => !Array.from(value).some((char) => {
  const point = char.codePointAt(0)!;
  return point >= 0xd800 && point <= 0xdfff;
});

/** Shared form behavior; the backend remains authoritative for validation. */
export function createAuthForm(mode: 'login' | 'register', client: AuthClient, onLogin: () => Promise<unknown>) {
  const state = reactive({ email: '', displayName: '', password: '', passwordConfirmation: '',
    pending: false, registered: false, error: '', fields: {} as Partial<Record<Field, string>> });
  let active = true;
  let controller: AbortController | undefined;
  const clearPasswords = () => { state.password = ''; state.passwordConfirmation = ''; };

  function validate(): boolean {
    state.fields = {};
    if (!state.email.trim() || state.email.length > 320) state.fields.email = 'Adj meg egy érvényes e-mail-címet.';
    if (!state.password || state.password.length > 1024 || new TextEncoder().encode(state.password).length > 1024 || !isWellFormed(state.password)) {
      state.fields.password = 'Adj meg egy legfeljebb 1024 bájtos, érvényes jelszót.';
    }
    if (mode === 'register') {
      const name = state.displayName.trim();
      if (!name || state.displayName.length > 200 || Array.from(name).length > 100 || !isWellFormed(name) || /[\u0000-\u001f\u007f-\u009f]/.test(name)) {
        state.fields.displayName = 'A megjelenítési név 1–100 karakter lehet, vezérlőkarakter nélkül.';
      }
      if (!state.fields.password && Array.from(state.password).length < 15) state.fields.password = 'A jelszó legalább 15 karakter legyen.';
      if (state.password !== state.passwordConfirmation) state.fields.passwordConfirmation = 'A két jelszó nem egyezik.';
    }
    return Object.keys(state.fields).length === 0;
  }

  async function submit(): Promise<void> {
    if (!active || state.pending || state.registered) return;
    state.error = '';
    if (!validate()) return;
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

  return { state, submit, dispose() { active = false; controller?.abort(); clearPasswords(); } };
}
