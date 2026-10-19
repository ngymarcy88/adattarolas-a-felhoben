import { describe, expect, it, vi } from 'vitest';
import { createAuthForm } from '../src/auth/form';
import { AuthRequestError, type AuthClient } from '../src/api/auth';

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'unit@example.test', displayName: 'Unit User', createdAt: '2026-10-19T10:00:00.000Z' };
function fixture(mode: 'login' | 'register' = 'register') {
  const client: AuthClient = { register: vi.fn().mockResolvedValue(user), login: vi.fn().mockResolvedValue(user), logout: vi.fn(), currentUser: vi.fn() };
  const navigate = vi.fn().mockResolvedValue(undefined);
  const form = createAuthForm(mode, client, navigate);
  Object.assign(form.state, { email: user.email, displayName: user.displayName, password: '  exact test passphrase  ', passwordConfirmation: '  exact test passphrase  ' });
  return { ...form, client, navigate };
}

describe('Shared registration/login form state', () => {
  it('registers with exactly the input credentials, clears secrets and does not log in automatically', async () => {
    const { state, submit, client, navigate } = fixture();
    await submit();
    expect(client.register).toHaveBeenCalledWith(user.email, user.displayName, '  exact test passphrase  ', expect.any(AbortSignal));
    expect(state.registered).toBe(true); expect(state.pending).toBe(false);
    expect(state.password).toBe(''); expect(state.passwordConfirmation).toBe('');
    expect(client.login).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    await submit(); expect(client.register).toHaveBeenCalledTimes(1);
  });
  it('keeps the loading state and blocks duplicate requests', async () => {
    const { state, submit, client } = fixture(); let finish!: (value: typeof user) => void;
    vi.mocked(client.register).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const first = submit(); expect(state.pending).toBe(true); await submit(); expect(client.register).toHaveBeenCalledTimes(1);
    finish(user); await first; expect(state.pending).toBe(false);
  });
  it.each(['email_exists', 'invalid_input', 'rate_limited', 'unavailable'] as const)
    ('allows retry after safe %s errors and clears both passwords', async (code) => {
      const { state, submit, client } = fixture();
      vi.mocked(client.register).mockRejectedValueOnce(new AuthRequestError(code));
      await submit();
      expect(state.error).toBe(new AuthRequestError(code).message); expect(state.registered).toBe(false); expect(state.pending).toBe(false);
      expect(state.password).toBe(''); expect(state.passwordConfirmation).toBe('');
      state.password = state.passwordConfirmation = 'retry test passphrase'; await submit();
      expect(state.error).toBe(''); expect(state.registered).toBe(true);
    });
  it('does not expose unexpected provider errors', async () => {
    const { state, submit, client } = fixture(); vi.mocked(client.register).mockRejectedValue(new Error('private token secret'));
    await submit(); expect(state.error).not.toContain('private'); expect(state.error).not.toContain('secret');
  });
  it.each([
    ['email', ' '], ['email', 'a'.repeat(321)], ['displayName', ' '], ['displayName', 'a'.repeat(101)],
    ['displayName', 'bad\u0000'], ['displayName', 'bad\ud800'], ['password', 'a'.repeat(14)],
    ['password', '😀'.repeat(14)], ['password', '😀'.repeat(257)], ['password', 'a'.repeat(1025)],
    ['password', 'long test password\ud800'], ['passwordConfirmation', 'not the same password'],
  ] as const)('blocks invalid %s before making a request %#', async (field, value) => {
    const { state, submit, client } = fixture(); state[field] = value;
    await submit(); expect(state.fields[field]).toBeTruthy(); expect(client.register).not.toHaveBeenCalled(); expect(state.pending).toBe(false);
  });
  it.each(['a'.repeat(15), '😀'.repeat(15), '😀'.repeat(256), 'a'.repeat(1024)])
    ('permits code-point and UTF-8 boundary passwords %#', async (password) => {
      const { state, submit, client } = fixture(); state.password = state.passwordConfirmation = password;
      await submit(); expect(client.register).toHaveBeenCalledTimes(1);
    });
  it('clears previous field errors when corrected, without dropping unsent passwords', async () => {
    const { state, submit, client } = fixture(); state.displayName = '';
    await submit(); expect(state.fields.displayName).toBeTruthy(); expect(state.password).toBe('  exact test passphrase  ');
    state.displayName = user.displayName; await submit(); expect(state.fields).toEqual({}); expect(client.register).toHaveBeenCalledTimes(1);
  });
  it.each(['resolve', 'reject'])('aborts on disposal, clears secrets and ignores late %s', async (outcome) => {
    const { state, submit, dispose, client } = fixture();
    let finish!: (value: typeof user) => void; let fail!: (reason: Error) => void;
    vi.mocked(client.register).mockReturnValue(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    const pending = submit(); const signal = vi.mocked(client.register).mock.calls[0][3]!;
    dispose(); expect(signal.aborted).toBe(true); expect(state.password).toBe(''); expect(state.passwordConfirmation).toBe('');
    if (outcome === 'resolve') finish(user); else fail(new AuthRequestError('email_exists'));
    await pending; expect(state.registered).toBe(false); expect(state.error).toBe('');
    await submit(); expect(client.register).toHaveBeenCalledTimes(1);
  });
  it('logs in with an existing short password, then navigates only after success', async () => {
    const { state, submit, client, navigate } = fixture('login'); state.password = 'x';
    await submit(); expect(client.login).toHaveBeenCalledWith(user.email, 'x', expect.any(AbortSignal));
    expect(navigate).toHaveBeenCalledTimes(1); expect(state.password).toBe(''); expect(client.register).not.toHaveBeenCalled();
  });
  it('shows a generic credential error without navigating and permits another login', async () => {
    const { state, submit, client, navigate } = fixture('login');
    vi.mocked(client.login).mockRejectedValueOnce(new AuthRequestError('invalid_credentials'));
    await submit(); expect(state.error).toBe('Hibás e-mail-cím vagy jelszó.'); expect(state.pending).toBe(false);
    expect(navigate).not.toHaveBeenCalled(); state.password = 'retry test passphrase'; await submit(); expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('never navigates for a login response arriving after unmount', async () => {
    const { submit, client, navigate, dispose } = fixture('login'); let finish!: (value: typeof user) => void;
    vi.mocked(client.login).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = submit(); dispose(); finish(user); await pending; expect(navigate).not.toHaveBeenCalled();
  });
});
