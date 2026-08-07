'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Imperial Learning';

const TOKEN_KEY = 'il_leaderboard_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — session simply will not persist */
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  /** Pass a FormData to upload a file; Content-Type is left to the browser. */
  formData?: FormData;
}

export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, formData, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  if (!formData && body !== undefined) finalHeaders['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Could not reach the API at ${API_URL}. Check that the backend is running and that NEXT_PUBLIC_API_URL is correct.`,
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { code: 'BAD_RESPONSE', message: text.slice(0, 300) } };
    }
  }

  if (!res.ok) {
    const err = payload?.error ?? {};
    // An expired or revoked token should bounce the manager back to sign-in.
    if (res.status === 401 && typeof window !== 'undefined' && getToken()) {
      setToken(null);
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
    }
    throw new ApiError(
      res.status,
      err.code ?? 'ERROR',
      err.message ?? `Request failed with status ${res.status}`,
      err.details,
    );
  }

  return payload as T;
}

/** Small data-fetching hook. Client-side only, so the build never depends on the API being up. */
export function useApi<T = any>(
  path: string | null,
  options: { auth?: boolean; deps?: unknown[] } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const reqId = useRef(0);
  const deps = options.deps ?? [];

  const run = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { auth: options.auth ?? true });
      if (id === reqId.current) setData(result);
    } catch (e) {
      if (id === reqId.current) setError(e as ApiError);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refresh: run, setData };
}
