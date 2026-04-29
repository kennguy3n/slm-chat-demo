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
  // 204 No Content (and any empty-body 2xx response) has nothing to parse.
  // Calling res.json() on such a response throws SyntaxError, which used to
  // make every DELETE caller (e.g. closeTask) fail after a successful round-
  // trip. Return undefined for those cases — callers that expect a void
  // response are typed `Promise<void>` and won't read the value.
  if (res.status === 204) return undefined as T;
  const contentLength = res.headers.get('Content-Length');
  if (contentLength === '0') return undefined as T;
  const text = await res.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}
