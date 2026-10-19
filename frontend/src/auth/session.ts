import { ref, shallowRef } from 'vue';
import type { NavigationGuard } from 'vue-router';
import { AuthRequestError, type AuthUser } from '../api/auth';

export function createSessionState() {
  return { user: shallowRef<AuthUser | null>(null), checking: ref(false) };
}
export const session = createSessionState();

export function createSessionGuard(state: ReturnType<typeof createSessionState>, loadUser: (signal: AbortSignal) => Promise<AuthUser>): NavigationGuard {
  let navigation = 0;
  let controller: AbortController | undefined;
  return async (to) => {
    const attempt = ++navigation;
    controller?.abort();
    state.user.value = null;
    state.checking.value = to.meta.requiresAuth === true;
    if (!state.checking.value) return true;
    controller = new AbortController();
    try {
      const user = await loadUser(controller.signal);
      if (attempt !== navigation) return false;
      state.user.value = user;
      return true;
    } catch (error) {
      if (attempt !== navigation) return false;
      return { name: error instanceof AuthRequestError && error.code === 'unauthorized' ? 'login' : 'auth-unavailable' };
    } finally {
      if (attempt === navigation) state.checking.value = false;
    }
  };
}
