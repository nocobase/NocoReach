import { $t } from '#i18n';
import type {ReactElement} from 'react';
import {ChevronRightIcon} from 'lucide-react';
import {Tag} from '#components/reach/tag';
import {stageLabel,type Stage} from '#pages/playbook-model';
// A 做法's steps as a row of tags — Agent 修改 › 你看效果并发布 › 上线 › 观察 — the steps for a person in violet. One look on
// 机会 and on a task before it starts (2026-10-08 user request). When someone else owns the work, their name replaces 你.
export function StepChips({stages,owner}:{stages:Stage[];owner?:string|null}):ReactElement{
 const person=(label:string)=>owner?(label.startsWith('你')?`${owner} ${label.slice(1)}`:`${label} · ${owner}`):label;
 return <ol className='flex flex-wrap items-center gap-1' aria-label={$t('common.steps')}>{stages.map((s,i)=><li key={s.key} className='flex items-center gap-1'>{i>0&&<ChevronRightIcon className='size-3 text-muted-foreground' aria-hidden='true'/>}
  <Tag tone={s.kind==='review'?'violet':'grey'}>{s.kind==='review'?person(stageLabel(s)):stageLabel(s)}</Tag></li>)}</ol>;
}
