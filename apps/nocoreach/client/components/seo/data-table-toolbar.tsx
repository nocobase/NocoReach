import { $t, $tj } from "@/i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/DataTableToolbar.tsx (MIT).
// The parts above a DataTable: a tab row, a toolbar row and a collapsible filter panel. Chinese copy.
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/reach-ui/badge";
import { Button } from "@/components/reach-ui/button";
import { Input } from "@/components/reach-ui/input";
import { Tabs, TabsList } from "@/components/reach-ui/tabs";

/** Tabs that switch what the table shows, as the first row of its card. Pass `TabsTrigger`s as children. */
export function DataTableTabs({
  value,
  onValueChange,
  actions,
  description,
  info,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  actions?: ReactNode;
  /** A short note about the active tab, under the tabs. */
  description?: ReactNode;
  /** An ⓘ about the active tab, beside the tabs (a tab cannot hold a button). */
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border px-4 pt-3 pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1">
          <Tabs value={value} onValueChange={(next) => onValueChange(String(next))}>
            <TabsList variant="line" className="h-auto! flex-wrap justify-start *:flex-none">
              {children}
            </TabsList>
          </Tabs>
          {info}
        </div>
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
      {$t("筛选")}{activeCount > 0 ? <Badge aria-label={$t("{0} 个条件",{0:activeCount})}>{activeCount}</Badge> : null}
    </Button>
  );
}

export function DataTableFilterPanel({ activeCount, onReset, children }: { activeCount: number; onReset: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-border bg-foreground/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{$t("筛选结果")}</p>
          {activeCount > 0 ? <Badge variant="secondary">{$tj("{0} 个条件",{0:activeCount})}</Badge> : null}
        </div>
        <Button variant="ghost" size="xs" onClick={onReset} disabled={activeCount === 0}>
          <RotateCcw data-icon="inline-start" />
          {$t("全部清除")}</Button>
      </div>
      {children}
    </div>
  );
}

/** A labelled box for one filter, for example a 最小/最大 range. */
export function DataTableFilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** A 最小/最大 number range. Empty means no limit. */
export function DataTableRangeFilter({ label, min, max, onChange, step }: { label: string; min: string; max: string; onChange: (min: string, max: string) => void; step?: string }) {
  return (
    <DataTableFilterGroup label={label}>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" step={step} placeholder={$t("最小")} aria-label={$t("{0}最小",{0:label})} className="h-7" value={min} onChange={(e) => onChange(e.target.value, max)} />
        <Input type="number" step={step} placeholder={$t("最大")} aria-label={$t("{0}最大",{0:label})} className="h-7" value={max} onChange={(e) => onChange(min, e.target.value)} />
      </div>
    </DataTableFilterGroup>
  );
}
