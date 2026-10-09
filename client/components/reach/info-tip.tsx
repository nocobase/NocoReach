import { $t } from "@/i18n";
import type {ReactNode} from 'react';
import {Info} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {cn} from '@/lib/utils';
// ⓘ beside the thing it explains (user request 2026-10-04, instead of yellow or grey notes under the data): hover or
// click opens the explanation, Esc or clicking elsewhere closes it. One per metric, column or page.
export function InfoTip({children,label=$t("说明"),side='top',className}:{children:ReactNode;label?:string;side?:'top'|'bottom'|'left'|'right';className?:string}){
 return <Popover>
  <PopoverTrigger openOnHover delay={120} closeDelay={80} aria-label={label} data-info-tip=""
   className={cn('inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:text-foreground',className)}
   onClick={e=>e.stopPropagation()}>
   <Info className="size-3.5" aria-hidden="true"/>
  </PopoverTrigger>
  <PopoverContent side={side} className="w-auto max-w-xs gap-1.5 p-3 leading-relaxed" data-info-content="">{children}</PopoverContent>
 </Popover>;
}
// Several notes about the same data (a page's coverage and how it is counted) in one ⓘ.
export function NotesTip({notes,label=$t("数据说明"),side='bottom'}:{notes?:readonly ReactNode[]|null;label?:string;side?:'top'|'bottom'|'left'|'right'}){
 if(!notes?.length)return null;
 // Notes often come from the server in Chinese.
 const shown=notes.map(n=>typeof n==='string'?$t(n):n);
 return <InfoTip label={label} side={side}>{shown.length===1?<p>{shown[0]}</p>:<ul className="list-disc space-y-1 pl-4">{shown.map((n,i)=><li key={i}>{n}</li>)}</ul>}</InfoTip>;
}
// A label with its ⓘ when there is something to explain.
export function WithInfo({children,help,className}:{children:ReactNode;help?:ReactNode;className?:string}){
 return help?<span className={cn('inline-flex items-center gap-1',className)}>{children}<InfoTip label={typeof children==='string'?$t("{0}是什么",{0:children}):$t("说明")}>{help}</InfoTip></span>:<>{children}</>;
}
