// The classic portal SDK's client, as NocoReach's pages call it — `nocobaseClient.action(resource, action, options)` —
// answered by this application's NocoReach route (`/api/nocoreach/<resource>/<action>`, server/routes/nocoreach.ts).
// It keeps the classic contract the pages were written against: GET for `get`/`list` and POST otherwise, the JSON body
// as the action's values, `{ data }` unwrapped unless `unwrap: 'none'`, and a failure thrown as an error whose message
// is the server's sentence for the user. The session is the application's own cookie.
import { resolveAppUrl } from '@nocobase/app-client';

type Query = Record<
  string,
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[]
>;

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
  if (mode === 'none' || !payload || typeof payload !== 'object')
    return payload;
  const data = (payload as { data?: unknown }).data;
  if (mode === 'deep-data' && data && typeof data === 'object')
    return (data as { data?: unknown }).data ?? data;
  return data ?? payload;
};

const messageOf = (payload: unknown, status: number) => {
  const error = (
    payload as {
      error?: {
        reason?: string;
        message?: string;
        localizedMessage?: { message?: string };
      };
    }
  )?.error;
  if (
    error?.reason === 'NR_MOCK_PROJECT_DISABLED' ||
    error?.message === 'NR_MOCK_PROJECT_DISABLED'
  )
    return 'mock.projectDisabled';
  if (
    error?.reason === 'NR_MOCK_PROFILE_REQUIRED' ||
    error?.message === 'NR_MOCK_PROFILE_REQUIRED'
  )
    return 'networkProfiles.profileRequired';
  const message = error?.localizedMessage?.message || error?.message;
  if (message) return message;
  // A gateway's own 502-504 page instead of NocoReach's answer: the server was briefly unreachable, often while it
  // restarts for an update, so the reader is told to try again rather than shown a bare status.
  if (!error && status >= 502 && status <= 504)
    return 'common.serviceUnavailable';
  return `请求没有完成（${status}）`;
};

const errorOf = (payload: unknown): Record<string, unknown> | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return undefined;
  const error = (payload as { error?: unknown }).error;
  return error && typeof error === 'object' && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : undefined;
};

const errorStatuses = new Map([
  ['INVALID_ARGUMENT', 400],
  ['FAILED_PRECONDITION', 400],
  ['OUT_OF_RANGE', 400],
  ['UNAUTHENTICATED', 401],
  ['PERMISSION_DENIED', 403],
  ['NOT_FOUND', 404],
  ['ALREADY_EXISTS', 409],
  ['ABORTED', 409],
  ['RESOURCE_EXHAUSTED', 429],
  ['INTERNAL', 500],
  ['UNIMPLEMENTED', 501],
  ['UNAVAILABLE', 503],
  ['DEADLINE_EXCEEDED', 504],
]);
const errorStatus = (error: Record<string, unknown>): number => {
  const code = error.code;
  if (
    typeof code === 'number' &&
    Number.isInteger(code) &&
    code >= 400 &&
    code < 600
  )
    return code;
  return typeof error.status === 'string'
    ? (errorStatuses.get(error.status) ?? 500)
    : 500;
};

type RequestHook = (run: () => Promise<unknown>) => Promise<unknown>;
let hook: RequestHook = (run) => run();

export const nocobaseClient = {
  async action<T = unknown>(
    resource: string,
    action: string,
    options: ActionOptions = {},
  ): Promise<T> {
    const method =
      options.method ?? (['get', 'list'].includes(action) ? 'GET' : 'POST');
    const url = new URL(
      resolveAppUrl(`/api/nocoreach/${resource}/${action}`),
      window.location.origin,
    );
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value))
        value.forEach((v) => url.searchParams.append(key, String(v)));
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
        body:
          method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
        signal: options.signal,
      });
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* not JSON: kept as text */
      }
      const error = errorOf(payload);
      if (!response.ok || error) {
        // Legacy failures can arrive with a 2xx status. Reject their envelope before it reaches report caches.
        const status =
          response.ok && error ? errorStatus(error) : response.status;
        throw new NocoReachHttpError(
          messageOf(payload, status),
          status,
          payload,
        );
      }
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
