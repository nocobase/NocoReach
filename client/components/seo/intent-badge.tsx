import { $t } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/features/keywords/components/IntentBadge.tsx (MIT); Chinese labels,
// NocoReach tones, the description as a native tooltip.
import { Tag, type Tone } from "#components/reach/tag";

export const INTENT_ORDER = ["informational", "commercial", "transactional", "navigational"] as const;
export type KeywordIntent = (typeof INTENT_ORDER)[number] | "unknown";

export const getIntentLabels = (): Record<KeywordIntent, string> => ({
  informational: $t("信息"),
  commercial: $t("商业"),
  transactional: $t("交易"),
  navigational: $t("导航"),
  unknown: $t("未知"),
});
const TONES: Record<KeywordIntent, Tone> = { informational: "blue", commercial: "amber", transactional: "green", navigational: "violet", unknown: "grey" };
const getDescriptions = (): Record<KeywordIntent, string> => ({
  informational: $t("想找资料或答案：适合教程、指南和解释性内容。"),
  commercial: $t("买之前在比较：适合对比、替代方案和产品介绍页。"),
  transactional: $t("准备行动（购买、注册、下载）：突出价格、试用和转化入口。"),
  navigational: $t("在找某个网站或页面：通常只有对应的目标页能排上去。"),
  unknown: $t("没有意图数据，不要只凭这一项做内容决定。"),
});

export const toIntent = (value: string | null | undefined): KeywordIntent =>
  (INTENT_ORDER as readonly string[]).includes(String(value)) ? (value as KeywordIntent) : "unknown";

export function IntentBadge({ intent }: { intent: string | null | undefined }) {
  const key = toIntent(intent);
  return (
    <Tag tone={TONES[key]} title={$t("{0}意图：{1}",{0:getIntentLabels()[key],1:getDescriptions()[key]})} aria-label={$t("搜索意图：{0}",{0:getIntentLabels()[key]})}>
      {getIntentLabels()[key]}
    </Tag>
  );
}
