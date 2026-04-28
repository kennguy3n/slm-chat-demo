// API base URL. The Vite dev server proxies /api -> http://localhost:8080,
// so a relative base works in dev. Override with VITE_API_BASE for hosted builds.
const ENV_BASE =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE
    ? (import.meta.env.VITE_API_BASE as string)
    : '';

export const apiBase: string = ENV_BASE;

// Demo user injected as the X-User-ID header on every call. Phase 0 has no
// real authentication; later phases will replace this with a session token.
export const DEMO_USER_ID = 'user_alice';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!headers.has('X-User-ID')) headers.set('X-User-ID', DEMO_USER_ID);

  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}
