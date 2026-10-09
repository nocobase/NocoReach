import type { ApiClient, ApiRequestOptions } from '@nocobase/app-client';

let client: ApiClient | undefined;
export function getReachClient():ApiClient {if(!client)throw new Error('NocoReach API is not ready');return client;}
export function bindReachClient(value: ApiClient): void { client = value; }
type ActionOptions = { method?: ApiRequestOptions['method']; body?: unknown; query?: ApiRequestOptions['query']; headers?: Record<string, string>; unwrap?: 'data' | 'none'; signal?: AbortSignal };
// Domain request helpers share the native application's client, session and base URL.
export const nocobaseClient = {
  async request<T>(options: ApiRequestOptions): Promise<T> {
    if (!client) throw new Error('NocoReach API is not ready');
    return client.request<T>(options);
  },
  async action<T = unknown>(resource: string, action: string, options: ActionOptions = {}): Promise<T> {
    const response = await this.request<{ data: T }>({
      path: `reach/${encodeURIComponent(resource)}/${encodeURIComponent(action)}`,
      method: options.method || 'GET', json: options.body, query: options.query,
      headers: options.headers, signal: options.signal,
    });
    return (options.unwrap === 'none' ? response : response.data) as T;
  },
};
