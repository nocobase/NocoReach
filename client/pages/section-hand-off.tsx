import { $t } from "#i18n";
// 交给 Agent in a detail panel, at its top right (a page on 访问, a keyword's related searches, a competitor's keyword
// gap): one task with what is shown or ticked there, started with the chosen 做法; the task page opens. Data pages
// themselves use the bar that floats up when rows are ticked (hand-off-bar).
import { useId, useState, type ReactElement } from "react";
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
      {disabled ? <OffHint hint={$t('sectionHandOff.tickWhatHandOffBelow')}><Button size="sm" variant="outline" disabled><Bot data-icon="inline-start" />{label}</Button></OffHint> : <Button size="sm" onClick={() => setOpen(draft())} data-hand-off=""><Bot data-icon="inline-start" />{label}</Button>}
      <HandOffNotice result={result} />
      {open ? <DraftHandOffDialog projectId={projectId} draft={open} playbookId={playbookId} page={page} description={description} onClose={() => setOpen(undefined)} onDone={(r) => { setOpen(undefined); setResult(r); }} /> : null}
    </>
  );
}
// A switched-off button with the reason on hover or focus (a disabled button itself gets no hover); not a second button.
function OffHint({ hint, children }: { hint: string; children: ReactElement }): ReactElement {
  const id = useId();
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-describedby={id} data-hand-off-hint="">
      {children}
      <span role="tooltip" id={id} className="pointer-events-none invisible absolute top-full right-0 z-50 mt-1.5 w-max max-w-xs rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md group-focus-within:visible group-hover:visible">{hint}</span>
    </span>
  );
}
