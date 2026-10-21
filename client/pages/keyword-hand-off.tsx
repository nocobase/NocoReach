import {refreshNavBadges} from '#components/app-shell/nav-badges';
import { type Message, useMessageState, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useRef,type ReactElement} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '#components/ui/dialog';
import {request} from './strategy/service';
import type {StrategyState} from './strategy/model';
import {marketLabel,metric,type SiteRank} from './keyword-api';
import {getIntentLabels,toIntent} from '#components/seo/intent-badge';
// 交给 Agent from 关键词 (SPEC "OpenSEO 数据页面"): the chosen keywords become one task, with 优化现有页面 suggested when
// the site already ranks (that page linked), otherwise 内容选题与大纲.
export type HandOffKeyword={keyword:string;market:{locationCode:number;language:string}|null;volume:number|null;difficulty:number|null;intent:string|null;rank?:SiteRank};
const work=<T,>(projectId:number,taskId:number,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId:String(taskId),...body},unwrap:'data'});
export function keywordDraft(rows:HandOffKeyword[]){
 const head=rows[0].keyword,ranked=rows.filter(r=>r.rank);
 const title=(rows.length===1?$t('keywordHandOff.around',{0:head}):$t('keywordHandOff.aroundMoreKeywords',{0:head,1:rows.length}))+(ranked.length?$t('keywordHandOff.improveExistingPage'):$t('keywordHandOff.writeContent'));
 const lines=rows.map(r=>$t('keywordHandOff.monthlyVolumeDifficultyIntent',{0:r.keyword,1:marketLabel(r.market),2:metric(r.volume),3:metric(r.difficulty),4:getIntentLabels()[toIntent(r.intent)],5:r.rank?$t('keywordHandOff.averagePositionOverLast28',{0:r.rank.position.toFixed(1),1:r.rank.clicks,2:r.rank.page}):$t('keywordHandOff.siteNotRankYet')}));
 const brief=[$t('keywordHandOff.keywords'),...lines,'',$t('keywordHandOff.evidenceSearchVolumeDifficultyIntent'),$t('keywordHandOff.suggestionCoverKeywordsOnePiece')].join('\n');
 return {title:title.slice(0,200),objective:$t('keywordHandOff.getSiteTopSearchResults',{0:rows.map(r=>r.keyword).join('、')}).slice(0,1000),brief:brief.slice(0,20000)};
}
// The best ranking page among the keywords, if any (it is linked to the task when it is in 网站内容).
export const rankedPage=(rows:HandOffKeyword[])=>rows.filter(r=>r.rank).sort((a,b)=>b.rank!.clicks-a.rank!.clicks||a.rank!.position-b.rank!.position)[0]?.rank?.page;
// signalKey: set when the task comes straight from a 最新变化 on 洞察.
export type TaskDraft={title:string;objective:string;brief:string;signalKey?:string};
// Creates a task from a draft (not from an opportunity), not started (2026-10-08 user decision: the person starts it on
// the task page with 确定开始执行 after reading it); the suggested 做法 is preselected there, and the page is linked when
// it is in 网站内容. Shared by every 交给 Agent on the data pages.
export async function createDraftTask(projectId:number,draft:TaskDraft,playbookId:string,page?:string,requestId:string=crypto.randomUUID()):Promise<{taskId?:number;started:boolean}>{
 const state=await request<StrategyState>(projectId,'state');
 const next=await request<StrategyState>(projectId,'confirmDirection',{...draft,playbookId,...(page?{page}:{}),revision:state.revision,requestId});
 const taskId=next.proposals.find(p=>!p.insight&&p.taskId&&!state.proposals.some(o=>o.id===p.id))?.taskId;
 if(!taskId)return {started:false};
 refreshNavBadges();
 if(page){try{const d=await work<{work:{revision:number}}>(projectId,taskId,'get');await work(projectId,taskId,'advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'linkPage',url:page});}catch{/* not in 网站内容: the task still names it */}}
 return {taskId,started:false};
}
export const handOffKeywords=(projectId:number,rows:HandOffKeyword[])=>createDraftTask(projectId,keywordDraft(rows),rankedPage(rows)?'optimize-page':'content-outline',rankedPage(rows));
// While the task is being created (a moment): what happens, or why it did not; the task page then opens.
function Creating({error,onClose}:{error:string;onClose:()=>void}):ReactElement{
 return <Dialog open onOpenChange={o=>{if(!o&&error)onClose();}}><DialogContent className="sm:max-w-sm" showCloseButton={Boolean(error)}>
  <DialogHeader><DialogTitle>{$t('common.handOffAgent')}</DialogTitle><DialogDescription>{error?$t('keywordHandOff.taskNotCreated'):$t('keywordHandOff.creatingTaskPageOpensNext')}</DialogDescription></DialogHeader>
  {error?<><p role="alert" className="nr-error">{error}</p><DialogFooter><Button variant="outline" onClick={onClose}>{$t('keywordHandOff.close')}</Button></DialogFooter></>:null}
 </DialogContent></Dialog>;
}
// Runs once per hand-off (a second mount in development, or a second click, reuses the same request).
function useCreate(create:(requestId:string)=>Promise<void>,onError:(e:unknown)=>void){const requestId=useRef(crypto.randomUUID()),ran=useRef(false);
 useEffect(()=>{if(ran.current)return;ran.current=true;void create(requestId.current).catch(onError);},[]);}
// 交给 Agent for keywords: the task is created at once and its page opens (no dialog to pick the 做法 any more).
export function KeywordHandOffDialog({projectId,rows,onClose,onDone}:{projectId:number;rows:HandOffKeyword[];onClose:()=>void;onDone:(r:{taskId?:number;started:boolean;title:string})=>void}):ReactElement{
 const [error,setError]=useMessageState(''),draft=keywordDraft(rows),page=rankedPage(rows);
 useCreate(async requestId=>{const r=await createDraftTask(projectId,draft,page?'optimize-page':'content-outline',page,requestId);if(!r.taskId)throw new Error($t('keywordHandOff.notHandedOffTryAgain'));onDone({...r,title:draft.title});},e=>setError(() => (e instanceof Error?$legacyText(e.message):$t('keywordHandOff.notHandedOffTryAgain'))));
 return <Creating error={error} onClose={onClose}/>;
}
// One draft (an audit issue, AI search questions, ticked rows) handed to the Agent: the task is created with the
// suggested 做法 and its page opens, where it waits for 确定开始执行. `description` is no longer shown.
export function DraftHandOffDialog({projectId,draft,playbookId,page,onClose,onDone}:{projectId:number;draft:TaskDraft;playbookId:string;page?:string;description?:string;onClose:()=>void;onDone:(r:{ok:boolean;text:Message;taskId?:number})=>void}):ReactElement{
 const [error,setError]=useMessageState('');
 useCreate(async requestId=>{const r=await createDraftTask(projectId,draft,playbookId,page,requestId);if(!r.taskId)throw new Error($t('keywordHandOff.notHandedOffTryAgain'));onDone({ok:true,text:() => $t('common.taskCreatedReadClickStart',{0:draft.title}),taskId:r.taskId});},e=>setError(() => (e instanceof Error?$legacyText(e.message):$t('keywordHandOff.notHandedOffTryAgain'))));
 return <Creating error={error} onClose={onClose}/>;
}
