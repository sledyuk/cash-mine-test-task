import { getToken } from '@/auth/token';

import { chaosEnabled, shouldDropResponse } from './chaos';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';

export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_MISMATCH'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'TIMEOUT'
  // client-side codes
  | 'NETWORK'
  | 'CLIENT_TIMEOUT'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly field?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The server may or may not have applied the request (timeouts, 5xx, lost connection). */
  get outcomeUnknown(): boolean {
    return (
      this.code === 'NETWORK' ||
      this.code === 'CLIENT_TIMEOUT' ||
      this.code === 'TIMEOUT' ||
      this.status >= 500
    );
  }

  /** The server definitely did not apply the request. */
  get rejected(): boolean {
    return this.status >= 400 && this.status < 500 && this.code !== 'RATE_LIMITED';
  }
}

type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type ErrorBody = {
  error?: { code?: string; message?: string; field?: string; retryAfterMs?: number };
};

function toApiError(response: Response, data: unknown): ApiError {
  const err = (data as ErrorBody | undefined)?.error;
  const retryHeader = Number(response.headers.get('Retry-After'));
  const retryAfterMs =
    err?.retryAfterMs ??
    (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : undefined);
  const code =
    (err?.code as ApiErrorCode | undefined) ?? (response.status >= 500 ? 'SERVER' : 'UNKNOWN');
  return new ApiError(
    err?.message ?? `Request failed with ${response.status}`,
    response.status,
    code,
    err?.field,
    retryAfterMs,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ApiResponse<T> = { data: T; headers: Headers; status: number };

export async function requestRaw<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', query, body, headers, signal, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const token = getToken();

  if (chaosEnabled('slow')) await sleep(3000);
  if (chaosEnabled('flaky') && method === 'GET' && Math.random() < 0.3) {
    throw new ApiError('Injected failure (chaos: flaky)', 503, 'SERVER');
  }

  // Our own timeout, combined with the caller's abort signal.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (timedOut) throw new ApiError('The request timed out', 0, 'CLIENT_TIMEOUT');
    if (signal?.aborted) throw error;
    throw new ApiError('Network error: the server could not be reached', 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (shouldDropResponse(headers?.['Idempotency-Key'])) {
    throw new ApiError('Injected lost response (chaos: lost-response)', 0, 'NETWORK');
  }

  const data = await parseBody(response);
  if (!response.ok) throw toApiError(response, data);
  return { data: data as T, headers: response.headers, status: response.status };
}

export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await requestRaw<T>(path, options)).data;
}
