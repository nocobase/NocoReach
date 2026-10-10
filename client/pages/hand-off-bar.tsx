import { $t } from "#i18n";
// The bar of a data page's ticked rows (2026-10-08 user decision, like Linear, Asana and Notion): it floats at the bottom
// of the window as soon as anything is ticked, wherever the list is on the page: the count, 清除, the list's own bulk
// actions, then 交给 Agent last. Everything ticked on the page becomes one task, with the 做法 of the first list
// (changeable in the dialog); a list with its own dialog (keywords) opens that.
import { useState, type ReactElement } from "react";
import { Bot } from "lucide-react";
import { Button } from "#components/ui/button";
import { TableBulkActionBar } from "#components/seo/table-bulk-action-bar";
import { useHandOffSources, type HandOffDraft, type HandOffSource } from "#components/reach/hand-off-slot";
import { DraftHandOffDialog } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export function combineDrafts(drafts: HandOffDraft[]): HandOffDraft {
  if (drafts.length === 1) return drafts[0];
  return { title: clip(drafts.map((d) => d.title).join("；"), 200), objective: clip(drafts.map((d) => d.objective).join("；"), 1000), brief: clip(drafts.map((d) => d.brief).join("\n\n"), 20000) };
}
// Once per data page, at the end of its frame; nothing shows until a row is ticked.
export function HandOffBar({ projectId }: { projectId?: number }): ReactElement | null {
  const sources = useHandOffSources();
  const [open, setOpen] = useState<{ draft: HandOffDraft; sources: HandOffSource[] }>();
  const [result, setResult] = useState<HandOffResult>();
  const active = sources.filter((s) => s.count > 0), total = active.reduce((t, s) => t + s.count, 0);
  const go = () => {
    const custom = active.find((s) => s.open && !s.draft);
    if (custom) { custom.open!(); return; }
    const withDraft = active.filter((s) => s.draft);
    if (withDraft.length) setOpen({ draft: combineDrafts(withDraft.map((s) => s.draft!())), sources: withDraft });
  };
  const first = open?.sources[0];
  return (
    <>
      <HandOffNotice result={result} />
      {projectId && total ? (
        <>
          {/* Room below the last rows, so the bar never covers them. */}
          <div className="h-16" aria-hidden="true" />
          <TableBulkActionBar selectedCount={total} selectedLabel={active.length === 1 && active[0].noun ? active[0].noun : $t("项已选")} onClear={() => active.forEach((s) => s.clear?.())}
            actions={<>{active.length === 1 ? active[0].actions : null}<Button size="sm" className="ml-1" onClick={go} data-hand-off=""><Bot data-icon="inline-start" />{$t("交给 Agent")}</Button></>} />
        </>
      ) : null}
      {open && first && projectId ? (
        <DraftHandOffDialog projectId={projectId} draft={open.draft} playbookId={first.playbookId || "content-outline"} page={open.sources.length === 1 ? first.page : undefined}
          description={open.sources.length === 1 && first.description ? first.description : $t("勾选的内容合成一个任务，确认后立即开始。")}
          onClose={() => setOpen(undefined)} onDone={(r) => { open.sources.forEach((s) => s.clear?.()); setOpen(undefined); setResult(r); }} />
      ) : null}
    </>
  );
}
