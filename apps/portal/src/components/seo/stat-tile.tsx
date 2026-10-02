// Ported from every-app/open-seo db8bde1 src/client/components/StatTile.tsx (MIT).
// Changes: change shown only when both periods are complete (`delta` null otherwise), lower-is-better metrics, a note slot.
import { cn } from "@/lib/utils";

/** One metric: a muted label over a big tabular number, with the change from the previous period. */
export function StatTile({
  label,
  value,
  tone,
  delta,
  hint,
  className,
}: {
  label: string;
  value: string;
  /** Colors the value, for counts that are good or bad news on their own. */
  tone?: "success" | "destructive";
  /** `change` is a ratio (0.12 = +12%) or, with `points`, an absolute difference; `better` says which way is good. */
  delta?: { change: number; better: boolean; points?: boolean } | null;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-2xl leading-tight font-semibold tabular-nums", tone === "success" && "text-success", tone === "destructive" && "text-destructive")}>{value}</p>
      {delta ? (
        <p className={cn("text-xs tabular-nums", delta.change !== 0 && (delta.better ? "nr-up" : "nr-down"))}>
          {delta.change > 0 ? "▲ " : delta.change < 0 ? "▼ " : ""}
          {delta.points ? Math.abs(delta.change).toFixed(1) : `${Math.abs(Math.round(delta.change * 1000) / 10)}%`}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
