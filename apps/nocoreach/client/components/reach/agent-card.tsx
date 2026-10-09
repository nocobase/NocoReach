import type {ComponentProps,ReactElement,ReactNode} from 'react';
import {ActorAvatar} from '@/components/reach/actor';
import {cn} from '@/lib/utils';
// One card for every Agent on the Agent page (2026-10-08 user feedback: the computers and the online AI looked like two
// products): the agent avatar, the name with one status tag (可用 green, 离线/不可用 amber, 尚未连上/未接入 grey), one line on
// what it uses, facts with a grey label above each value — plain text, a tag only when something needs attention — then
// the buttons.
export type AgentFact={label:ReactNode;value:ReactNode};
export function AgentCard({name,status,detail,facts=[],actions,className,...props}:Omit<ComponentProps<'section'>,'children'>&{name:ReactNode;status:ReactNode;detail:ReactNode;facts?:AgentFact[];actions?:ReactNode[]}):ReactElement{
 const buttons=(actions||[]).filter(Boolean);
 return <section className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground',className)} {...props}>
  <div className="flex items-center gap-3"><ActorAvatar type="agent" size="default"/>
   <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 text-sm font-medium">{name}{status}</p>
    <p className="text-xs text-muted-foreground">{detail}</p></div></div>
  {facts.length>0&&<dl className="flex flex-wrap gap-x-8 gap-y-2 border-t pt-3 text-sm">{facts.map((f,i)=><div key={i}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="mt-0.5 flex items-center gap-1">{f.value}</dd></div>)}</dl>}
  {buttons.length>0&&<div className="flex flex-wrap items-center gap-2">{buttons}</div>}
 </section>;
}
