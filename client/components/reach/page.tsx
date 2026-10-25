import {createContext,useContext,useMemo,useState,type ComponentProps,type ReactElement,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {cn} from '#lib/utils';
import {$t} from '#i18n';
import {InfoTip} from './info-tip';
// Page frame (NocoSolution frontend standard §3.1, as in nocobase/NocoProject a023441 page-container and page-header):
// one container per page with p-6 md:p-8 and space-y-6 between blocks, no page width limit; one header with the
// page's only h1, a one-line description and the page actions (at most one solid primary button, last).
// Where a tab's own actions go: the page header's action row (UI review 2026-10-22, every refresh of a page or of a
// whole tab sits top right). PageContainer holds the slot, PageHeader draws it, HeaderActions fills it.
const ActionSlotContext=createContext<{el:HTMLElement|null;set:(el:HTMLElement|null)=>void}|null>(null);
export function PageContainer({className,...props}:ComponentProps<'section'>):ReactElement{
 const [el,setEl]=useState<HTMLElement|null>(null);
 const slot=useMemo(()=>({el,set:setEl}),[el]);
 return <ActionSlotContext.Provider value={slot}><section className={cn('w-full space-y-6 p-6 md:p-8',className)} {...props}/></ActionSlotContext.Provider>;
}
// A tab's actions, drawn after the page's own in the header; in place when the page has no header.
export function HeaderActions({children}:{children:ReactNode}):ReactNode{
 const slot=useContext(ActionSlotContext);
 return slot?.el?createPortal(children,slot.el):children;
}
// `info` sits beside the title: the page's data notes in an ⓘ (NotesTip).
export function PageHeader({title,description,actions,info}:{title:ReactNode;description?:ReactNode;actions?:ReactNode;info?:ReactNode}):ReactElement{
 return <header className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
  <div className='min-w-0'><div className='flex items-center gap-2'><h1 className='font-heading text-2xl font-semibold tracking-tight'>{title}</h1>{info}</div>{description?<p className='mt-1.5 max-w-3xl text-sm text-muted-foreground'>{description}</p>:null}</div>
  <HeaderActionRow actions={actions}/>
 </header>;
}
function HeaderActionRow({actions}:{actions?:ReactNode}):ReactElement{
 const slot=useContext(ActionSlotContext);
 // Hidden while neither the page nor a tab put anything in it, so an empty row adds no gap on narrow screens.
 return <div className='nr-page-actions flex shrink-0 flex-wrap items-center gap-2'>{actions}<div ref={slot?.set} className='flex items-center gap-2 empty:hidden'/></div>;
}
// A block heading (§3.4): small semibold title, optional count, the block's actions on the right. The description is in
// an ⓘ beside the title, not a grey line under it (2026-10-22 user decision D5: every note under a card title goes in ⓘ).
export function SectionHeading({id,title,count,description,actions,className}:{id?:string;title:ReactNode;count?:number;description?:ReactNode;actions?:ReactNode;className?:string}):ReactElement{
 return <div className={cn('flex items-start justify-between gap-3',className)}>
  <div className='flex min-w-0 items-center gap-1'><h2 id={id} className='flex items-center gap-2 font-heading text-sm font-semibold'>{title}{count!==undefined?<span className='text-xs font-normal text-muted-foreground tabular-nums'>{count}</span>:null}</h2>{description?<InfoTip label={typeof title==='string'?$t('common.what',{0:title}):$t('common.info')}>{description}</InfoTip>:null}</div>
  {actions?<div className='flex shrink-0 items-center gap-1'>{actions}</div>:null}
 </div>;
}
// A block card (§3.4): rounded-lg border bg-card p-4 with its heading first.
export function Section({title,count,description,actions,children,className,...props}:Omit<ComponentProps<'section'>,'title'>&{title?:ReactNode;count?:number;description?:ReactNode;actions?:ReactNode}):ReactElement{
 return <section className={cn('space-y-3 rounded-lg border bg-card p-4 text-card-foreground',className)} aria-label={typeof title==='string'?title:undefined} {...props}>
  {title?<SectionHeading title={title} count={count} description={description} actions={actions}/>:null}{children}
 </section>;
}
