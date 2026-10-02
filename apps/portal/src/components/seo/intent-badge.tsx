// Ported from every-app/open-seo db8bde1 src/client/features/keywords/components/IntentBadge.tsx (MIT); Chinese labels,
// NocoReach tones, the description as a native tooltip.
import { Tag, type Tone } from "@/components/reach/tag";

export const INTENT_ORDER = ["informational", "commercial", "transactional", "navigational"] as const;
export type KeywordIntent = (typeof INTENT_ORDER)[number] | "unknown";

export const INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: "信息",
  commercial: "商业",
  transactional: "交易",
  navigational: "导航",
  unknown: "未知",
};
const TONES: Record<KeywordIntent, Tone> = { informational: "blue", commercial: "amber", transactional: "green", navigational: "violet", unknown: "grey" };
const DESCRIPTIONS: Record<KeywordIntent, string> = {
  informational: "想找资料或答案：适合教程、指南和解释性内容。",
  commercial: "买之前在比较：适合对比、替代方案和产品介绍页。",
  transactional: "准备行动（购买、注册、下载）：突出价格、试用和转化入口。",
  navigational: "在找某个网站或页面：通常只有对应的目标页能排上去。",
  unknown: "没有意图数据，不要只凭这一项做内容决定。",
};

export const toIntent = (value: string | null | undefined): KeywordIntent =>
  (INTENT_ORDER as readonly string[]).includes(String(value)) ? (value as KeywordIntent) : "unknown";

export function IntentBadge({ intent }: { intent: string | null | undefined }) {
  const key = toIntent(intent);
  return (
    <Tag tone={TONES[key]} title={`${INTENT_LABELS[key]}意图：${DESCRIPTIONS[key]}`} aria-label={`搜索意图：${INTENT_LABELS[key]}`}>
      {INTENT_LABELS[key]}
    </Tag>
  );
}
