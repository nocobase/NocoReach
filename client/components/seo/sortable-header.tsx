import { $t } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/SortableHeader.tsx (MIT). What the column means
// shows as a tooltip when the header is hovered or focused, rather than in an ⓘ beside it, which widened every column
// (2026-10-15 user request). A column not sorted yet shows a faint ↕ so it reads as sortable (2026-10-14 user report:
// the 页面 columns looked as if they could not be sorted).
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#components/ui/tooltip";
import { help as glossary } from "#pages/glossary";

type SortableColumn = {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

export function SortableHeader({
  column,
  label,
  help,
  align,
}: {
  column: SortableColumn;
  label: string;
  /** What the column means, shown on hover; by default the glossary entry for the label. `false` leaves it out. */
  help?: ReactNode | false;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const button = <button
    type='button'
    className='inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground'
    onClick={column.getToggleSortingHandler()}
    aria-label={$t('sortableHeader.sort',{0:label})}
    aria-pressed={!!sorted}
  />;
  const inner = <>
    {label}
    {sorted === "asc" ? <ArrowUp className="size-3 shrink-0" /> : sorted === "desc" ? <ArrowDown className="size-3 shrink-0" /> : <ArrowUpDown aria-hidden="true" data-unsorted="" className="size-3 shrink-0 opacity-40" />}
  </>;
  const note = help === false ? null : (help ?? glossary(label));
  const withHelp = note ? <Tooltip>
    <TooltipTrigger render={button} data-column-help=''>{inner}</TooltipTrigger>
    <TooltipContent className='flex-col items-start gap-1 leading-relaxed'>{note}</TooltipContent>
  </Tooltip> : <button
    type="button"
    className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
    onClick={column.getToggleSortingHandler()}
    aria-label={$t('sortableHeader.sort',{0:label})}
    aria-pressed={!!sorted}
  >{inner}</button>;
  if (align === "right") return <span className="flex w-full justify-end">{withHelp}</span>;
  return withHelp;
}
