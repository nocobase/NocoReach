import { $t, $tj } from "#i18n";
import {useEffect,useRef,useState,type ReactElement} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '#components/ui/dialog';
import {request} from './strategy/service';
import type {StrategyState} from './strategy/model';
import {marketLabel,metric,type SiteRank} from './keyword-api';
import {INTENT_LABELS,toIntent} from '#components/seo/intent-badge';
// 交给 Agent from 关键词 (SPEC "OpenSEO 数据页面"): the chosen keywords become one task, with 优化现有页面 suggested when
// the site already ranks (that page linked), otherwise 内容选题与大纲.
export type HandOffKeyword={keyword:string;market:{locationCode:number;language:string}|null;volume:number|null;difficulty:number|null;intent:string|null;rank?:SiteRank};
const work=<T,>(projectId:number,taskId:number,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId:String(taskId),...body},unwrap:'data'});
export function keywordDraft(rows:HandOffKeyword[]){
 const head=rows[0].keyword,ranked=rows.filter(r=>r.rank);
 const title=(rows.length===1?$t("围绕「{0}」",{0:head}):$t("围绕「{0}」等 {1} 个关键词",{0:head,1:rows.length}))+(ranked.length?$t("改进现有页面"):$t("写内容"));
 const lines=rows.map(r=>$t("- {0}（{1}）：月搜索量 {2}，难度 {3}，意图 {4}；{5}",{0:r.keyword,1:marketLabel(r.market),2:metric(r.volume),3:metric(r.difficulty),4:INTENT_LABELS[toIntent(r.intent)],5:r.rank?$t("本站近 28 天平均排名 {0}，{1} 次点击，排名页面 {2}",{0:r.rank.position.toFixed(1),1:r.rank.clicks,2:r.rank.page}):$t("本站还没有排名")}));
 const brief=[$t("关键词："),...lines,'',$t("依据：搜索量、难度、意图来自 DataForSEO 的市场估算（不是本站数据）；本站排名来自每天同步的 Search Console。"),$t("建议：用同一篇内容覆盖这些关键词，先确认搜索意图，再决定改哪一页或写什么。")].join('\n');
 return {title:title.slice(0,200),objective:$t("让本站在这些关键词上进入搜索结果前几名：{0}",{0:rows.map(r=>r.keyword).join('、')}).slice(0,1000),brief:brief.slice(0,20000)};
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
 const next=await request<StrategyState>(projectId,'confirmDirection',{...draft,playbookId,revision:state.revision,requestId});
 const taskId=next.proposals.find(p=>!p.insight&&p.taskId&&!state.proposals.some(o=>o.id===p.id))?.taskId;
 if(!taskId)return {started:false};
 if(page){try{const d=await work<{work:{revision:number}}>(projectId,taskId,'get');await work(projectId,taskId,'advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'linkPage',url:page});}catch{/* not in 网站内容: the task still names it */}}
 return {taskId,started:false};
}
export const handOffKeywords=(projectId:number,rows:HandOffKeyword[])=>createDraftTask(projectId,keywordDraft(rows),rankedPage(rows)?'optimize-page':'content-outline',rankedPage(rows));
// While the task is being created (a moment): what happens, or why it did not; the task page then opens.
function Creating({error,onClose}:{error:string;onClose:()=>void}):ReactElement{
 return <Dialog open onOpenChange={o=>{if(!o&&error)onClose();}}><DialogContent className="sm:max-w-sm" showCloseButton={Boolean(error)}>
  <DialogHeader><DialogTitle>{$t("交给 Agent")}</DialogTitle><DialogDescription>{error?$t("任务没有建好。"):$t("正在建任务，建好后打开任务页，你看过再点“确定开始执行”。")}</DialogDescription></DialogHeader>
  {error?<><p role="alert" className="nr-error">{error}</p><DialogFooter><Button variant="outline" onClick={onClose}>{$t("关闭")}</Button></DialogFooter></>:null}
 </DialogContent></Dialog>;
}
// Runs once per hand-off (a second mount in development, or a second click, reuses the same request).
function useCreate(create:(requestId:string)=>Promise<void>,onError:(e:unknown)=>void){const requestId=useRef(crypto.randomUUID()),ran=useRef(false);
 useEffect(()=>{if(ran.current)return;ran.current=true;void create(requestId.current).catch(onError);},[]);}
// 交给 Agent for keywords: the task is created at once and its page opens (no dialog to pick the 做法 any more).
export function KeywordHandOffDialog({projectId,rows,onClose,onDone}:{projectId:number;rows:HandOffKeyword[];onClose:()=>void;onDone:(r:{taskId?:number;started:boolean;title:string})=>void}):ReactElement{
 const [error,setError]=useState(''),draft=keywordDraft(rows),page=rankedPage(rows);
 useCreate(async requestId=>{const r=await createDraftTask(projectId,draft,page?'optimize-page':'content-outline',page,requestId);if(!r.taskId)throw new Error($t("没有交出去，请重试。"));onDone({...r,title:draft.title});},e=>setError(e instanceof Error?e.message:$t("没有交出去，请重试。")));
 return <Creating error={error} onClose={onClose}/>;
}
// One draft (an audit issue, AI search questions, ticked rows) handed to the Agent: the task is created with the
// suggested 做法 and its page opens, where it waits for 确定开始执行. `description` is no longer shown.
export function DraftHandOffDialog({projectId,draft,playbookId,page,onClose,onDone}:{projectId:number;draft:TaskDraft;playbookId:string;page?:string;description?:string;onClose:()=>void;onDone:(r:{ok:boolean;text:string;taskId?:number})=>void}):ReactElement{
 const [error,setError]=useState('');
 useCreate(async requestId=>{const r=await createDraftTask(projectId,draft,playbookId,page,requestId);if(!r.taskId)throw new Error($t("没有交出去，请重试。"));onDone({ok:true,text:$t("已建好任务：{0}。看过后点“确定开始执行”。",{0:draft.title}),taskId:r.taskId});},e=>setError(e instanceof Error?e.message:$t("没有交出去，请重试。")));
 return <Creating error={error} onClose={onClose}/>;
}
