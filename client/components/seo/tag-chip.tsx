// Ported from every-app/open-seo db8bde1 src/client/features/saved-keywords/TagChip.tsx and src/shared/tag-colors.ts
// (MIT): tag colors are NocoReach tones.
import type { ReactNode } from "react";
import { cn } from "#lib/utils";
import { TONE_CLASS, TONE_DOT_CLASS, type Tone } from "#components/reach/tag";

export const TAG_COLORS: Tone[] = ["blue", "green", "amber", "violet", "orange", "red", "slate", "grey"];
const tone = (color: string): Tone => (TAG_COLORS.includes(color as Tone) ? (color as Tone) : "grey");

export function TagDot({ color }: { color: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT_CLASS[tone(color)])} />;
}

export function TagChip({
  tag,
  trailing,
  onClick,
  selected,
}: {
  tag: { id: string; name: string; color: string };
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const base = cn("inline-flex h-5 max-w-40 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium", TONE_CLASS[tone(tag.color)], selected && "ring-2 ring-ring");
  const content = (
    <>
      <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[tone(tag.color)])} />
      <span className="truncate">{tag.name}</span>
      {trailing}
    </>
  );
  return onClick ? (
    <button type="button" className={cn(base, "cursor-pointer hover:brightness-95")} aria-pressed={selected} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={base}>{content}</span>
  );
}
