export interface HealthResponse {
  status: 'ok';
}

export class HealthRequestError extends Error {
  constructor() {
    super('A kapcsolat nem ellenőrizhető. Próbáld újra később.');
    this.name = 'HealthRequestError';
  }
}

/** Public build-time API URL only. Storage credentials must never enter this module. */
export function parseApiBaseUrl(value: string | undefined): string {
  if (!value) throw new Error('A VITE_API_BASE_URL konfiguráció hiányzik.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('A VITE_API_BASE_URL konfiguráció érvénytelen.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash
  ) throw new Error('A VITE_API_BASE_URL konfiguráció érvénytelen.');
  return url.toString().replace(/\/+$/, '');
}

export async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) throw new HealthRequestError();
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
      throw new HealthRequestError();
    }
    return { status: 'ok' };
  } catch {
    // Never show response bodies, URLs or server internals in the UI.
    throw new HealthRequestError();
  }
}
