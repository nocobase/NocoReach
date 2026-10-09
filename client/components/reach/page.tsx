import type {ComponentProps,ReactElement,ReactNode} from 'react';
import {cn} from '@/lib/utils';
// Page frame (NocoSolution frontend standard §3.1, as in nocobase/NocoProject a023441 page-container and page-header):
// one container per page with p-6 md:p-8 and space-y-6 between blocks, no page width limit; one header with the
// page's only h1, a one-line description and the page actions (at most one solid primary button, last).
export function PageContainer({className,...props}:ComponentProps<'section'>):ReactElement{
 return <section className={cn('w-full space-y-6 p-6 md:p-8',className)} {...props}/>;
}
// `info` sits beside the title: the page's data notes in an ⓘ (NotesTip).
export function PageHeader({title,description,actions,info}:{title:ReactNode;description?:ReactNode;actions?:ReactNode;info?:ReactNode}):ReactElement{
 return <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>{info}</div>{description?<p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>:null}</div>
  {actions?<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>:null}
 </header>;
}
// A block heading (§3.4): small semibold title, optional count and one-line description, the block's actions on the right.
export function SectionHeading({id,title,count,description,actions,className}:{id?:string;title:ReactNode;count?:number;description?:ReactNode;actions?:ReactNode;className?:string}):ReactElement{
 return <div className={cn('flex items-start justify-between gap-3',className)}>
  <div className="min-w-0"><h2 id={id} className="flex items-center gap-2 font-heading text-sm font-semibold">{title}{count!==undefined?<span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>:null}</h2>{description?<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>:null}</div>
  {actions?<div className="flex shrink-0 items-center gap-1">{actions}</div>:null}
 </div>;
}
// A block card (§3.4): rounded-lg border bg-card p-4 with its heading first.
export function Section({title,count,description,actions,children,className,...props}:Omit<ComponentProps<'section'>,'title'>&{title?:ReactNode;count?:number;description?:ReactNode;actions?:ReactNode}):ReactElement{
 return <section className={cn('space-y-3 rounded-lg border bg-card p-4 text-card-foreground',className)} aria-label={typeof title==='string'?title:undefined} {...props}>
  {title?<SectionHeading title={title} count={count} description={description} actions={actions}/>:null}{children}
 </section>;
}
