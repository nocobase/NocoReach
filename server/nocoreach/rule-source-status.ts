import { contentInputs } from './content-source-inputs.js';
import type { AutomaticSources } from './automatic-sources.js';
export interface SourceStatus {
  state: 'ready' | 'waiting' | 'stale' | 'error' | 'unknown' | 'disconnected';
  collectedAt?: string;
  sampleCount?: number;
}
type Rule = {
  id: string;
  source: string;
  params: { key: string; default: number }[];
};
type Snapshot = {
  catalog: Rule[];
  config: {
    rules: Record<
      string,
      { enabled?: boolean; values?: Record<string, number> }
    >;
  };
};
import type { YouTubeSource } from './youtube-source.js';
type Host = Parameters<typeof contentInputs>[0] & {
  youtube?: Pick<YouTubeSource, 'analysisData' | 'state'>;
} & {
  automaticSources?: AutomaticSources;
  health?: {
    list(
      id: string,
    ): Promise<
      | { items?: { id: string; state: string; lastSuccessAt?: string }[] }
      | { id: string; state: string; lastSuccessAt?: string }[]
    >;
  };
};
export async function sourceStatuses(
  host: Host,
  id: string,
  snapshot: Snapshot,
): Promise<Record<string, SourceStatus>> {
  const out: Record<string, SourceStatus> = Object.fromEntries(
    snapshot.catalog.map((rule) => [rule.source, { state: 'unknown' }]),
  );
  try {
    const health = await host.health?.list(id);
    const items = Array.isArray(health) ? health : health?.items || [];
    for (const item of items)
      out[item.id] = {
        state: ['failing', 'warning'].includes(item.state)
          ? 'error'
          : item.state === 'pending'
            ? 'waiting'
            : 'unknown',
        ...(item.lastSuccessAt ? { collectedAt: item.lastSuccessAt } : {}),
      };
  } catch {
    /* Unknown is distinct from disconnected. */
  }
  const content = await contentInputs(host, id);
  for (const source of content) {
    try {
      const state =
        source.source === 'youtube'
          ? await host.youtube?.state?.(id)
          : source.source === 'bilibili'
            ? await host.bilibili?.state(id)
            : await host.xiaohongshu?.state(id);
      if (!state) {
        out[source.source] = { state: 'disconnected' };
        continue;
      }
      if (
        ('connected' in state && state.connected === false) ||
        ('configured' in state && state.configured === false)
      ) {
        out[source.source] = { state: 'disconnected' };
        continue;
      }
      const attempt =
        'lastRun' in state
          ? state.lastRun
          : 'lastSync' in state
            ? state.lastSync
            : null;
      if (attempt?.ok === false) {
        out[source.source] = { state: 'error' };
        continue;
      }
      out[source.source] = assessSamples(source.items, snapshot, source.source);
    } catch {
      out[source.source] = { state: 'unknown' };
    }
  }
  try {
    for (const source of (await host.automaticSources?.state(id)) || [])
      out[source.definition.id] =
        source.connected === false
          ? { state: 'disconnected' }
          : assessSamples(source.input.items, snapshot, source.definition.id);
  } catch {
    /* Preserve unknown statuses. */
  }
  return out;
}
function assessSamples(
  items: Awaited<ReturnType<typeof contentInputs>>[number]['items'],
  snapshot: Snapshot,
  source: string,
): SourceStatus {
  const rules = snapshot.catalog.filter(
    (r) =>
      r.source === source && snapshot.config.rules[r.id]?.enabled !== false,
  );
  const windows = rules.flatMap((r) =>
    r.params
      .filter((p) => p.key === 'freshDays')
      .map((p) => snapshot.config.rules[r.id]?.values?.freshDays ?? p.default),
  );
  const days = windows.length ? Math.max(...windows) : 7,
    now = Date.now();
  const usable = items.filter((item) => {
    const at = Date.parse(item.collectedAt);
    return at <= now && now - at <= days * 86400000;
  });
  const collectedAt = items
    .map((item) => item.collectedAt)
    .sort()
    .at(-1);
  return {
    state: usable.length ? 'ready' : items.length ? 'stale' : 'waiting',
    sampleCount: usable.length,
    ...(collectedAt ? { collectedAt } : {}),
  };
}
