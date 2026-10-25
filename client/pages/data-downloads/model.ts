import { $t } from '#i18n';
import type { Tone } from '#components/reach/tag';
import { formatCount, formatDate, formatPercent } from '#lib/format';
// 下载量: what server/nocoreach/downloads-view.ts answers, and how its names and numbers read.

export type Registry = 'npm' | 'pypi' | 'docker' | 'github';
export type Item = {
  id: string; registry: Registry; kind: 'downloads' | 'pulls' | 'assets'; name: string; title: string; url: string;
  value: number | null; previous: number | null; change: number | null; complete: boolean; total: number | null; since: string | null;
  average: number | null; peak: { date: string; value: number } | null; latest: { version: string; published: string | null } | null;
};
export type Row = { date: string; [id: string]: number | string | null };
export type Share = { name: string; count: number; share: number | null };
export type Channel = 'latest' | 'release' | 'line' | 'alpha' | 'beta' | 'rc' | 'pre' | 'other';
export type VersionRow = { key: string; id: string; package: string; registry: Registry; version: string; channel: Channel; tags: string[]; published: string | null; lastWeek: number | null; files: number | null; size: number | null; yanked: boolean };
export type TagRow = { key: string; id: string; image: string; tag: string; channel: Channel; platforms: string[]; os: string[]; size: number | null; pushed: string | null; pulled: string | null; digest: string | null };
export type AssetRow = { key: string; release: string; tag: string; name: string; downloads: number | null; size: number | null; published: string | null; url: string | null; prerelease: boolean };
export type View = {
  connected: boolean; cutoff?: string | null; notes?: string[];
  window?: { start: string; end: string; days: number; previousStart: string; previousEnd: string };
  sync?: { at: string; ok: boolean; errors: string[] } | null;
  items?: Item[]; daily?: Row[]; previousDaily?: Row[];
  releases?: { tags: { id: string; package: string; registry: Registry; tag: string; version: string; published: string | null }[]; published: Record<Registry, number | null> };
  versions?: { id: string; package: string; at: string; total: number; rows: Share[] }[];
  environment?: {
    platforms: { id: string; image: string; tags: number; total: number | null; rows: Share[]; latest: { tag: string; size: number | null } | null; pulled: string | null }[];
    python: { id: string; package: string; versions: { from: string; to: string; total: number; rows: Share[] } | null; systems: { from: string; to: string; total: number; rows: Share[] } | null }[];
  };
  tables?: { versions: VersionRow[]; tags: TagRow[]; assets: AssetRow[] };
  coverage?: { id: string; image: string; read: number; total: number | null; rows: { channel: Channel; tags: number; builds: number; archs: { name: string; count: number }[]; maxSize: number | null; pushed: string | null }[] }[];
};

export const REGISTRY: Record<Registry, string> = { npm: 'npm', pypi: 'PyPI', docker: 'Docker Hub', github: 'GitHub' };
// What a figure counts: npm or PyPI downloads, Docker pulls, or GitHub release-file downloads.
export const kindLabel = (it: Item) => (it.kind === 'pulls' ? $t('dataDownloads.dockerPulls') : it.kind === 'assets' ? $t('dataDownloads.releaseFiles') : $t('dataDownloads.registryDownloads', { 0: REGISTRY[it.registry] }));
export const CHANNEL: Record<Channel, { label: () => string; tone: Tone }> = {
  latest: { label: () => 'latest', tone: 'blue' }, release: { label: () => $t('dataDownloads.channelRelease'), tone: 'green' }, line: { label: () => $t('dataDownloads.channelLine'), tone: 'slate' },
  alpha: { label: () => 'alpha', tone: 'violet' }, beta: { label: () => 'beta', tone: 'amber' }, rc: { label: () => 'rc', tone: 'orange' }, pre: { label: () => $t('dataDownloads.channelPre'), tone: 'grey' }, other: { label: () => $t('dataDownloads.channelOther'), tone: 'grey' },
};

export const num = (v: number | null | undefined, digits = 0) => formatCount(v, digits);
export const pct = (v: number | null | undefined) => formatPercent(v);
export const change = (now: number | null | undefined, before: number | null | undefined) => (now == null || before == null || !before ? null : (now - before) / before);
export const bytes = (b: number | null | undefined) => (b == null ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${b} B`);
export const dateOf = (t: string | null | undefined) => formatDate(t && t.length > 10 ? t.slice(0, 10) : t);
// Days before the day after the window's end (the business clock's today), as 3 天前 / 今天.
export const ago = (t: string | null | undefined, end: string | undefined) => {
  if (!t || !end) return '';
  const n = Math.floor((Date.parse(`${end}T00:00:00Z`) + 86_400_000 - Date.parse(t)) / 86_400_000);
  return n <= 0 ? $t('dataDownloads.today') : $t('dataDownloads.daysAgo', { 0: n });
};
export const otherName = (name: string) => (name === '*other' ? $t('dataDownloads.channelOther') : name);
