// Ported from every-app/open-seo db8bde1 src/client/components/table/SortableHeader.tsx (MIT); the help tooltip is the
// shared ⓘ, beside the button so it does not sort when opened.
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { InfoTip } from "@/components/reach/info-tip";
import { help as glossary } from "@/pages/glossary";

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
  /** What the column means, in an ⓘ; by default the glossary entry for the label. `false` leaves it out. */
  help?: ReactNode | false;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const content = (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
      aria-label={`按${label}排序`}
      aria-pressed={!!sorted}
    >
      {label}
      {sorted === "asc" ? <ArrowUp className="size-3 shrink-0" /> : sorted === "desc" ? <ArrowDown className="size-3 shrink-0" /> : null}
    </button>
  );
  const note = help === false ? null : (help ?? glossary(label));
  const withHelp = note ? <span className="inline-flex items-center gap-1">{content}<InfoTip label={`${label}是什么`}>{note}</InfoTip></span> : content;
  if (align === "right") return <span className="flex w-full justify-end">{withHelp}</span>;
  return withHelp;
}
