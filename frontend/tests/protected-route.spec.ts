import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { AuthRequestError, type AuthClient, type AuthUser } from '../src/api/auth';
import { createSessionState } from '../src/auth/session';
import { createAppRouter } from '../src/router';

const user: AuthUser = { id: '00000000-0000-4000-8000-000000000001', email: 'unit@example.test', displayName: 'Unit User', createdAt: '2026-10-19T10:00:00.000Z' };
function fixture(currentUser = vi.fn().mockResolvedValue(user)) {
  const state = createSessionState();
  const client: AuthClient = { currentUser, login: vi.fn(), logout: vi.fn() };
  return { state, currentUser, router: createAppRouter(createMemoryHistory(), client, state) };
}

describe('Protected application route', () => {
  it('does not call auth for public routes, including recovery/login', async () => {
    const { router, currentUser } = fixture();
    for (const path of ['/', '/login', '/auth-unavailable']) await router.push(path);
    expect(currentUser).not.toHaveBeenCalled();
  });
  it('verifies a direct /app entry before retaining a public user', async () => {
    const { router, state, currentUser } = fixture();
    await router.push('/app');
    expect(currentUser).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('account');
    expect(state.user.value).toEqual(user); expect(state.checking.value).toBe(false);
  });
  it('does not trust an existing client-side user when the cookie is invalid', async () => {
    const { router, state } = fixture(vi.fn().mockRejectedValue(new AuthRequestError('unauthorized')));
    state.user.value = user;
    await router.push('/app');
    expect(router.currentRoute.value.name).toBe('login');
    expect(state.user.value).toBeNull(); expect(state.checking.value).toBe(false);
  });
  it.each([new AuthRequestError('unavailable'), new AuthRequestError('rate_limited'), new Error('private')])
    ('uses retry state instead of claiming logout on transient failure %#', async (error) => {
      const { router, state } = fixture(vi.fn().mockRejectedValue(error));
      await router.push('/app');
      expect(router.currentRoute.value.name).toBe('auth-unavailable'); expect(state.user.value).toBeNull();
    });
  it('allows retry from the unavailable route after recovery', async () => {
    const lookup = vi.fn().mockRejectedValueOnce(new AuthRequestError('unavailable')).mockResolvedValue(user);
    const { router, state } = fixture(lookup);
    await router.push('/app'); expect(router.currentRoute.value.name).toBe('auth-unavailable');
    await router.push('/app'); expect(router.currentRoute.value.name).toBe('account'); expect(state.user.value).toEqual(user);
  });
  it('rechecks after leaving the route, including a fresh-cookie failure', async () => {
    const { router, currentUser, state } = fixture();
    await router.push('/app'); await router.push('/');
    expect(state.user.value).toBeNull();
    currentUser.mockRejectedValueOnce(new AuthRequestError('unauthorized'));
    await router.push('/app'); expect(router.currentRoute.value.name).toBe('login'); expect(currentUser).toHaveBeenCalledTimes(2);
  });
  it.each(['success', 'failure'])('does not let late %s undo a newer public navigation', async (outcome) => {
    let resolve!: (value: AuthUser) => void; let reject!: (reason: Error) => void;
    const lookup = vi.fn().mockReturnValue(new Promise<AuthUser>((ok, fail) => { resolve = ok; reject = fail; }));
    const { router, state } = fixture(lookup);
    const first = router.push('/app');
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    expect(state.checking.value).toBe(true); expect(state.user.value).toBeNull();
    const signal = lookup.mock.calls[0][0] as AbortSignal;
    await router.push('/'); expect(signal.aborted).toBe(true);
    if (outcome === 'success') resolve(user); else reject(new AuthRequestError('unauthorized'));
    await first;
    expect(router.currentRoute.value.name).toBe('home'); expect(state.user.value).toBeNull(); expect(state.checking.value).toBe(false);
  });
  it('does not overwrite a newer verified user with an older request', async () => {
    let finish!: (value: AuthUser) => void;
    const newer = { ...user, displayName: 'Newer user' };
    const lookup = vi.fn().mockReturnValueOnce(new Promise<AuthUser>((resolve) => { finish = resolve; })).mockResolvedValue(newer);
    const { router, state } = fixture(lookup);
    const first = router.push('/app?view=old'); await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    await router.push('/app?view=new'); finish(user); await first;
    expect(router.currentRoute.value.query.view).toBe('new'); expect(state.user.value).toEqual(newer);
  });
  it('ignores arbitrary external return targets and redirects unknown routes home', async () => {
    const { router } = fixture();
    await router.push('/login?redirect=https://evil.example');
    expect(router.currentRoute.value.name).toBe('login');
    await router.push('/not-a-route'); expect(router.currentRoute.value.name).toBe('home');
  });
});
