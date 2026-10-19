import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import type {
  ArticleSummary,
  ArticleTargetView,
} from '../../shared/article-publishing.js';

export type TargetList = {
  revision: number;
  // Which target new tasks publish to (the first one unless an administrator chose another).
  defaultTargetId?: string;
  // Where each playbook's new tasks publish (a target id, or 'repo' for a pull request); absent means the default.
  playbookTargets?: Record<string, string>;
  targets: ArticleTargetView[];
};
export type TestResult =
  | { ok: true; sample: { id: string; title: string } | null }
  | { ok: false; code: string };

/** Article publishing targets (server/nocoreach/articles/targets.ts). Writes need the browser's session id. */
export const articleRequest = <T>(
  action: string,
  projectId: number,
  body: object = {},
  sessionId?: string,
) =>
  api.action<T>('nrArticles', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
    ...(sessionId
      ? { headers: { 'X-NocoReach-Confirmation-Session': sessionId } }
      : {}),
  });

export const searchArticles = (
  projectId: number,
  targetId: string,
  q: string,
  signal?: AbortSignal,
) =>
  api.action<ArticleSummary[]>('nrArticles', 'search', {
    method: 'POST',
    body: { projectId: String(projectId), targetId, q },
    unwrap: 'data',
    signal,
  });

/** The semantic key the server attached to an error (`articles.stale`), if any. */
export function errorKey(e: unknown) {
  return e instanceof NocoReachHttpError
    ? (e.payload as { error?: { metadata?: { key?: string } } } | undefined)
        ?.error?.metadata?.key
    : undefined;
}
export const errorStatus = (e: unknown) =>
  e instanceof NocoReachHttpError ? e.status : 0;

/** A language code as the current interface language names it (zh → 中文); unknown codes show as they are. */
export function localeName(code: string, uiLocale: string) {
  try {
    return (
      new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) || code
    );
  } catch {
    return code;
  }
}

/** `articles.provider.unknown_outcome` style codes as translation keys. */
export const providerKey = (code: string) =>
  `articles.provider.${code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
