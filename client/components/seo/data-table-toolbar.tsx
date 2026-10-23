import { $t, $tj } from "#i18n";
// Ported from every-app/open-seo db8bde1 src/client/components/table/DataTableToolbar.tsx (MIT).
// The parts above a DataTable: a toolbar row (row filters, search, actions) and a collapsible filter panel.
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Input } from "#components/ui/input";
import { Tabs, TabsList } from "#components/ui/tabs";
import { InfoTip } from "#components/reach/info-tip";

/**
 * A table's row filters (All 658 | Blog 375 | Docs 199 …) as a segmented control at the left of its toolbar row, the
 * search and other filters (`tools`) after it on the same row, `actions` at the right (2026-10-22 decision D1: line
 * tabs only switch a page's sections under its header; what a table shows is chosen in its toolbar, like the tasks'
 * quick views). Pass `TabsTrigger`s as children. `description` and `info` are an ⓘ beside the segments, not a grey
 * line (decision D5). On a narrow screen the row wraps: the segments first, then the tools under them.
 */
export function DataTableTabs({
  value,
  onValueChange,
  actions,
  description,
  info,
  tools,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  actions?: ReactNode;
  /** A short note about the active filter, in an ⓘ beside the segments. */
  description?: ReactNode;
  /** An ⓘ about the active filter, beside the segments (a segment cannot hold a button). */
  info?: ReactNode;
  /** Search and other filters, on the same row after the segments. */
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
      <div className="flex max-w-full items-center gap-1">
        <Tabs value={value} onValueChange={(next) => onValueChange(String(next))} className="max-w-full">
          <TabsList variant="segmented">{children}</TabsList>
        </Tabs>
        {description ? <InfoTip label={$t('common.info')}>{description}</InfoTip> : null}
        {info}
      </div>
      {tools}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
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
      {$t('common.filter')}{activeCount > 0 ? <Badge aria-label={$t('dataTableToolbar.conditions',{0:activeCount})}>{activeCount}</Badge> : null}
    </Button>
  );
}

export function DataTableFilterPanel({ activeCount, onReset, children }: { activeCount: number; onReset: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-border bg-foreground/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{$t('dataTableToolbar.filterResults')}</p>
          {activeCount > 0 ? <Badge variant="secondary">{$tj('dataTableToolbar.conditions',{0:activeCount})}</Badge> : null}
        </div>
        <Button variant="ghost" size="xs" onClick={onReset} disabled={activeCount === 0}>
          <RotateCcw data-icon="inline-start" />
          {$t('dataTableToolbar.clear')}</Button>
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
        <Input type="number" step={step} placeholder={$t('dataTableToolbar.min')} aria-label={$t('dataTableToolbar.minValue',{0:label})} className="h-7" value={min} onChange={(e) => onChange(e.target.value, max)} />
        <Input type="number" step={step} placeholder={$t('dataTableToolbar.max')} aria-label={$t('dataTableToolbar.maxValue',{0:label})} className="h-7" value={max} onChange={(e) => onChange(min, e.target.value)} />
      </div>
    </DataTableFilterGroup>
  );
}
