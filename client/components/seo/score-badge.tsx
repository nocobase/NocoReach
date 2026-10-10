import { $t } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/ScoreBadge.tsx (MIT): keyword difficulty (0–100)
// as a tier-colored badge — the shared Tag, so it matches every other pill (NocoSolution frontend standard §5.3).
import { Tag, type Tone } from "#components/reach/tag";

function tier(value: number | null): Tone {
  if (value == null) return "grey";
  if (value <= 35) return "green";
  if (value <= 50) return "amber";
  if (value <= 65) return "orange";
  return "red";
}

export function ScoreBadge({ value }: { value: number | null }) {
  return (
    <Tag tone={tier(value)} className="min-w-7 justify-center tabular-nums" title={value == null ? $t("没有难度数据") : $t("难度 {0}（0–100，越高越难进前 10）",{0:value})}>
      {value ?? "—"}
    </Tag>
  );
}
