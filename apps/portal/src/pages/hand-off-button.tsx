import { $t } from "@/i18n";
// The page's one 交给 Agent button (top right, last in the page header; 2026-10-08 user decision): off until something
// is ticked, with a hover note saying so; then 交给 Agent（N）. Everything ticked on the page becomes one task, with the
// 做法 of the first list (changeable in the dialog); a list with its own dialog (keywords) opens that.
import { useId, useState, type ReactElement } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHandOffSources, type HandOffDraft, type HandOffSource } from "@/components/reach/hand-off-slot";
import { DraftHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export function combineDrafts(drafts: HandOffDraft[]): HandOffDraft {
  if (drafts.length === 1) return drafts[0];
  return { title: clip(drafts.map((d) => d.title).join("；"), 200), objective: clip(drafts.map((d) => d.objective).join("；"), 1000), brief: clip(drafts.map((d) => d.brief).join("\n\n"), 20000) };
}
// A switched-off button with the reason on hover or focus (a disabled button itself gets no hover); not a second button.
export function OffHint({ hint, children }: { hint: string; children: ReactElement }): ReactElement {
  const id = useId();
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-describedby={id} data-hand-off-hint="">
      {children}
      <span role="tooltip" id={id} className="pointer-events-none invisible absolute top-full right-0 z-50 mt-1.5 w-max max-w-xs rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md group-focus-within:visible group-hover:visible">{hint}</span>
    </span>
  );
}
export function HandOffButton({ projectId }: { projectId?: number }): ReactElement | null {
  const sources = useHandOffSources();
  const [open, setOpen] = useState<{ draft: HandOffDraft; sources: HandOffSource[] }>();
  const [result, setResult] = useState<HandOffResult>();
  if (!projectId || !sources.length) return null;
  const active = sources.filter((s) => s.count > 0), total = active.reduce((t, s) => t + s.count, 0);
  const single = active.length > 0 && active.every((s) => s.single);
  const hint = sources.find((s) => s.hint)?.hint || $t("先在下面勾选要交给 Agent 的内容");
  const go = () => {
    const custom = active.find((s) => s.open && !s.draft);
    if (custom) { custom.open!(); return; }
    const withDraft = active.filter((s) => s.draft);
    if (withDraft.length) setOpen({ draft: combineDrafts(withDraft.map((s) => s.draft!())), sources: withDraft });
  };
  const button = <Button size="sm" variant={total ? "default" : "outline"} disabled={!total} onClick={go} data-hand-off="">
    <Bot data-icon="inline-start" />{total && !single ? $t("交给 Agent（{0}）", { 0: total }) : $t("交给 Agent")}
  </Button>;
  const first = open?.sources[0];
  return (
    <>
      {total ? button : <OffHint hint={hint}>{button}</OffHint>}
      <HandOffNotice result={result} />
      {open && first ? (
        <DraftHandOffDialog projectId={projectId} draft={open.draft} playbookId={first.playbookId || "content-outline"} page={open.sources.length === 1 ? first.page : undefined}
          description={open.sources.length === 1 && first.description ? first.description : $t("勾选的内容合成一个任务，确认后立即开始。")}
          onClose={() => setOpen(undefined)} onDone={(r) => { open.sources.forEach((s) => s.clear?.()); setOpen(undefined); setResult(r); }} />
      ) : null}
    </>
  );
}
