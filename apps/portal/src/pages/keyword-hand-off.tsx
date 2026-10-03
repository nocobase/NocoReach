import {useEffect,useState,type ReactElement} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {request} from './strategy/service';
import type {StrategyState} from './strategy/model';
import {playbookRequest,categoryName,type PlaybookList} from './playbook-model';
import {marketLabel,metric,type SiteRank} from './keyword-api';
import {INTENT_LABELS,toIntent} from '@/components/seo/intent-badge';
// 交给 Agent from 关键词 (SPEC "OpenSEO 数据页面"): the chosen keywords become one task that starts at once with the
// chosen 做法 — 优化现有页面 when the site already ranks (that page linked), otherwise 内容选题与大纲.
export type HandOffKeyword={keyword:string;market:{locationCode:number;language:string}|null;volume:number|null;difficulty:number|null;intent:string|null;rank?:SiteRank};
const work=<T,>(projectId:number,taskId:number,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId:String(taskId),...body},unwrap:'data'});
export function keywordDraft(rows:HandOffKeyword[]){
 const head=rows[0].keyword,ranked=rows.filter(r=>r.rank);
 const title=(rows.length===1?`围绕「${head}」`:`围绕「${head}」等 ${rows.length} 个关键词`)+(ranked.length?'改进现有页面':'写内容');
 const lines=rows.map(r=>`- ${r.keyword}（${marketLabel(r.market)}）：月搜索量 ${metric(r.volume)}，难度 ${metric(r.difficulty)}，意图 ${INTENT_LABELS[toIntent(r.intent)]}；${r.rank?`本站近 28 天平均排名 ${r.rank.position.toFixed(1)}，${r.rank.clicks} 次点击，排名页面 ${r.rank.page}`:'本站还没有排名'}`);
 const brief=['关键词：',...lines,'','依据：搜索量、难度、意图来自 DataForSEO 的市场估算（不是本站数据）；本站排名来自每天同步的 Search Console。','建议：用同一篇内容覆盖这些关键词，先确认搜索意图，再决定改哪一页或写什么。'].join('\n');
 return {title:title.slice(0,200),objective:`让本站在这些关键词上进入搜索结果前几名：${rows.map(r=>r.keyword).join('、')}`.slice(0,1000),brief:brief.slice(0,20000)};
}
// The best ranking page among the keywords, if any (it is linked to the task when it is in 网站内容).
export const rankedPage=(rows:HandOffKeyword[])=>rows.filter(r=>r.rank).sort((a,b)=>b.rank!.clicks-a.rank!.clicks||a.rank!.position-b.rank!.position)[0]?.rank?.page;
export type TaskDraft={title:string;objective:string;brief:string};
// Creates a task from a draft (not from an opportunity) and starts it with the chosen 做法; links the page when it is
// in 网站内容. Shared by 关键词 and 网站审计.
export async function startDraftTask(projectId:number,draft:TaskDraft,playbookId:string,page?:string):Promise<{taskId?:number;started:boolean}>{
 const state=await request<StrategyState>(projectId,'state');
 const next=await request<StrategyState>(projectId,'confirmDirection',{...draft,revision:state.revision,requestId:crypto.randomUUID()});
 const taskId=next.proposals.find(p=>!p.insight&&p.taskId&&!state.proposals.some(o=>o.id===p.id))?.taskId;
 if(!taskId)return {started:false};
 try{
  if(page){try{const d=await work<{work:{revision:number}}>(projectId,taskId,'get');await work(projectId,taskId,'advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'linkPage',url:page});}catch{/* not in 网站内容: the task still names it */}}
  const d=await work<{work:{revision:number}}>(projectId,taskId,'get');
  await work(projectId,taskId,'advance',{revision:d.work.revision,requestId:crypto.randomUUID(),command:'startTask',playbookId});
  return {taskId,started:true};}
 catch{return {taskId,started:false};}
}
export const handOffKeywords=(projectId:number,rows:HandOffKeyword[],playbookId:string)=>startDraftTask(projectId,keywordDraft(rows),playbookId,rankedPage(rows));
export function KeywordHandOffDialog({projectId,rows,onClose,onDone}:{projectId:number;rows:HandOffKeyword[];onClose:()=>void;onDone:(r:{taskId?:number;started:boolean;title:string})=>void}):ReactElement{
 const [list,setList]=useState<PlaybookList>(),[playbookId,setPlaybookId]=useState(rankedPage(rows)?'optimize-page':'content-outline'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setList).catch(()=>setError('做法没有读出来，请重试。'));},[projectId]);
 const page=rankedPage(rows),draft=keywordDraft(rows);
 const go=async()=>{setBusy(true);setError('');try{const r=await handOffKeywords(projectId,rows,playbookId);onDone({...r,title:draft.title});}catch(e){setError(e instanceof Error?e.message:'没有交出去，请重试。');}finally{setBusy(false);}};
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle>交给 Agent</DialogTitle><DialogDescription>{rows.length===1?'这个关键词':`这 ${rows.length} 个关键词`}合成一个任务，确认后立即开始。</DialogDescription></DialogHeader>
  <div className="space-y-3 text-sm">
   <p className="font-medium">{draft.title}</p>
   <ul className="max-h-40 space-y-1 overflow-y-auto text-muted-foreground">{rows.map(r=><li key={r.keyword+marketLabel(r.market)}>{r.keyword}<span className="ml-2 text-xs">{r.rank?`本站排名 ${r.rank.position.toFixed(1)}`:'本站还没有排名'}</span></li>)}</ul>
   <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">做法</span>
    <Select value={playbookId} onValueChange={v=>v&&setPlaybookId(String(v))}><SelectTrigger className="w-full" aria-label="做法"><SelectValue>{(v:string)=>list?.playbooks.find(p=>p.id===v)?.name||'…'}</SelectValue></SelectTrigger>
     <SelectContent>{(list?.playbooks||[]).map(p=><SelectItem key={p.id} value={p.id}>{p.name}<span className="ml-2 text-xs text-muted-foreground">{categoryName(p.category)}</span></SelectItem>)}</SelectContent></Select></label>
   {page&&<p className="text-xs text-muted-foreground">关联页面：{page}（本站排得最好的一页）</p>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy||!list} onClick={()=>void go()}>{busy?'正在交给 Agent…':'交给 Agent'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
// One draft (an audit issue, AI search questions) handed to the Agent: pick the 做法 and the task starts at once.
export function DraftHandOffDialog({projectId,draft,playbookId:initial,page,description,onClose,onDone}:{projectId:number;draft:TaskDraft;playbookId:string;page?:string;description:string;onClose:()=>void;onDone:(r:{ok:boolean;text:string;taskId?:number})=>void}):ReactElement{
 const [list,setList]=useState<PlaybookList>(),[playbookId,setPlaybookId]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setList).catch(()=>setError('做法没有读出来，请重试。'));},[projectId]);
 const go=async()=>{setBusy(true);setError('');try{const r=await startDraftTask(projectId,draft,playbookId,page);onDone(r.started?{ok:true,text:`已交给 Agent：${draft.title}`,taskId:r.taskId}:{ok:false,text:`任务已建好，但没能开始：${draft.title}。到任务页点“开始”即可。`,taskId:r.taskId});}catch(e){setError(e instanceof Error?e.message:'没有交出去，请重试。');setBusy(false);}};
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle>交给 Agent</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
  <p className="text-sm font-medium">{draft.title}</p>
  <label className="block space-y-1.5 text-sm"><span className="text-xs text-muted-foreground">做法</span>
   <Select value={playbookId} onValueChange={v=>v&&setPlaybookId(String(v))}><SelectTrigger className="w-full" aria-label="做法"><SelectValue>{(v:string)=>list?.playbooks.find(p=>p.id===v)?.name||'…'}</SelectValue></SelectTrigger>
    <SelectContent>{(list?.playbooks||[]).map(p=><SelectItem key={p.id} value={p.id}>{p.name}<span className="ml-2 text-xs text-muted-foreground">{categoryName(p.category)}</span></SelectItem>)}</SelectContent></Select></label>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy||!list} onClick={()=>void go()}>{busy?'正在交给 Agent…':'交给 Agent'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
