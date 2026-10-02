// Ported from every-app/open-seo db8bde1 src/client/components/table/ScoreBadge.tsx (MIT): keyword difficulty (0–100)
// as a tier-colored badge, in NocoReach tones.
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "@/components/reach/tag";

function tier(value: number | null): Tone {
  if (value == null) return "grey";
  if (value <= 35) return "green";
  if (value <= 50) return "amber";
  if (value <= 65) return "orange";
  return "red";
}

export function ScoreBadge({ value }: { value: number | null }) {
  return (
    <span
      className={cn("inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums", TONE_CLASS[tier(value)])}
      title={value == null ? "没有难度数据" : `难度 ${value}（0–100，越高越难进前 10）`}
    >
      {value ?? "—"}
    </span>
  );
}
