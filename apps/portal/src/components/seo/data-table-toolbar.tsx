// Ported from every-app/open-seo db8bde1 src/client/components/table/DataTableToolbar.tsx (MIT).
// The parts above a DataTable: a tab row, a toolbar row and a collapsible filter panel. Chinese copy; range filter left out.
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList } from "@/components/ui/tabs";

/** Tabs that switch what the table shows, as the first row of its card. Pass `TabsTrigger`s as children. */
export function DataTableTabs({
  value,
  onValueChange,
  actions,
  description,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  actions?: ReactNode;
  /** A short note about the active tab, under the tabs. */
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border px-4 pt-3 pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={value} onValueChange={(next) => onValueChange(String(next))}>
          <TabsList variant="line" className="h-auto! flex-wrap justify-start *:flex-none">
            {children}
          </TabsList>
        </Tabs>
        {actions}
      </div>
      {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
    </div>
  );
}

/** Filter controls on the left, actions on the right. */
export function DataTableToolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataTableFilterToggle({ open, activeCount, onToggle }: { open: boolean; activeCount: number; onToggle: () => void }) {
  return (
    <Button variant={open ? "secondary" : "outline"} size="sm" aria-expanded={open} onClick={onToggle}>
      <SlidersHorizontal data-icon="inline-start" />
      筛选
      {activeCount > 0 ? <Badge aria-label={`${activeCount} 个条件`}>{activeCount}</Badge> : null}
    </Button>
  );
}

export function DataTableFilterPanel({ activeCount, onReset, children }: { activeCount: number; onReset: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-border bg-foreground/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">筛选结果</p>
          {activeCount > 0 ? <Badge variant="secondary">{activeCount} 个条件</Badge> : null}
        </div>
        <Button variant="ghost" size="xs" onClick={onReset} disabled={activeCount === 0}>
          <RotateCcw data-icon="inline-start" />
          全部清除
        </Button>
      </div>
      {children}
    </div>
  );
}
