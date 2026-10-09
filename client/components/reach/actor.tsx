import { $t } from "@/i18n";
import type {ReactElement} from 'react';
import {Bot,Cog,Monitor,Sparkles,Zap} from 'lucide-react';
import {Avatar,AvatarFallback} from '@/components/ui/avatar';
import {cn} from '@/lib/utils';
import {initials} from '@/pages/task-list-model';
// The one avatar for people, agents and the system (NocoSolution frontend standard §S5.1, as NpActorAvatar in
// nocobase/NocoProject): a person is round with initials, an agent (本机 Agent, 在线 AI, the guide that talks you through
// a connection) a rounded square with a bot in the agent violet, the system a dashed round cog. Shape and colour both
// tell the kind apart and the kind is repeated for screen readers. `--agent` is used for nothing else.
export type ActorKind='user'|'agent'|'system';
const KIND:Record<ActorKind,string>={user:$t("成员"),agent:'Agent',system:$t("系统")};
export function ActorAvatar({type,name,size='sm',showName=false,decorative=true,className}:{type:ActorKind;name?:string|null;
 /** `xs` sits inline with text (16px), `sm` in lists and messages (24px), `default` in headers and cards (32px). */
 size?:'xs'|'sm'|'default';showName?:boolean;decorative?:boolean;className?:string}):ReactElement{
 const icon=size==='xs'?'size-2.5':size==='sm'?'size-3.5':'size-4';
 const avatar=<Avatar size={size==='default'?'default':'sm'} data-actor={type}
  className={cn(size==='xs'&&'size-4',type==='agent'&&'rounded-md after:rounded-md',type==='system'&&'after:border-dashed after:border-muted-foreground/50',!showName&&className)}
  {...(decorative||showName?{'aria-hidden':true}:{role:'img','aria-label':`${name??'—'}（${KIND[type]}）`})} title={name??undefined}>
  <AvatarFallback className={cn('font-medium text-foreground/80',size==='xs'&&'text-[0.5rem]',type==='agent'&&'rounded-md bg-agent/15 text-agent',type==='system'&&'bg-transparent text-muted-foreground')}>
   {type==='agent'?<Bot className={icon} aria-hidden="true"/>:type==='system'?<Cog className={icon} aria-hidden="true"/>:<span aria-hidden="true">{initials(name??'')||'?'}</span>}
  </AvatarFallback>
 </Avatar>;
 if(!showName)return avatar;
 return <span className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5',className)}>{avatar}<span className="truncate" title={name??undefined}>{name??'—'}</span><span className="sr-only">（{KIND[type]}）</span></span>;
}
// What the AI wrote or suggested gets a small violet sparkle beside it (§S4.1 来源标记).
export function AiMark({label=$t("AI 生成"),className}:{label?:string;className?:string}):ReactElement{
 return <span className={cn('inline-flex shrink-0 align-[-0.125em] text-agent',className)} title={label}><Sparkles className="size-3.5" aria-hidden="true"/><span className="sr-only">{label}</span></span>;
}
// The two kinds of agent (NocoProject RuntimeTypeIcon): 本机 Agent runs on a computer (monitor), 在线 AI on the server (bolt).
export function RuntimeIcon({type,className}:{type:'computer'|'online';className?:string}):ReactElement{
 const Icon=type==='computer'?Monitor:Zap;return <Icon aria-hidden="true" className={className}/>;
}
