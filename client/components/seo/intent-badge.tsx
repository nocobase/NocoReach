import { $t } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/features/keywords/components/IntentBadge.tsx (MIT); Chinese labels,
// NocoReach tones, the description as a native tooltip.
import { Tag, type Tone } from "#components/reach/tag";

export const INTENT_ORDER = ["informational", "commercial", "transactional", "navigational"] as const;
export type KeywordIntent = (typeof INTENT_ORDER)[number] | "unknown";

export const getIntentLabels = (): Record<KeywordIntent, string> => ({
  informational: $t('intentBadge.informational'),
  commercial: $t('intentBadge.commercial'),
  transactional: $t('intentBadge.transactional'),
  navigational: $t('intentBadge.navigational'),
  unknown: $t('common.unknown'),
});
const TONES: Record<KeywordIntent, Tone> = { informational: "blue", commercial: "amber", transactional: "green", navigational: "violet", unknown: "grey" };
const getDescriptions = (): Record<KeywordIntent, string> => ({
  informational: $t('intentBadge.lookingInformationAnswersSuitsTutorials'),
  commercial: $t('intentBadge.comparingBeforeBuyingSuitsComparisons'),
  transactional: $t('intentBadge.readyActBuySignUp'),
  navigational: $t('intentBadge.lookingSpecificSitePageUsually'),
  unknown: $t('intentBadge.noIntentDataNotBase'),
});

export const toIntent = (value: string | null | undefined): KeywordIntent =>
  (INTENT_ORDER as readonly string[]).includes(String(value)) ? (value as KeywordIntent) : "unknown";

export function IntentBadge({ intent }: { intent: string | null | undefined }) {
  const key = toIntent(intent);
  return (
    <Tag tone={TONES[key]} title={$t('intentBadge.intent',{0:getIntentLabels()[key],1:getDescriptions()[key]})} aria-label={$t('intentBadge.searchIntent',{0:getIntentLabels()[key]})}>
      {getIntentLabels()[key]}
    </Tag>
  );
}
