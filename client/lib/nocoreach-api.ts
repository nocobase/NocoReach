// The classic portal SDK's client, as NocoReach's pages call it — `nocobaseClient.action(resource, action, options)` —
// answered by this application's NocoReach route (`/api/nocoreach/<resource>/<action>`, server/routes/nocoreach.ts).
// It keeps the classic contract the pages were written against: GET for `get`/`list` and POST otherwise, the JSON body
// as the action's values, `{ data }` unwrapped unless `unwrap: 'none'`, and a failure thrown as an error whose message
// is the server's sentence for the user. The session is the application's own cookie.
import { resolveAppUrl } from '@nocobase/app-client';

type Query = Record<string, string | number | boolean | null | undefined | readonly (string | number | boolean)[]>;

export interface ActionOptions {
  readonly method?: 'GET' | 'POST';
  readonly query?: Query;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly unwrap?: 'data' | 'deep-data' | 'none';
  readonly signal?: AbortSignal;
}

/** A failed request, shaped like the classic `NocoBaseHttpError`: `status`, `payload` and the user-facing message. */
export class NocoReachHttpError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly code?: string;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'NocoBaseHttpError';
    this.status = status;
    this.payload = payload;
    this.code = (payload as { error?: { reason?: string } })?.error?.reason;
  }
}

const unwrap = (payload: unknown, mode: ActionOptions['unwrap'] = 'data') => {
  if (mode === 'none' || !payload || typeof payload !== 'object') return payload;
  const data = (payload as { data?: unknown }).data;
  if (mode === 'deep-data' && data && typeof data === 'object')
    return (data as { data?: unknown }).data ?? data;
  return data ?? payload;
};

const messageOf = (payload: unknown, status: number) => {
  const error = (payload as { error?: { message?: string; localizedMessage?: { message?: string } } })?.error;
  return error?.localizedMessage?.message || error?.message || `请求没有完成（${status}）`;
};

type RequestHook = (run: () => Promise<unknown>) => Promise<unknown>;
let hook: RequestHook = (run) => run();

export const nocobaseClient = {
  async action<T = unknown>(resource: string, action: string, options: ActionOptions = {}): Promise<T> {
    const method = options.method ?? (['get', 'list'].includes(action) ? 'GET' : 'POST');
    const url = new URL(resolveAppUrl(`/api/nocoreach/${resource}/${action}`), window.location.origin);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
    const run = async () => {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
        signal: options.signal,
      });
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* not JSON: kept as text */
      }
      if (!response.ok) throw new NocoReachHttpError(messageOf(payload, response.status), response.status, payload);
      return unwrap(payload, options.unwrap);
    };
    return (await hook(run)) as T;
  },
  /** Lets the translation layer wrap every request (i18n/index.tsx turns the server's Chinese errors into English). */
  wrapRequests(next: RequestHook) {
    const previous = hook;
    hook = (run) => next(() => previous(run));
  },
  /** An application path as an absolute URL in this deployment (classic `resolvePortalUrl`). */
  resolveUrl(path: string) {
    return resolveAppUrl(path);
  },
};

/** Classic `resolvePortalUrl(path)` and `getPortalBase()`, for links into the application. */
export const resolvePortalUrl = (path = '/') => resolveAppUrl(path);
export const getPortalBase = () => resolveAppUrl('/').replace(/\/?$/, '/');
