// Ported from every-app/open-seo db8bde1 src/client/components/table/SortableHeader.tsx (MIT); help tooltip left out.
import { ArrowDown, ArrowUp } from "lucide-react";

type SortableColumn = {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

export function SortableHeader({
  column,
  label,
  title,
  align,
}: {
  column: SortableColumn;
  label: string;
  /** Native tooltip. */
  title?: string;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const content = (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
      title={title}
      aria-label={`按${label}排序`}
      aria-pressed={!!sorted}
    >
      {label}
      {sorted === "asc" ? <ArrowUp className="size-3 shrink-0" /> : sorted === "desc" ? <ArrowDown className="size-3 shrink-0" /> : null}
    </button>
  );
  if (align === "right") return <span className="flex w-full justify-end">{content}</span>;
  return content;
}
