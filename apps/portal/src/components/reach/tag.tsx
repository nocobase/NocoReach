import type {ComponentProps,ReactElement,ReactNode} from 'react';
import {cn} from '@/lib/utils';
// The one tag (NocoSolution frontend standard §5.3, as NpTag in nocobase/NocoProject a023441): a 12px pill in a pale
// tint of its hue with darker text of the same hue; status tags add a small dot. Colours live in src/theme/tones.css.
export type Tone='grey'|'blue'|'violet'|'amber'|'green'|'slate'|'red'|'orange';
export const TONE_CLASS:Readonly<Record<Tone,string>>={grey:'bg-nr-tint-grey text-nr-ink-grey',blue:'bg-nr-tint-blue text-nr-ink-blue',violet:'bg-nr-tint-violet text-nr-ink-violet',amber:'bg-nr-tint-amber text-nr-ink-amber',green:'bg-nr-tint-green text-nr-ink-green',slate:'bg-nr-tint-slate text-nr-ink-slate',red:'bg-nr-tint-red text-nr-ink-red',orange:'bg-nr-tint-orange text-nr-ink-orange'};
export const TONE_DOT_CLASS:Readonly<Record<Tone,string>>={grey:'bg-nr-ink-grey',blue:'bg-nr-ink-blue',violet:'bg-nr-ink-violet',amber:'bg-nr-ink-amber',green:'bg-nr-ink-green',slate:'bg-nr-ink-slate',red:'bg-nr-ink-red',orange:'bg-nr-ink-orange'};
// One meaning, one hue (§5.3): not started grey, in progress blue, waiting for review violet, needs attention amber,
// done green, cancelled or archived slate, failed red.
export const STATE_TONE={todo:'grey',doing:'blue',review:'violet',attention:'amber',done:'green',closed:'slate',failed:'red'} as const satisfies Record<string,Tone>;
export function Tag({tone,dot=false,icon,children,className,...props}:Omit<ComponentProps<'span'>,'children'>&{tone:Tone;dot?:boolean;icon?:ReactNode;children:ReactNode}):ReactElement{
 return <span data-slot="tag" data-tone={tone} className={cn('inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0 badge-text font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',TONE_CLASS[tone],className)} {...props}>
  {icon??(dot?<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current"/>:null)}{children}
 </span>;
}
