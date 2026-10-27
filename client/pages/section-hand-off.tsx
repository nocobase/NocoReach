import { $t } from "#i18n";
// 交给 Agent in a detail panel, at its top right (a page on 访问, a keyword's related searches, a competitor's keyword
// gap): one task with what is shown or ticked there, started with the chosen 做法; the task page opens. Data pages
// themselves use the bar that floats up when rows are ticked (hand-off-bar).
import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "#components/ui/button";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
export function SectionHandOff({ projectId, draft, playbookId, page, description, label = $t('common.handOffAgent'), disabled }: { projectId?: number; draft: () => TaskDraft; playbookId: string; page?: string; description?: string; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState<TaskDraft>();
  const [result, setResult] = useState<HandOffResult>();
  if (!projectId) return null;
  return (
    <>
      {/* Switched off until something is ticked, with no hint: the button turning blue says it (2026-10-24 user feedback:
          the hint took focus when a panel opened and covered its description). */}
      {disabled ? <Button size="sm" variant="outline" disabled><Bot data-icon="inline-start" />{label}</Button> : <Button size="sm" onClick={() => setOpen(draft())} data-hand-off=""><Bot data-icon="inline-start" />{label}</Button>}
      <HandOffNotice result={result} />
      {open ? <DraftHandOffDialog projectId={projectId} draft={open} playbookId={playbookId} page={page} description={description} onClose={() => setOpen(undefined)} onDone={(r) => { setOpen(undefined); setResult(r); }} /> : null}
    </>
  );
}
