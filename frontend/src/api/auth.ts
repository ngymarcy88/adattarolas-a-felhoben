import { parseApiBaseUrl } from './health';

export interface AuthUser { id: string; email: string; displayName: string; createdAt: string }
export type AuthErrorCode = 'unauthorized' | 'invalid_credentials' | 'invalid_input' | 'rate_limited' | 'email_exists' | 'unavailable';
const messages: Record<AuthErrorCode, string> = {
  email_exists: 'Ezzel az e-mail-címmel már létezik fiók. Jelentkezz be, vagy használj másik címet.',
  unauthorized: 'A munkamenet lejárt. Jelentkezz be újra.',
  invalid_credentials: 'Hibás e-mail-cím vagy jelszó.',
  invalid_input: 'Ellenőrizd a megadott adatokat.',
  rate_limited: 'Túl sok próbálkozás. Várj egy percet, majd próbáld újra.',
  unavailable: 'A kapcsolat most nem ellenőrizhető. Próbáld újra később.',
};
export class AuthRequestError extends Error {
  constructor(readonly code: AuthErrorCode) { super(messages[code]); this.name = 'AuthRequestError'; }
}

function parseUser(data: unknown): AuthUser {
  if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 || !('user' in data) ||
      !data.user || typeof data.user !== 'object') throw new AuthRequestError('unavailable');
  const user = data.user as Record<string, unknown>;
  if (Object.keys(user).length !== 4 || typeof user.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ||
      typeof user.email !== 'string' || !user.email || user.email.length > 254 ||
      typeof user.displayName !== 'string' || !user.displayName || user.displayName.length > 200 ||
      typeof user.createdAt !== 'string' || !Number.isFinite(Date.parse(user.createdAt)) ||
      new Date(user.createdAt).toISOString() !== user.createdAt) throw new AuthRequestError('unavailable');
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}

export function createAuthClient(baseUrl: string | undefined) {
  async function request(path: 'me' | 'login' | 'register' | 'logout', method: 'GET' | 'POST', body?: object, signal?: AbortSignal): Promise<AuthUser | undefined> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 10_000);
    try {
      const response = await fetch(`${parseApiBaseUrl(baseUrl)}/auth/${path}`, {
        method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const code: AuthErrorCode = response.status === 401 ? (path === 'login' ? 'invalid_credentials' : 'unauthorized')
          : response.status === 409 && path === 'register' ? 'email_exists'
          : response.status === 400 ? 'invalid_input' : response.status === 429 ? 'rate_limited' : 'unavailable';
        throw new AuthRequestError(code);
      }
      // Consume the body while timeout/cancellation still protect the request.
      if (path === 'logout') {
        if (response.status !== 204) throw new AuthRequestError('unavailable');
        return undefined;
      }
      if (response.status !== (path === 'register' ? 201 : 200)) throw new AuthRequestError('unavailable');
      return parseUser(await response.json());
    } catch (error) {
      if (error instanceof AuthRequestError) throw error;
      throw new AuthRequestError('unavailable');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    async register(email: string, displayName: string, password: string, signal?: AbortSignal): Promise<AuthUser> {
      return (await request('register', 'POST', { email, displayName, password }, signal))!;
    },
    async currentUser(signal?: AbortSignal): Promise<AuthUser> {
      return (await request('me', 'GET', undefined, signal))!;
    },
    async login(email: string, password: string, signal?: AbortSignal): Promise<AuthUser> {
      return (await request('login', 'POST', { email, password }, signal))!;
    },
    async logout(signal?: AbortSignal): Promise<void> { await request('logout', 'POST', undefined, signal); },
  };
}
export type AuthClient = ReturnType<typeof createAuthClient>;
export const authClient = createAuthClient(import.meta.env.VITE_API_BASE_URL);
