import { $t } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/TableBulkActionBar.tsx (MIT); export menu left out.
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#components/ui/button";

/** Floats at the bottom of the window while rows are selected. */
export function TableBulkActionBar({
  selectedCount,
  selectedLabel = $t('common.selected'),
  actions,
  onClear,
}: {
  selectedCount: number;
  selectedLabel?: string;
  actions: ReactNode;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label={$t('tableBulkActionBar.bulkActions')}
        className="pointer-events-auto flex items-stretch rounded-xl border border-border bg-popover/90 text-popover-foreground shadow-2xl backdrop-blur"
      >
        <div className="flex items-center gap-2 border-r border-border py-2 pr-3 pl-2 text-sm">
          <Button variant="ghost" size="icon-xs" aria-label={$t('common.clearSelection')} className="text-muted-foreground" onClick={onClear}>
            <X />
          </Button>
          <span className="text-muted-foreground">{selectedLabel}</span>
          <span className="font-medium tabular-nums">{selectedCount}</span>
        </div>
        <div className="flex items-center gap-1 px-1.5">{actions}</div>
      </div>
    </div>
  );
}

export function TableBulkActionButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </Button>
  );
}
