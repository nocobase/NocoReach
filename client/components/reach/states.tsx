import { $t } from "#i18n";
import type {ReactElement,ReactNode} from 'react';
import {AlertCircleIcon} from 'lucide-react';
import {cn} from '#lib/utils';
import {Alert,AlertDescription,AlertTitle} from '#components/ui/alert';
import {Button} from '#components/ui/button';
import {Skeleton} from '#components/ui/skeleton';
import {Empty,EmptyContent,EmptyDescription,EmptyHeader,EmptyMedia,EmptyTitle} from '#components/ui/empty';
import {PageContainer,PageHeader} from './page';
// Loading, empty and failed states (NocoSolution frontend standard §10, as np-states in nocobase/NocoProject a023441).
// `label` names what is loading for screen readers ("Loading tasks"); the default is "Loading".
export function ListSkeleton({rows=4,className,label}:{rows?:number;className?:string;label?:string}):ReactElement{
 return <div role="status" aria-label={label??$t('common.loading')} className={cn('space-y-2 rounded-lg border bg-card p-3',className)}>{Array.from({length:rows},(_,i)=><Skeleton key={i} className="h-7 w-full"/>)}</div>;
}
export function PageSkeleton({title,description}:{title:string;description?:string}):ReactElement{
 return <PageContainer><PageHeader title={title} description={description}/><ListSkeleton rows={6}/></PageContainer>;
}
// A failed load: what happened and how to go on (§11), with a retry button.
export function LoadError({title,message,onRetry}:{title:string;message?:string;onRetry?:()=>void}):ReactElement{
 return <Alert variant="destructive"><AlertCircleIcon/><AlertTitle>{title}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{message||$t('states.requestNotCompleteTryAgain')}{onRetry?<Button variant="outline" size="sm" onClick={onRetry}>{$t('common.retry')}</Button>:null}</AlertDescription></Alert>;
}
// Something on the page went wrong and needs a look (a failed check, an unanswered request): shown, not hidden in an ⓘ.
export function InlineError({children,action}:{children:ReactNode;action?:ReactNode}):ReactElement{
 return <Alert variant="destructive"><AlertCircleIcon/><AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}{action}</AlertDescription></Alert>;
}
export function EmptyState({icon,title,description,action,className}:{icon:ReactNode;title:string;description?:string;action?:ReactNode;className?:string}):ReactElement{
 return <Empty className={cn('border border-dashed bg-card/40',className)}><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle>{description?<EmptyDescription>{description}</EmptyDescription>:null}</EmptyHeader>{action?<EmptyContent>{action}</EmptyContent>:null}</Empty>;
}
