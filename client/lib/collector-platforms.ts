import { $t } from '#i18n';

const platforms = ['xiaohongshu', 'bilibili'] as const;

export type CollectorPlatform = (typeof platforms)[number];

export interface CollectorChoice {
  id: string;
  name: string;
  nameKey?: 'collectorConnection.projectSource';
}

export function collectorName(collector: CollectorChoice | undefined): string {
  return collector?.nameKey ? $t(collector.nameKey) : (collector?.name ?? '');
}

export function isCollectorPlatform(value: string): value is CollectorPlatform {
  return platforms.some((platform) => platform === value);
}

/** How to deploy each platform's collector, linked from its Data sources panel. */
export const collectorDocs: Record<CollectorPlatform, string> = {
  bilibili:
    'https://github.com/nocobase/NocoReach/blob/main/docs/BILIBILI-COLLECTOR.md',
  xiaohongshu:
    'https://github.com/nocobase/NocoReach/blob/main/docs/XIAOHONGSHU-COLLECTOR.md',
};
