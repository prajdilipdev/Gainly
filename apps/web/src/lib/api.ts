'use client';

/**
 * API client with automatic access-token refresh. The refresh token lives in
 * an httpOnly cookie scoped to /api/v1/auth; the access token is kept in
 * memory (mirrored to sessionStorage so reloads stay logged in) and attached
 * as a Bearer header. All requests go through the Next.js rewrite so they are
 * same-origin.
 */

const BASE = '/api/v1';
const TOKEN_KEY = 'spt.accessToken';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = window.sessionStorage.getItem(TOKEN_KEY);
  }
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Restores a session on app startup. The access token lives in sessionStorage
 * (cleared when the browser closes), but the refresh token is a persistent
 * httpOnly cookie (valid for days), so when the in-memory token is gone we try
 * to mint a fresh one from that cookie before treating the user as logged out.
 * Returns true if a valid session is available afterwards.
 */
export async function bootstrapSession(): Promise<boolean> {
  if (getAccessToken()) return true;
  return tryRefresh();
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Free-tier API hosts (e.g. Render) put the server to sleep when idle; the
 * first request then hangs for up to a minute while it boots. Without any
 * feedback, buttons just spin and the app looks broken — so once a request
 * exceeds this threshold, tell the user what is actually happening.
 */
const SLOW_REQUEST_TOAST_AFTER_MS = 5_000;
let slowToastShown = false;

function startSlowRequestNotice(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const timer = setTimeout(async () => {
    if (slowToastShown) return;
    slowToastShown = true;
    const { toast } = await import('sonner');
    toast.info('Waking up the server…', {
      id: 'cold-start-notice',
      description:
        'The free server sleeps when idle and can take up to a minute to start. Your request will complete automatically.',
      duration: 60_000,
    });
  }, SLOW_REQUEST_TOAST_AFTER_MS);
  return () => {
    clearTimeout(timer);
    if (slowToastShown) {
      slowToastShown = false;
      void import('sonner').then(({ toast }) =>
        toast.dismiss('cold-start-notice'),
      );
    }
  };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = () => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  };

  const stopSlowNotice = startSlowRequestNotice();
  let res: Response;
  try {
    res = await doFetch();
  } finally {
    stopSlowNotice();
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      setAccessToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = await res.json();
      details = body;
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join('; ');
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.blob()) as unknown as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Triggers a browser download for an export endpoint. */
export async function downloadExport(
  portfolioId: string,
  format: 'csv' | 'xlsx' | 'pdf' | 'json',
  scope: 'transactions' | 'holdings',
) {
  const blob = await request<Blob>(
    `/export/portfolios/${portfolioId}?format=${format}&scope=${scope}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_${scope}_${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
