import { $t } from '#i18n';

const platforms = ['xiaohongshu', 'bilibili', 'youtube'] as const;

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
