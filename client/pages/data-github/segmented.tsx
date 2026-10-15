import { cn } from "#lib/utils";
// A small set of buttons choosing one view, as the GitHub page's cards use (GitHub 热点's periods and scopes).
export function Segmented({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-md border" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)} className={cn("inline-flex h-8 items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", o.id === value && "bg-muted font-medium text-foreground")}>{o.label}</button>)}
    </div>
  );
}
