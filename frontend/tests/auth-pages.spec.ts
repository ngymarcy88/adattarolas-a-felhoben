import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory } from 'vue-router';
import * as formModule from '../src/auth/form';
import App from '../src/App.vue';
import { authClient, AuthRequestError } from '../src/api/auth';
import { session } from '../src/auth/session';
import { createAppRouter } from '../src/router';

// Isolated Vue template rendering, not browser/hydration or e2e evidence.
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'unit@example.test', displayName: 'Unit User', createdAt: '2026-10-19T10:00:00.000Z' };
afterEach(() => { session.user.value = null; session.checking.value = false; vi.restoreAllMocks(); });
const render = (router: ReturnType<typeof createAppRouter>) => renderToString(createSSRApp(App).use(router));

describe('Auth page templates', () => {
  it('renders the login form instead of account data after an invalid session', async () => {
    vi.spyOn(authClient, 'currentUser').mockRejectedValue(new AuthRequestError('unauthorized'));
    const router = createAppRouter(createMemoryHistory());
    session.user.value = user;
    await router.push('/app');
    const html = await render(router);
    expect(html).toContain('Bejelentkezés'); expect(html).toContain('autocomplete="username"');
    expect(html).toContain('type="password"'); expect(html).toContain('autocomplete="current-password"');
    expect(html).not.toContain(user.email);
  });
  it('hides previous account data during verification and escapes verified profile text', async () => {
    let finish!: (value: typeof user) => void;
    const lookup = vi.spyOn(authClient, 'currentUser').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/login'); session.user.value = user;
    const pending = router.push('/app'); await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    const loading = await render(router);
    expect(loading).toContain('Munkamenet ellenőrzése…'); expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain(user.email);
    finish({ ...user, displayName: '<img src=x onerror=alert(1)>' }); await pending;
    const account = await render(router);
    expect(account).toContain(user.email); expect(account).toContain('Kijelentkezés');
    expect(account).toContain('&lt;img'); expect(account).not.toContain('<img');
  });
  it('renders retry navigation without profile data when the server cannot be checked', async () => {
    vi.spyOn(authClient, 'currentUser').mockRejectedValue(new AuthRequestError('unavailable'));
    const router = createAppRouter(createMemoryHistory()); await router.push('/app');
    const html = await render(router);
    expect(html).toContain('Újrapróbálás'); expect(html).toContain('href="/app"');
    expect(html).toContain('role="alert"'); expect(html).not.toContain(user.email);
  });
});


describe('Registration and login form templates', () => {
  it('renders a reachable public registration form with named and linked password fields', async () => {
    const router = createAppRouter(createMemoryHistory()); await router.push('/register');
    const html = await render(router);
    expect(html).toContain('Megjelenítési név'); expect(html).toContain('Jelszó megerősítése');
    expect(html).toContain('autocomplete="new-password"'); expect(html).toContain('aria-describedby="password-hint"');
    expect(html).toContain('Legalább 15 karakter'); expect(html).toContain('href="/login"');
  });
  it.each(['login', 'register'] as const)('renders %s loading feedback and disabled controls', async (mode) => {
    const form = formModule.createAuthForm(mode, authClient, async () => {}); form.state.pending = true;
    vi.spyOn(formModule, 'createAuthForm').mockReturnValue(form);
    const router = createAppRouter(createMemoryHistory()); await router.push('/' + mode);
    const html = await render(router);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="status"');
    expect((html.match(/\sdisabled(?=[\s=>])/g) ?? []).length).toBe(mode === 'register' ? 5 : 3);
  });
  it('connects registration field errors to inputs and shows a safe form error', async () => {
    const form = formModule.createAuthForm('register', authClient, async () => {});
    form.state.fields.passwordConfirmation = 'A két jelszó nem egyezik.';
    form.state.error = new AuthRequestError('email_exists').message;
    vi.spyOn(formModule, 'createAuthForm').mockReturnValue(form);
    const router = createAppRouter(createMemoryHistory()); await router.push('/register');
    const html = await render(router);
    expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-describedby="confirmation-error"');
    expect(html).toContain('A két jelszó nem egyezik.'); expect(html).toContain('role="alert"');
    expect(html).toContain('Ezzel az e-mail-címmel már létezik fiók.');
  });
  it('replaces the completed registration form with a login link and success announcement', async () => {
    const form = formModule.createAuthForm('register', authClient, async () => {}); form.state.registered = true;
    vi.spyOn(formModule, 'createAuthForm').mockReturnValue(form);
    const router = createAppRouter(createMemoryHistory()); await router.push('/register');
    const html = await render(router);
    expect(html).toContain('Sikeres regisztráció.'); expect(html).toContain('role="status"');
    expect(html).toContain('href="/login"'); expect(html).not.toContain('<form'); expect(html).not.toContain('type="password"');
  });
});
