const platforms = ['xiaohongshu', 'bilibili', 'youtube'] as const;

export type CollectorPlatform = (typeof platforms)[number];

export function isCollectorPlatform(value: string): value is CollectorPlatform {
  return platforms.some((platform) => platform === value);
}
