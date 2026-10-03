// 交给 Agent for a whole list on a data page (unanswered forum topics, Hacker News stories, Reddit threads, GitHub issues,
// a page on 访问): one task with the list in its brief, started with the chosen 做法; the task page opens.
import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DraftHandOffDialog, type TaskDraft } from "./keyword-hand-off";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
export function SectionHandOff({ projectId, draft, playbookId, page, description, label = "交给 Agent", disabled }: { projectId?: number; draft: () => TaskDraft; playbookId: string; page?: string; description: string; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState<TaskDraft>();
  const [result, setResult] = useState<HandOffResult>();
  if (!projectId) return null;
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(draft())}><Bot data-icon="inline-start" />{label}</Button>
      <HandOffNotice result={result} />
      {open ? <DraftHandOffDialog projectId={projectId} draft={open} playbookId={playbookId} page={page} description={description} onClose={() => setOpen(undefined)} onDone={(r) => { setOpen(undefined); setResult(r); }} /> : null}
    </>
  );
}
