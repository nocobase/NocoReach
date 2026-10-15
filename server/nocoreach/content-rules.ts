import { systemMessageText as text } from '../../shared/i18n/messages.js';

/** Adapters declare supported fields; rules never branch on platform names. */
export interface ContentSourceDefinition {
  id: string;
  capabilities: { discovery: boolean; metrics: ('views' | 'likes')[] };
}
export const CONTENT_SOURCES: ContentSourceDefinition[] = [
  {
    id: 'youtube',
    capabilities: { discovery: true, metrics: ['views', 'likes'] },
  },
  {
    id: 'bilibili',
    capabilities: { discovery: true, metrics: ['views', 'likes'] },
  },
  { id: 'xiaohongshu', capabilities: { discovery: true, metrics: ['likes'] } },
];
export interface ContentSample {
  id: string;
  title: string;
  url: string;
  firstSeenAt: string;
  collectedAt: string;
  metrics: Partial<
    Record<'views' | 'likes', { value: number | null; at: string | null }>
  >;
}
export interface ContentInput {
  source: string;
  items: ContentSample[];
}
const parameter = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
) => ({ key, label: text(label), default: value, min, max, unit: '' });
const freshness = () =>
  parameter('freshDays', 'analysisRules.sampleDays', 7, 1, 30);

export function contentRuleCatalog(
  sources: ContentSourceDefinition[] = CONTENT_SOURCES,
) {
  return sources.flatMap(({ id: source, capabilities }) => [
    ...(capabilities.discovery
      ? [
          {
            id: `${source}-new`,
            source,
            template: 'content-discovery',
            label: text('analysisRules.socialNew'),
            description: text('analysisRules.socialNewHelp'),
            match: [`${source}-new:`],
            params: [
              freshness(),
              parameter(
                'discoveryDays',
                'analysisRules.discoveryDays',
                7,
                1,
                30,
              ),
            ],
          },
        ]
      : []),
    ...capabilities.metrics.map((metric) => ({
      id: `${source}-${metric}`,
      source,
      template: 'content-metric',
      metric,
      label: text(
        metric === 'views'
          ? 'analysisRules.socialViews'
          : 'analysisRules.socialLikes',
      ),
      description: text(
        metric === 'views'
          ? 'analysisRules.socialViewsHelp'
          : 'analysisRules.socialLikesHelp',
      ),
      match: [`${source}-${metric}:`],
      params: [
        freshness(),
        parameter(
          'minCount',
          metric === 'views'
            ? 'analysisRules.minPublicViews'
            : 'analysisRules.minLikes',
          metric === 'views' ? 10000 : 100,
          1,
          100000000,
        ),
      ],
    })),
  ]);
}
const fresh = (at: string | null, days: number, now: number) => {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time <= now && now - time <= days * 86400000;
};
export function contentSignals(
  inputs: ContentInput[],
  settings: { value(id: string, key: string): number; on(id: string): boolean },
  now: number,
  definitions = CONTENT_SOURCES,
) {
  return contentRuleCatalog(definitions).flatMap((rule) => {
    if (!settings.on(rule.id)) return [];
    return (
      inputs.find((input) => input.source === rule.source)?.items || []
    ).flatMap((item) => {
      if (!fresh(item.collectedAt, settings.value(rule.id, 'freshDays'), now))
        return [];
      const metric = 'metric' in rule ? item.metrics[rule.metric] : null;
      if ('metric' in rule) {
        if (
          !metric ||
          typeof metric.value !== 'number' ||
          !Number.isFinite(metric.value) ||
          metric.value < settings.value(rule.id, 'minCount') ||
          !fresh(metric.at, settings.value(rule.id, 'freshDays'), now)
        )
          return [];
      } else if (
        !fresh(item.firstSeenAt, settings.value(rule.id, 'discoveryDays'), now)
      )
        return [];
      const facts = [
        text('socialSignals.scope'),
        text('socialSignals.discovered', {
          0: item.firstSeenAt,
          1: item.collectedAt,
        }),
      ];
      if (metric && 'metric' in rule)
        facts.push(
          text('socialSignals.metric', {
            0: text(`socialSignals.${rule.metric}Label`),
            1: metric.value,
            2: metric.at,
          }),
        );
      return [
        {
          key: `${rule.id}:${item.id}`,
          source: rule.source,
          type: 'timing',
          url: item.url,
          title: text(metric ? 'socialSignals.views' : 'socialSignals.new', {
            0: item.title,
          }),
          facts,
          evidence: [item.url],
          actionable: false,
          action: null,
          strength: metric ? 45 : 30,
          chip: {
            tone: 'blue',
            text: metric ? String(metric.value) : text('socialSignals.newChip'),
          },
        },
      ];
    });
  });
}
