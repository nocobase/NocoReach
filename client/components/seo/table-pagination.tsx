import { $t, $tj } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/TablePagination.tsx (MIT).
// Changes: Chinese copy; link buttons, uneven page ranges and "load more" left out.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { Button } from "#components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#components/ui/select";

export function TablePagination<TSize extends number>({
  page,
  pageSize,
  pageSizes,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  /** Omit for a fixed page size: the footer hides the "每页" select. */
  pageSizes?: readonly TSize[];
  totalCount: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: TSize) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isOutOfRange = page > totalPages;
  const currentPage = isOutOfRange ? totalPages : page;

  // A page can fall past the end when rows are filtered away. Move to the last page instead of showing an empty table.
  useEffect(() => {
    if (isOutOfRange) onPageChange(currentPage);
  }, [currentPage, isOutOfRange, onPageChange]);

  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalCount, currentPage * pageSize);
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {totalCount === 0 ? $t("0 行") : $t("第 {0}–{1} 行，共 {2} 行",{0:start.toLocaleString(),1:end.toLocaleString(),2:totalCount.toLocaleString()})}
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {pageSizes && onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">{$t("每页")}</span>
            <Select
              value={pageSize}
              onValueChange={(value) => {
                const size = pageSizes.find((option) => option === value);
                if (size != null) onPageSizeChange(size);
              }}
            >
              <SelectTrigger size="sm" className="w-20" aria-label={$t("每页行数")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
            {$tj("{0} / {1} 页",{0:currentPage.toLocaleString(),1:totalPages.toLocaleString()})}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={$t("上一页")} disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={$t("下一页")} disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
