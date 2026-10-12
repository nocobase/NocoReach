import { localizeWorkSnapshots } from './playbook-snapshot';
import { reportDate } from './task-detail/material-notices.js';
import { TaskExecutionPanel } from './task-detail/execution-panel.js';
import { TaskAgentField } from './task-detail/agent-field';
import { hasTaskAgent } from './task-execution-types';
import { useMessageState, getCurrentLocale, $t, $tj } from "#i18n";
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Lock,Archive,ArchiveRestore,Ban,Play,Bot,Check,RotateCcw,AlertCircle,Link2,UserRound,Rocket,Pencil,ArrowRightLeft,Move,FileText,GitPullRequest,GitMerge,Globe,Eye,Search,ExternalLink,Users,Square,Undo2} from 'lucide-react';
import {ActorAvatar} from '#components/reach/actor';
import {Tag,stateToneOf} from '#components/reach/tag';
import {Button} from '#components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem} from '#components/ui/dropdown-menu';
import {ReachDetailLayout} from '#components/reach-detail-layout';
import {useUnsavedWarning} from './reach-data';
import {DocView,DocReader} from './doc-view';
import {ChangeView} from './change-view';
import {effectItems,effectLine,effectPages,latestEffect,type EffectResult} from './effect-model';
import {getWorkColumns,workState,closeCommand,canReopen,closedWhen,getCloseConfirm,closedLabel,type TaskData as Data,type Work,type Artifact,type PullRequestInfo} from './task-execution-types';
import {playbookRequest,localizePlaybookList,getCategories,categoryName,getStageExecutor,stageName as displayStageName,stagesFor,producesOutput,readsOnly,withoutRepo,eventText,type PlaybookList,type Stage} from './playbook-model';
import './strategy/strategy.css';
import './reach-workspace.css';
import './task-execution.css';
import './task-detail.css';
import {confirmAction} from '#components/reach/confirm';
import {WithInfo} from '#components/reach/info-tip';
import {help} from './glossary';
import {useMe} from './me';
import {StepChips} from '#components/reach/step-chips';
import {parseReplies,ReplyDrafts,REPLY_PLAYBOOK} from './reply-drafts';
// 起草社区回复: the drafts as cards with 复制回复 (reply-drafts.tsx); other documents as text.
const repliesOf=(w:Work,content?:string)=>(w.playbook?.id===REPLY_PLAYBOOK||w.flow?.id===REPLY_PLAYBOOK)&&content?parseReplies(content):[];
// Whether you can do this task's steps (2026-10-08): its owner and 管理员 can; other members read it and leave a message.
const TaskAccess=createContext<{allowed:boolean;self:boolean;owner:string}>({allowed:true,self:true,owner:''});
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
type Signal={key:string;source:string;title:string;facts:string[]};
type Member={id:string;name:string};
type Run=Data['runs'][number];
const getSourceNames = (): Record<string,string> => ({gsc:'Search Console',ga4:'GA4',site:$t("网站内容"),github:'GitHub','github-traffic':'GitHub Traffic',discourse:$t("社区论坛"),packages:$t("下载量"),hackernews:'Hacker News',reddit:'Reddit',trends:'Google Trends',competitors:$t("竞品动态"),x:'X','discord-slack':'Discord、Slack',discord:'Discord',slack:'Slack',rank:$t("排名跟踪"),'ai-search':$t("AI 搜索")});
const getRunErrors = (): Record<string,string> => ({provider_failed_or_unknown:$t("在线 AI 没有返回结果"),interrupted_or_unknown:$t("运行中断，结果未知"),context_changed:$t("任务内容在运行前已变化"),cancelled:$t("已停止，请检查此前已推送的改动或外部操作"),no_changes:$t("Agent 没有修改任何文件"),no_repo:$t("还没有接入网站源码仓库，不能修改"),revert_failed:$t("回退 PR 没有开出来"),agent_failed:$t("执行没有完成，详情见执行记录"),replaced_by_manual:$t("已改为由你完成")});
const call=<T,>(projectId:number,taskId:string,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId,...body},unwrap:'data'});
// Tasks run by a playbook (new tasks, and tasks started with a flow) use this page; older step-plan tasks keep theirs.
export function isPlaybookTask(d:Data){const w=d.work;return Boolean(w.playbook||w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const when=(iso?:string)=>iso&&!Number.isNaN(Date.parse(iso))?new Date(iso).toLocaleString(getCurrentLocale(),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const active=(r:Run)=>r.status==='queued'||r.status==='running';
function took(r:Run){if(!r.endedAt)return '';const s=Math.max(0,Math.round((Date.parse(r.endedAt)-Date.parse(r.createdAt))/1000));return s<60?$t("{0} 秒",{0:s}):$t("{0} 分 {1} 秒",{0:Math.floor(s/60),1:s%60});}
function since(iso:string){const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000));return Number.isNaN(m)||m<1?$t("不到 1 分钟"):$t("{0} 分钟",{0:m});}
const runnerOf=(r:Run)=>r.agentName||(r.executorKind==='runner'?$t("Agent"):$t("在线 AI"));
const pathOf=(u:string)=>{try{const x=new URL(u);return x.pathname+x.search;}catch{return u;}};
const PageLinks=({pages}:{pages:string[]})=>pages.length?<ul className="nr-td-live-pages">{pages.map(u=><li key={u}><a className="nr-link" href={u} target="_blank" rel="noreferrer">{pathOf(u)}<ExternalLink aria-hidden="true"/></a></li>)}</ul>:null;
// Task page (SPEC §6, after NocoProject's issue detail): what waits for you, evidence, outputs and activity on the left;
// properties, progress, linked page and runs on the right.
export function TaskDetail({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 const navigate=useNavigate();const [storedData,setStoredData]=useState<Data>(initial),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[dirty,setDirty]=useState(false),[members,setMembers]=useState<Member[]>([]);
 const data={...storedData,work:localizeWorkSnapshots(storedData.work)};
 const list=localizePlaybookList(rawPlaybooks);
 const pending=useRef(false),op=useRef({key:'',id:''});useUnsavedWarning(dirty);
 const w=data.work,runActive=data.runs.some(active);
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setRawPlaybooks).catch(()=>undefined);void call<Member[]>(projectId,taskId,'members').then(m=>setMembers(Array.isArray(m)?m:[])).catch(()=>undefined);},[projectId]);
 useEffect(()=>{if(!runActive)return;const t=setInterval(()=>{if(!pending.current)void call<Data>(projectId,taskId,'get').then(next=>{setStoredData(next);setError('');}).catch(()=>setError(() => ($t('暂时无法读取运行状态，请稍后重试。'))));},2500);return()=>clearInterval(t);},[runActive, projectId, taskId, setError]);
 const update:Update=async(command,body={})=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');const key=JSON.stringify([data.work.revision,command,body]);if(op.current.key!==key)op.current={key,id:crypto.randomUUID()};
  try{const d=await call<Data>(projectId,taskId,'advance',{revision:data.work.revision,requestId:op.current.id,command,...body});setStoredData(d);refreshNavBadges();setDirty(false);return d;}catch(e){setError(() => (e instanceof Error?$t(e.message):$t("操作没有完成，请重试。")));}finally{pending.current=false;setBusy(false);}};
 const stages:Stage[]=w.flow?.stages||[],index=w.stageIndex||0,stage=stages[index],started=Boolean(w.flow),done=w.stage==='done';
 // Every task is run by the Agent; tasks started before then may still run online AI steps.
 const executor=stages.some(s=>s.kind==='ai')&&!stages.some(s=>s.kind==='agent')?$t("在线 AI"):$t("Agent"),state=workState(w);
 const runs=[...data.runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),live=runs.find(active);
 const {me,can}=useMe(),creator=(data.task.evidence as {createdBy?:{id?:string;name?:string}}|undefined)?.createdBy,ownerId=w.humanOwnerId||creator?.id;
 const access={allowed:can(ownerId),self:!ownerId||!me?.id||String(ownerId)===me.id,owner:w.humanOwnerName||creator?.name||$t("负责人")};
 return <TaskAccess.Provider value={access}><div className="nr-app nr-task-page">
  <ReachDetailLayout asideLabel={$t("任务属性")} main={<div className="nr-td-main">
   <header className="nr-td-head">
    <nav className="nr-td-crumbs" aria-label={$t("位置")}><button type="button" onClick={async()=>{if(!dirty||(await confirmAction({title:() => ($t("放弃未保存的内容？")),description:() => ($t("返回任务列表，没保存的内容会丢失。")),action:'放弃并返回'})))navigate('/actions');}}>{$t("任务")}</button><span>/</span><span>{data.task.title}</span></nav>
    <div className="nr-td-titlebar"><div className="min-w-0"><h1>{(data.task.evidence as {no?:number}|undefined)?.no?<span className="mr-2 font-mono text-base font-normal text-muted-foreground">T-{(data.task.evidence as {no:number}).no}</span>:null}{data.task.title}</h1>
     {(()=>{const o=(data.task.evidence as {insight?:{id?:string;no?:number}}|undefined)?.insight;return o?.id&&<button type="button" className="nr-link text-xs" onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(o.id!)}`)}>{$tj("来自 {0}",{0:o.no?`O-${o.no}`:$t("机会")})}</button>;})()}</div><div className="nr-td-head-actions">
     {!access.allowed?null:canReopen(w)?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void update('unarchiveTask')}><ArchiveRestore/>{$t("重新打开")}</Button>
      :(()=>{const cmd=closeCommand(w);return cmd&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(cmd==='archiveTask'||(await confirmAction({title:() => ($t("关闭任务“{0}”？",{0:data.task.title})),description:() => (getCloseConfirm()),action:'关闭任务'})))void update(cmd);}}><Archive/>{$t("关闭任务")}</Button>;})()}
    </div></div>
    <p className="nr-td-meta">{closedLabel(w)?<Tag tone="slate" dot>{closedLabel(w)}</Tag>:<Tag tone={stateToneOf(state)} dot>{getWorkColumns()[state]}</Tag>}{started&&<Tag tone="grey">{w.playbook?.name||w.flow?.name||""}</Tag>}{started&&<span>{executor}</span>}{live&&<span className="nr-live max-w-full break-words">{$tj("● {0} 正在{1}，已进行 {2}",{0:runnerOf(live),1:stage?.name||$t("执行"),2:since(live.createdAt)})}</span>}</p>
   </header>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   {w.cancelledAt||w.archivedAt?<ClosedCard w={w}/>:!started?<StartCard data={data} list={list} update={update} busy={busy}/>:done?<DoneCard w={w} canRevert={Boolean(data.agent?.repo)} update={update} busy={busy}/>:<CurrentCard key={`${index}:${stage?.key}`} data={data} update={update} busy={busy} runActive={runActive} list={list} onDirty={setDirty}/>}
   <TaskExecutionPanel projectId={projectId} taskId={taskId} runs={runs}/>
   <EvidenceCard data={data} showBrief={started}/>
   <OutputsCard data={data}/>
   <ActivityCard data={data} update={update} busy={busy} executor={started?executor:$t("执行者")} members={members} onDirty={setDirty}/>
  </div>} aside={<Aside data={data} list={list} projectId={projectId} taskId={taskId} busy={busy} runActive={runActive} members={members} runs={runs} update={update}/>}/>
 </div></TaskAccess.Provider>;
}
// The one thing that waits for you: a card with a coloured edge, one sentence, the content and the actions under it.
// The card of the task's current step (2026-10-08, as NocoProject's “Waiting for you”, user: no coloured bar on the
// left): a small section heading outside (等你处理, 当前进度, 已完成…), then a plain card — the step's icon, title, one
// sentence and time, its content, and the buttons right under it (the main one filled and first).
function Await({icon,title,sub,at,children,actions,tone='attention',label=$t("等你处理")}:{icon:ReactNode;title:string;sub?:ReactNode;at?:string;children?:ReactNode;actions?:ReactNode;tone?:'attention'|'live'|'done'|'error'|'closed';label?:string}){
 const access=useContext(TaskAccess);
 return <section className="nr-td-await" data-tone={tone} aria-label={label}>
  <h2 className="nr-td-await-heading">{label}</h2>
  <div className="nr-td-await-body"><header><span className="nr-td-await-icon" aria-hidden="true">{icon}</span><div className="nr-td-await-title"><h3>{title}</h3>{sub&&<p className="nr-td-sub">{sub}</p>}</div>{at&&<time>{when(at)}</time>}</header>{children}
   {actions&&(access.allowed?<div className="nr-td-await-actions">{actions}</div>:<p className="nr-td-await-locked" data-locked=""><Lock aria-hidden="true"/>{$t("由 {0} 把关，你可以在下面留言",{0:access.owner})}</p>)}</div>
 </section>;
}
// Before a task starts (2026-10-08 user decision: 交给 Agent only creates the task): what the Agent will get, the 做法
// (the one suggested at hand-off preselected) and a note; nothing runs until 确定开始执行.
function StartCard({data,list,update,busy}:{data:Data;list?:PlaybookList;update:Update;busy:boolean}){
 const [id,setId]=useState(data.work.playbookId||data.playbookDefault||'optimize-page'),[note,setNote]=useState(''),[reading,setReading]=useState(false),{allowed,self,owner}=useContext(TaskAccess);
 const p=list?.playbooks.find(x=>x.id===id),handoff=(data.task.evidence?.handoff as {playbook?:string;content?:string}|undefined),brief=handoff?.content||data.task.brief||'',briefTitle=handoff?.content?$t("“{0}”交付的文档",{0:handoff.playbook}):$t("Agent 会收到的任务说明");
 return <Await icon={<Play/>} title={$t("确认后开始")} sub={handoff?$t("这个任务由“{0}”交接而来，它交付的文档就是任务说明。Agent 还没有开始，看过再开始。",{0:handoff.playbook}):$t("Agent 还没有开始。看过任务说明、选好做法再开始；不需要就关闭任务。")}
  actions={<Button disabled={busy||!p||!hasTaskAgent(data)} onClick={()=>void update('startTask',{playbookId:id,note})}>{$t("确定开始执行")}</Button>}>
  {brief&&<div className="nr-td-start-field" data-start-brief=""><span>{briefTitle}</span><div className="nr-td-start-brief"><p>{brief.replace(/[#*>`_]/g,'').replace(/^[ \t]+/gm,'').replace(/\n{2,}/g,'\n').trim().slice(0,600)}</p></div><button type="button" className="nr-link self-start text-xs" onClick={()=>setReading(true)}>{$t("查看全文")}</button><DocReader open={reading} onClose={()=>setReading(false)} title={briefTitle} content={brief}/></div>}
  <TaskAgentField data={data} busy={busy} lockedReason={!allowed?$t("只有负责人和管理员能更换"):undefined} onChange={async agentId=>Boolean(await update('setAgent',{agentId}))}/>
  <div className="nr-td-start-grid">
   <label className="nr-td-start-field"><span>{$t("做法")}</span><select aria-label={$t("做法")} value={id} disabled={busy||!list||!allowed} onChange={e=>setId(e.target.value)}>
    {getCategories().map(([k,label])=><optgroup key={k} label={label}>{(list?.playbooks||[]).filter(x=>x.category===k).map(x=><option key={x.id} value={x.id}>{x.name}{x.id===data.playbookDefault?$t("（推荐）"):''}</option>)}</optgroup>)}
   </select>
    {p&&<><small>{p.description}{p.description?' ':''}{$tj("由Agent 执行，{0}。",{0:p.kind==='build'?$t("改好后你看过效果再发布"):$t("写好文档由你审核")})}</small>
     <StepChips stages={stagesFor(p)} owner={self?null:owner}/></>}
   </label>
   <label className="nr-td-start-field"><span>{$t("补充说明（可选）")}</span><textarea aria-label={$t("补充说明")} rows={3} value={note} disabled={busy||!allowed} placeholder={$t("例如：只改英文版；语气保持技术文档风格")} onChange={e=>setNote(e.target.value)}/></label>
  </div>
 </Await>;
}
const focusComposer=()=>{const el=document.getElementById('nr-composer') as HTMLTextAreaElement|null;el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus();};
function PrCard({pr,compact=false}:{pr:PullRequestInfo;compact?:boolean}){
 const add=pr.files.reduce((n,f)=>n+f.additions,0),del=pr.files.reduce((n,f)=>n+f.deletions,0);
 return <div className="nr-td-pr"><div className="nr-td-pr-head"><GitPullRequest aria-hidden="true"/><a className="nr-link" href={pr.url} target="_blank" rel="noreferrer">{$t("在 GitHub 查看改动")}</a><code>#{pr.number}</code></div>
  <dl><div><dt>{$t("改动")}</dt><dd><span className="nr-add">+{add}</span> <span className="nr-del">−{del}</span>  {$tj("· {0} 个文件",{0:pr.files.length})}</dd></div><div><dt>{$t("分支")}</dt><dd><code>{pr.branch}</code>{pr.headSha?` · ${pr.headSha.slice(0,7)}`:''}</dd></div>{pr.checks&&<div><dt>{$t("检查")}</dt><dd className={pr.checks.ok?'nr-check-ok':'nr-error'}>{pr.checks.summary}</dd></div>}</dl>
  {!compact&&<ul className="nr-pr-files">{pr.files.slice(0,12).map(f=><li key={f.path}><code>{f.path}</code><span>+{f.additions} −{f.deletions}</span></li>)}{pr.files.length>12&&<li>{$tj("还有 {0} 个文件",{0:pr.files.length-12})}</li>}</ul>}</div>;
}

function CurrentCard({data,update,busy,runActive,list,onDirty}:{data:Data;update:Update;busy:boolean;runActive:boolean;list?:PlaybookList;onDirty:(v:boolean)=>void}){
 const w=data.work,stages=w.flow!.stages,index=w.stageIndex||0,stage=stages[index];
 const navigate=useNavigate();const [manual,setManual]=useState(false),[scopeOk,setScopeOk]=useState(false);
 const [checked,setChecked]=useState<string[]>([]),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[record,setRecord]=useState(''),[note,setNote]=useState(''),[url,setUrl]=useState('');
 const last=stages.slice(index+1).every(s=>s.kind==='observe'),nextOptions=w.playbook?.kind==='plan'&&last?w.playbook.next:[];
 const [next,setNext]=useState(nextOptions[0]||''),[showNote,setShowNote]=useState(false),[relNote,setRelNote]=useState(w.results[index-1]?.pr?.release||'');
 useEffect(()=>{setChecked([]);setEditing(false);setRecord('');onDirty(false);},[stage.key,index]);
 const act=(command:string,body:object)=>update(command,{stageKey:stage.key,...body});
 const name=(id:string)=>list?.playbooks.find(p=>p.id===id)?.name||id;
 const cur=data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
 if(stage.kind==='ai'){
  if(runActive)return <Await tone="live" label={$t("当前进度")} icon={<Bot/>} title={$t("在线 AI 正在{0}",{0:stage.name})} sub={$t("完成后等你审核，通常一两分钟。")}/>;
  return <Await icon={<Bot/>} title={displayStageName(stage)} sub={cur?.status==='failed'?<span className="nr-error">{$tj("上次运行没有完成：{0}。已有内容不受影响。",{0:getRunErrors()[cur.error||'']||cur.error||$t("原因未知")})}</span>:$t("这一步由在线 AI 完成，尚未开始。")}
   actions={<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?$t("重试"):$t("开始")}</Button>}/>;
 }
 if(stage.kind==='review'&&stages[index+1]?.kind==='release'){
  const out=w.results[index-1],pr=out?.pr;
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t("没有可以看的改动，请刷新后重试。")}/>;
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(pr?.outOfScope?.length&&!scopeOk);
  return <Await icon={<Eye/>} title={displayStageName(stage)} at={out.createdAt} sub={pr?$t("Agent 改了 {0} 个文件。看过改动后点发布，或在下方写意见让它重改。",{0:pr.files.length}):$t("这是你自己完成的改动。确认发布后，上线了由你确认。")}
   actions={<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,release:{note:relNote},...(pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}><Rocket/>{$t("发布")}</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>{$t("要求修改")}</Button>
    <span className="nr-td-push nr-td-release-hint">{pr?$t("将合并 PR #{0}（你看过的版本）",{0:pr.number}):$t("不需要合并")} · <button type="button" className="nr-link" onClick={()=>setShowNote(v=>!v)}>{showNote?$t("收起发布说明"):$t("发布说明")}</button></span></>}>
   {pr?.previewUrl&&<a className="nr-td-preview" href={pr.previewUrl} target="_blank" rel="noreferrer"><Globe aria-hidden="true"/>{$t("打开预览页面")}<ExternalLink aria-hidden="true"/></a>}
   {pr?.release&&<div className="nr-td-what"><b>{$t("改了什么")}</b><p>{pr.release}</p></div>}
   {pr?.changes?.length?<ChangeView changes={pr.changes}/>:<DocView content={out.content} title={$t("改动说明")} meta={$t("第 {0} 版",{0:out.version})}/>}
   {pr&&<PrCard pr={pr} compact={Boolean(pr.changes?.length)}/>}
   {pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/>  {$tj("超出允许范围：{0}。我已看过，确认这些改动没有问题",{0:pr.outOfScope.join('、')})}</label>:null}
   {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>{$t("确认以下事项")}</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':$t("（可选）")}</label>)}</fieldset>}
   {showNote&&<label className="nr-field">{$t("发布说明（写进发布记录，可以修改）")}<textarea aria-label={$t("发布说明")} rows={3} value={relNote} disabled={busy} placeholder={$t("一两句话说明这次改了什么")} onChange={e=>{setRelNote(e.target.value);onDirty(true);}}/></label>}
  </Await>;
 }
 if(stage.kind==='release'){
  const r=w.release,queued=cur?.status==='queued';
  if(!r)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t("没有要发布的内容，请刷新后重试。")}/>;
  const mark=<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>void act('markMerged',{})}>{$t("我已在 GitHub 合并")}</Button>;
  if(r.state==='merging')return <Await tone="live" label={$t("当前进度")} icon={<GitMerge/>} title={$t("Agent 正在合并 PR #{0}",{0:r.pr?.number})} sub={queued&&!data.agent?.online?<>{$t("等待 Runner：当前没有可用 Runner，连接后会自动合并。")}<Button variant="link" onClick={()=>navigate('/runtimes')}>{$t("查看 Runner")}</Button></>:$t("只合并你看过的那次提交，合并后自动核实上线。")} actions={queued?mark:undefined}/>;
  if(r.state==='merge_failed')return <Await tone="error" icon={<AlertCircle/>} title={$t("没有合并成功")} sub={r.error||$t("合并没有完成")} actions={<><Button disabled={busy} onClick={()=>void act('retryMerge',{})}>{$t("重新合并")}</Button>{mark}</>}><PageLinks pages={[]}/></Await>;
  const live=<Button variant={r.state==='verifying'?'ghost':'default'} className={r.state==='verifying'?'nr-td-push':''} disabled={busy} onClick={()=>void act('confirmLive',{})}>{$t("我确认已上线")}</Button>;
  if(r.state==='verifying')return <Await tone="live" label={$t("当前进度")} icon={<Globe/>} title={$t("已合并，等待上线")} sub={$t("每 30 分钟打开一次线上页面，找“{0}”。{1}看到后自动开始观察效果。",{0:r.verifyText,1:r.lastCheckAt?$t("最近一次 {0}，还没看到。",{0:when(r.lastCheckAt)}):''})} actions={live}><PageLinks pages={r.pages}/></Await>;
  const [title,sub]=r.reason==='manual'?[$t("等你确认上线"),$t("这是你自己完成的改动。上线后点确认，之后开始观察效果。")]:r.reason==='cannot_verify'?[$t("已合并，等你确认上线"),$t("这次改动没有可以在网页上核对的文字，没法自动核实。上线后点确认。")]:[$t("24 小时还没在线上看到改动"),$t("可能部署还没完成，或者这个仓库不会自动部署到网站（例如测试仓库）。")];
  return <Await icon={<Globe/>} title={title} sub={sub} actions={<>{live}{!r.reason&&<Button variant="outline" disabled={busy} onClick={()=>void act('waitLonger',{})}>{$t("再等 24 小时")}</Button>}</>}><PageLinks pages={r.pages}/></Await>;
 }
 if(stage.kind==='review'){
  const producer=stages[index-1],out=w.results[index-1];
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(out?.pr?.outOfScope?.length&&!scopeOk);
  const label=nextOptions.length&&next?$t("接受，交给Agent“{0}”",{0:name(next)}):stages[index+1]?.kind==='agent'?$t("通过，交给{0}",{0:getStageExecutor().agent}):stages[index+1]?.kind==='publish'?$t("通过，去发布"):$t("接受");
  const by=$t("{0}{1} · 第 {2} 版",{0:getStageExecutor()[producer.kind],1:out?.manual?$t("（你记录的）"):'',2:out?.version});
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t("没有可审核的内容，请刷新后重试。")}/>;
  return <Await icon={out.pr?<GitPullRequest/>:<FileText/>} title={displayStageName(stage)} at={out.createdAt} sub={out.pr?$t("{0}改好了并开了 PR。看过改动后通过，或在下方写意见让它重做。",{0:getStageExecutor()[producer.kind]}):$t("{0}。看完后通过，或写意见让它重做。",{0:by})}
   actions={editing?<><Button disabled={busy||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft}).then(d=>{if(d)setEditing(false);})}>{$t("保存修改")}</Button><Button variant="ghost" onClick={()=>{setEditing(false);onDirty(false);}}>{$t("取消")}</Button></>
    :<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,...(nextOptions.length&&next?{next}:{}),...(out.pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}>{label}</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>{$t("要求修改")}</Button><Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>{setDraft(out.content);setEditing(true);}}><Pencil/>{$t("直接编辑")}</Button></>}>
   {editing?<textarea className="nr-stage-edit" aria-label={$t("编辑内容")} rows={18} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);onDirty(true);}}/>:<>
    {out.pr&&<PrCard pr={out.pr}/>}
    {out.pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/>  {$tj("超出允许范围：{0}。我已看过，确认这些改动没有问题",{0:out.pr.outOfScope.join('、')})}</label>:null}
    {(()=>{const r=repliesOf(w,out.content);return r.length?<ReplyDrafts items={r}/>:<DocView content={out.content} title={producer.name} meta={by}/>;})()}
    {out.report&&<div className="flex flex-col gap-2 text-sm"><h4 className="font-medium">{$t('资料与未确认事项')}</h4><p>{reportDate(out.report.asOf)}</p>{out.report.sources.map((source,i)=><a key={i} className="underline break-all" href={source.url} target="_blank" rel="noreferrer">{source.title||source.url}</a>)}{out.report.uncertainties.map((note,i)=><p key={i}>{note}</p>)}</div>}
    {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>{$t("确认以下事项")}</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':$t("（可选）")}</label>)}</fieldset>}
    {nextOptions.length>0&&<label className="nr-inline-field nr-next-field">{$t("接着做")}<select aria-label={$t("接着做")} value={next} disabled={busy} onChange={e=>setNext(e.target.value)}>{nextOptions.map(id=><option key={id} value={id}>{name(id)}</option>)}<option value="">{$t("不接着做")}</option></select></label>}
   </>}
  </Await>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  const agent=data.agent,isActive=cur&&active(cur),canRun=Boolean(agent?.repo)||withoutRepo(stage,stages);
  const actions=!manual?<>
   {cur?.status!=='running'&&cur?.status!=='queued'&&canRun&&<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?$t("重试"):$t("交给Agent")}</Button>}
   {isActive&&<Button variant="outline" disabled={busy||Boolean(cur.cancelRequested)} onClick={async()=>{if(await confirmAction({title:() => ($t('停止任务“{0}”的本次运行？',{0:data.task.title})),description:() => ($t('停止不会撤销已经推送的改动或外部操作。')),action:'停止'}))void update('cancelRun',{runId:cur.id});}}><Square/>{$t("停止")}</Button>}
   {cur?.status!=='running'&&<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>setManual(true)}>{$t("我自己完成")}</Button>}
  </>:<><Button disabled={busy||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>{$t("记录并继续")}</Button><Button variant="ghost" onClick={()=>{setManual(false);onDirty(false);}}>{$t("取消")}</Button></>;
  const body=<>{manual&&<label className="nr-field">{readsOnly(stage)?(stage.mode==='analyze'?$t("分析结果"):$t("方案")):$t("修改记录")}<textarea aria-label={readsOnly(stage)?(stage.mode==='analyze'?$t("分析结果"):$t("方案")):$t("修改记录")} rows={4} value={record} disabled={busy} placeholder={readsOnly(stage)?(stage.mode==='analyze'?$t("写下分析结果"):$t("要改哪些文件和段落、改成什么")):$t("PR 链接，或改了哪些文件、哪些内容")} onChange={e=>{setRecord(e.target.value);onDirty(Boolean(e.target.value));}}/></label>}

   {approved&&source&&<DocView content={approved.content} title={$t("已通过的{0}",{0:source.name})} meta={$t("第 {0} 版",{0:approved.version})}/>}</>;
  if(!canRun)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={<>{$t("还没有接入网站源码仓库，Agent 不知道去哪里修改。")}<Button variant="link" onClick={()=>navigate('/connections?source=repo')}>{$t("去数据接入")}</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='queued')return <Await tone="live" label={$t("当前进度")} icon={<Bot/>} title={$t("Agent：{0}",{0:stage.name})} sub={agent?.online?$t("已交给Agent，马上开始。"):<>{$t("等待 Runner：当前没有可用 Runner，连接后会自动开始。")}<Button variant="link" onClick={()=>navigate('/runtimes')}>{$t("查看 Runner")}</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='running')return <Await tone="live" label={$t("当前进度")} icon={<Bot/>} title={$t("Agent 正在{0}{1}",{0:stage.name,1:cur.cancelRequested?$t("（正在停止）"):''})} sub={$t("已进行 {0}，正在做的事：",{0:since(cur.createdAt)})} actions={actions}>{body}</Await>;
  if(cur?.status==='failed')return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t("上次运行：{0}。可以重试，或者自己完成。",{0:(cur.errorDetail ? $t(cur.errorDetail) : '')||getRunErrors()[cur.error||'']||$t("没有完成")})} actions={actions}>{body}</Await>;
  return <Await icon={<Bot/>} title={displayStageName(stage)} sub={$t("这一步由Agent 完成：{0}",{0:stage.instruction})} actions={actions}>{body}</Await>;
 }
 return <Await icon={<Rocket/>} title={$t("确认发布")} sub={$t("PR 审核已通过。合并并上线后点确认，之后开始观察效果。")}
  actions={<Button disabled={busy||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>{$t("确认已发布")}</Button>}>
  <label className="nr-field">{$t("发布后的页面（可选）")}<input aria-label={$t("发布后的页面")} value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label>
  <label className="nr-field">{$t("发布说明")}<textarea aria-label={$t("发布说明")} rows={3} value={note} disabled={busy} placeholder={$t("合并了哪个 PR、何时上线")} onChange={e=>setNote(e.target.value)}/></label>
 </Await>;
}
// A cancelled or archived task: what happened, and the open PR's fate.
function ClosedCard({w}:{w:Work}){
 const pr=w.prClose,prLine=pr?{closing:$t("PR #{0} 等Agent 关闭（分支保留）",{0:pr.number}),closed:$t("PR #{0} 已关闭，分支保留",{0:pr.number}),failed:$t("PR #{0} 没有关闭：{1}，可以在 GitHub 上关闭",{0:pr.number,1:pr.error||$t("原因未知")})}[pr.state]:'';
 const at=w.cancelledAt||w.archivedAt;
 return <Await tone="closed" label={$t("已关闭")} icon={w.cancelledAt?<Ban/>:<Archive/>} title={$t("已关闭 · {0}",{0:closedWhen(w)})} sub={`${at?$t("{0} 关闭。",{0:when(at)}):''}${canReopen(w)?$t("需要时可以点“重新打开”。"):$t("做到一半停下的任务不能接着做；要做的话，从机会页重新交给 Agent。")}`}>{prLine&&<p className="nr-td-text">{prLine}</p>}</Await>;
}
function DoneCard({w,canRevert,update,busy}:{w:Work;canRevert:boolean;update:Update;busy:boolean}){
 const r=w.release;
 if(r?.state==='live')return <Await tone="done" label={$t("已完成")} icon={<Check/>} title={$t("已上线")} sub={$t("{0} {1}。第 7、28 天自动和上线前对比，结果在右侧“效果观察”。",{0:when(r.liveAt),1:(w.history||[]).some(e=>e.action==='live'&&e.actor==='system')?$t("在线上看到了改动"):$t("确认已上线")})}
  actions={r.pr&&r.mergedAt&&canRevert&&(!w.revert||w.revert.state==='failed')?<Button variant="outline" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t("撤回 PR #{0} 的改动？",{0:r.pr!.number})),description:() => ($t("Agent 会开一个回退 PR，你在 GitHub 合并后网站恢复原样。")),action:'撤回改动'}))void update('revertRelease');}}><Undo2/>{w.revert?$t("重新开回退 PR"):$t("撤回这次改动")}</Button>:undefined}>
  {w.revert&&<p className={w.revert.state==='failed'?'nr-error':'nr-td-text'} data-revert={w.revert.state}>{w.revert.state==='opening'?$t("等Agent 开回退 PR（撤回 PR #{0}）",{0:w.revert.of}):w.revert.state==='opened'?<>{$t("已开")} <a className="nr-link" href={w.revert.url} target="_blank" rel="noreferrer">{$tj("回退 PR #{0}",{0:w.revert.number})}</a>{$t("，在 GitHub 合并后改动就撤掉了。")}</>:$t("回退 PR 没有开出来：{0}",{0:w.revert.error||$t("原因未知")})}</p>}
  {latestEffect(w)&&<p className="nr-td-text">{effectLine(latestEffect(w)!)}</p>}
  <div className="nr-td-what"><b>{$t("发布说明")}</b><p>{r.note}</p></div><PageLinks pages={r.pages}/>{r.pr&&<p className="nr-td-muted"><a className="nr-link" href={r.pr.url} target="_blank" rel="noreferrer">PR #{r.pr.number}</a>{r.mergeSha?$t(" · 合并提交 {0}",{0:r.mergeSha.slice(0,7)}):''}</p>}
 </Await>;
 const replies=repliesOf(w,[...w.results].reverse().find(x=>x?.approvedAt&&!x.rejectedAt)?.content);
 if(replies.length)return <Await tone="done" label={$t("已完成")} icon={<Check/>} title={$t("回复草稿已通过")} sub={$t("逐条复制，去原帖回复。NocoReach 不会替你发帖。")}><ReplyDrafts items={replies}/></Await>;
 return <Await tone="done" label={$t("已完成")} icon={<Check/>} title={$t("已完成")} sub={w.observeFrom?$t("从 {0} 开始观察效果，第 7、28 天自动和上线前对比，结果在右侧“效果观察”。",{0:new Date(w.observeFrom).toLocaleDateString(getCurrentLocale())}):$t("交付的内容保存在下方成果中。")}>
  {w.receipt?.note&&<p className="nr-td-text">{$tj("已发布：{0}",{0:w.receipt.note})}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">{$t("打开页面")}</a></>}</p>}
 </Await>;
}
function Section({title,count,children}:{title:string;count?:number;children:ReactNode}){return <section className="nr-td-section" aria-label={title}><h2>{title}{count?<span>{count}</span>:null}</h2>{children}</section>;}
// Before the task starts, the brief is in the start card above, so it is not repeated here.
function EvidenceCard({data,showBrief=true}:{data:Data;showBrief?:boolean}){
 const ev=(data.task.evidence||{}) as {insight?:{signalIds?:string[]};context?:{signals?:{items?:Signal[]}};handoff?:{playbook?:string;content?:string}};
 const ids=new Set(ev.insight?.signalIds||[]),signals=(ev.context?.signals?.items||[]).filter(s=>ids.has(s.key));
 const [open,setOpen]=useState(false),brief=ev.handoff?.content||data.task.brief||'',briefTitle=ev.handoff?.content?$t("“{0}”交付的文档",{0:ev.handoff.playbook}):$t("任务说明");
 if(!signals.length&&!(brief&&showBrief)&&!data.work.note)return null;
 return <Section title={$t("依据")}><div className="nr-td-evidence">
  {signals.map(s=><div key={s.key} className="nr-td-tile"><span>{getSourceNames()[s.source]||s.source}</span><b>{$t(s.title)}</b>{s.facts.slice(0,3).map(f=><small key={f}>{$t(f)}</small>)}</div>)}
  {brief&&showBrief&&<button type="button" className="nr-td-tile nr-td-brief" onClick={()=>setOpen(true)}><span>{briefTitle}</span><p>{brief.replace(/[#*>`_-]/g,'').slice(0,140)}</p><small className="nr-td-open">{$t("查看全文")}</small></button>}
  {data.work.note&&<div className="nr-td-tile"><span>{$t("你的补充说明")}</span><p>{data.work.note}</p></div>}
 </div><DocReader open={open} onClose={()=>setOpen(false)} title={briefTitle} content={brief}/></Section>;
}
function OutputsCard({data}:{data:Data}){
 const w=data.work,stages=w.flow?.stages||[],index=w.stageIndex||0,[view,setView]=useState<{s:Stage;r:Artifact}>();
 const rows=stages.map((s,i)=>({s,r:w.results[i],i})).filter(x=>producesOutput(x.s)&&x.r) as {s:Stage;r:Artifact;i:number}[];
 if(!rows.length)return null;
 const status=(r:Artifact,i:number)=>r.approvedAt?['done',$t("已通过")]:r.rejectedAt?['error',$t("已退回")]:w.stage==='flow'&&!w.cancelledAt&&stages[index]?.kind==='review'&&index-1===i?['review',$t("待审核")]:['todo',$t("已交付")];
 return <Section title={$t("成果")} count={rows.length}><ul className="nr-td-outputs">{rows.map(({s,r,i})=>{const [tone,label]=status(r,i);return <li key={s.key}>
  {r.pr?<GitPullRequest aria-hidden="true"/>:<FileText aria-hidden="true"/>}<b>{s.name}</b><span className="nr-td-muted">{$tj("第 {0} 版 · {1}{2}",{0:r.version,1:r.manual?$t("你记录的"):getStageExecutor()[s.kind],2:r.pr?` · PR #${r.pr.number}`:''})}</span>
  <Tag tone={stateToneOf(tone)} className="ml-auto">{label}</Tag><Button size="sm" variant="ghost" onClick={()=>setView({s,r})}>{$t("查看")}</Button></li>;})}</ul>
  {view&&<DocReader open onClose={()=>setView(undefined)} title={stages.find(s=>s.key===view.s.key)?.name||view.s.name} meta={$t("第 {0} 版 · {1}",{0:view.r.version,1:when(view.r.createdAt)})} content={view.r.content}>{view.r.pr&&<PrCard pr={view.r.pr}/>}</DocReader>}
 </Section>;
}
const eventIcons:Record<string,ReactNode>={merged:<GitMerge/>,live:<Globe/>,notSeen:<AlertCircle/>,retryMerge:<RotateCcw/>,markMerged:<GitMerge/>,confirmLive:<Globe/>,waitLonger:<RotateCcw/>,startTask:<Play/>,runQueued:<Bot/>,runSucceeded:<Bot/>,runFailed:<AlertCircle/>,flowWaiting:<AlertCircle/>,approveStage:<Check/>,editStageOutput:<Pencil/>,recordManual:<Pencil/>,retryStage:<RotateCcw/>,confirmPublish:<Rocket/>,linkContent:<Link2/>,linkPage:<Link2/>,setAgent:<Bot/>,setOwner:<UserRound/>,setCollaborators:<Users/>,handoff:<ArrowRightLeft/>,moveWork:<Move/>,selectPlaybook:<Play/>};
function ActivityCard({data,update,busy,executor,members,onDirty}:{data:Data;update:Update;busy:boolean;executor:string;members:Member[];onDirty:(v:boolean)=>void}){
 const [text,setText]=useState(''),w=data.work,stages=w.flow?.stages||[],stage=stages[w.stageIndex||0],done=w.stage==='done';
 const reviewing=useContext(TaskAccess).allowed&&Boolean(w.flow)&&!done&&stage?.kind==='review'&&w.results[(w.stageIndex||0)-1];
 const nameOf=(key?:string)=>stages.find(s=>s.key===key)?.name||$t("这一步");
 const people=useMemo(()=>new Map(members.map(m=>[m.id,m.name])),[members]);
 const runs=new Map(data.runs.map(r=>[r.id,r]));
 // A command and the run it starts share one time; show the command first.
 const rows=(w.history||[]).map((e,i)=>({e,i,t:eventText(e,nameOf,executor)})).filter(x=>x.t).sort((a,b)=>String(a.e.at).localeCompare(String(b.e.at))||Number(a.e.action==='runQueued')-Number(b.e.action==='runQueued')||a.i-b.i);
 async function send(){const d=reviewing?await update('requestStageChanges',{stageKey:stage.key,artifactId:w.results[(w.stageIndex||0)-1]!.id,comment:text}):await update('comment',{comment:text});if(d){setText('');onDirty(false);}}
 return <Section title={$t("动态")}><ol className="nr-td-timeline">{rows.map(({e,t},i)=>{const who=t!.who===$t("你")?(e.actor&&people.get(e.actor))||$t("你"):t!.who;const run=e.runId?runs.get(e.runId):undefined;
  if(e.action==='comment'||e.action==='requestStageChanges')return <li key={i} className="nr-td-comment"><header><ActorAvatar type="user" name={who} size="xs"/><b>{who}</b>{e.action==='requestStageChanges'&&<Tag tone="violet">{$t("要求修改")}</Tag>}<time>{when(e.at)}</time></header><p>{e.comment}</p></li>;
  return <li key={i} className="nr-td-event">{eventIcons[e.action]||<Play/>}<b>{who}</b><span>{t!.text}{e.action==='runQueued'&&run?.endedAt?$t(" · 用时 {0}",{0:took(run)}):''}</span><time>{when(e.at)}</time></li>;})}
  {!rows.length&&<li className="nr-td-muted">{$t("还没有动态。")}</li>}</ol>
  {!done&&!w.cancelledAt&&!w.archivedAt&&<div className="nr-td-composer"><textarea id="nr-composer" aria-label={$t("给执行者的话")} rows={3} value={text} disabled={busy} placeholder={reviewing?$t("写修改意见，发送后{0}会按意见重做",{0:getStageExecutor()[stages[(w.stageIndex||0)-1].kind]}):$t("给{0}留言，下一次运行会读到",{0:executor})} onChange={e=>{setText(e.target.value);onDirty(Boolean(e.target.value));}}/><div><Button size="sm" disabled={busy||!text.trim()} onClick={()=>void send()}>{reviewing?$t("发送并要求修改"):$t("发送")}</Button></div></div>}
 </Section>;
}
function PageLink({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const {allowed}=useContext(TaskAccess);if(!allowed)return <div className="nr-td-card"><h3>{$t("关联页面")}</h3>{data.work.page?<div className="nr-td-page"><a className="nr-link" href={data.work.page.url} target="_blank" rel="noreferrer">{data.work.page.title||data.work.page.url}<ExternalLink aria-hidden="true"/></a></div>:<p className="nr-td-muted">{$t("未关联")}</p>}</div>;
 return <PageLinkEditor data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/>;
}
function PageLinkEditor({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const page=data.work.page,[q,setQ]=useState(''),[hits,setHits]=useState<{url:string;title:string;type:string}[]>(),[editing,setEditing]=useState(!page),[focused,setFocused]=useState(false);
 useEffect(()=>{setEditing(!page);},[page?.url]);
 useEffect(()=>{if(!editing)return;const t=setTimeout(()=>{void call<{url:string;title:string;type:string}[]>(projectId,taskId,'pages',{q}).then(r=>setHits(Array.isArray(r)?r:[])).catch(()=>setHits([]));},250);return()=>clearTimeout(t);},[q,editing,projectId,taskId]);
 const path=(u:string)=>{try{return new URL(u).pathname;}catch{return u;}};
 return <div className="nr-td-card"><h3>{$t("关联页面")}</h3>
  {page&&!editing?<div className="nr-td-page"><a className="nr-link" href={page.url} target="_blank" rel="noreferrer">{page.title||path(page.url)}<ExternalLink aria-hidden="true"/></a><small>{path(page.url)}</small>
   <div className="nr-td-row-actions"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t("更换")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void update('linkPage',{url:''})}>{$t("移除")}</Button></div></div>
  :<><label className="nr-td-search"><Search aria-hidden="true"/><input aria-label={$t("搜索页面")} value={q} placeholder={$t("搜索网站内容里的页面")} onFocus={()=>setFocused(true)} onChange={e=>setQ(e.target.value)}/></label>
   {hits&&(focused||q)&&(hits.length?<ul className="nr-td-hits">{hits.slice(0,6).map(h=><li key={h.url}><button type="button" disabled={busy} onClick={()=>void update('linkPage',{url:h.url}).then(d=>{if(d){setQ('');setEditing(false);}})}><b>{h.title||path(h.url)}</b><small>{path(h.url)}</small></button></li>)}</ul>:<p className="nr-td-muted">{q?$t("没有匹配的页面。"):$t("“网站内容”还没有页面，先在数据接入里接入网站。")}</p>)}
   {page&&<Button size="sm" variant="ghost" onClick={()=>setEditing(false)}>{$t("取消")}</Button>}</>}
  {!page&&data.work.contentId&&<p className="nr-td-muted">{$t("已关联旧的内容映射；选一个页面后以新的为准。")}</p>}
 </div>;
}
// 效果观察 (SPEC §8): day 7 and day 28 against the same number of days before going live.
function EffectCard({w}:{w:Work}){
 const items=effectItems(w),pages=effectPages(w);
 return <div className="nr-td-card"><h3>{$t("效果观察")}</h3>
  {!w.observeFrom?<p className="nr-td-muted">{$t("上线后开始，第 7、28 天和上线前同样长的时间对比。")}</p>
  :!pages.length?<p className="nr-td-muted">{$t("没有关联页面，无法对比。在上方“关联页面”选一个页面后开始观察。")}</p>
  :<ul className="nr-td-effects">{items.map(i=>i.result?<EffectRow key={i.day} r={i.result}/>:<li key={i.day} className="nr-td-muted">{$tj("第 {0} 天：约 {1} 出结果",{0:i.day,1:i.expected})}</li>)}</ul>}
 </div>;
}
function EffectRow({r}:{r:EffectResult}){
 const [open,setOpen]=useState(false),range=(x:{start:string;end:string})=>$t("{0} 至 {1}",{0:x.start.slice(5),1:x.end.slice(5)});
 const rows:[string,[number,number],string?][]=[...(r.gsc?[[$t("搜索点击"),r.gsc.clicks],[$t("搜索曝光"),r.gsc.impressions],[$t("点击率"),r.gsc.ctr,'%'],[$t("平均排名"),r.gsc.position]] as [string,[number,number],string?][]:[]),...(r.ga4?[[$t("浏览量"),r.ga4.views],[$t("关键事件"),r.ga4.conversions]] as [string,[number,number],string?][]:[])];
 return <li data-c={r.conclusion}><b>{effectLine(r)}</b><button type="button" className="nr-link" onClick={()=>setOpen(v=>!v)}>{open?$t("收起"):$t("看数字")}</button>
  {open&&<div className="nr-td-effect-detail"><p className="nr-td-muted">{$tj("上线前 {0} · 上线后 {1}",{0:range(r.baseline),1:range(r.after)})}</p><table><tbody>{rows.map(([k,[b,a],u])=><tr key={k}><th>{k}</th><td>{b}{u}</td><td>→</td><td>{a}{u}</td></tr>)}</tbody></table>{r.notes.map(n=><p key={n} className="nr-td-muted">{n}</p>)}</div>}</li>;
}
function Aside({data,list,projectId,taskId,busy,runActive,members,runs,update}:{data:Data;list?:PlaybookList;projectId:number;taskId:string;busy:boolean;runActive:boolean;members:Member[];runs:Run[];update:Update}){
 const navigate=useNavigate(),w=data.work,started=Boolean(w.flow),done=w.stage==='done',index=w.stageIndex||0,state=workState(w);
 const pb=list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault));
 const preview=started?w.flow!.stages:pb?stagesFor(pb):[];
 const pbName=w.playbook?.name||w.flow?.name||pb?.name,pbKind=w.playbook?.kind||pb?.kind,legacyAi=preview.some(s=>s.kind==='ai')&&!preview.some(s=>s.kind==='agent');
 const collab=w.collaborators||[],collabIds=collab.map(c=>c.id),stageName=(key:string)=>preview.find(s=>s.key===key)?.name||key;
 const owners=members.some(m=>m.id===w.humanOwnerId)||!w.humanOwnerId?members:[{id:w.humanOwnerId,name:w.humanOwnerName||w.humanOwnerId},...members],{allowed,owner}=useContext(TaskAccess);
 return <div className="nr-td-aside">
  <div className="nr-td-card"><h3>{$t("属性")}</h3>
   <div className="nr-td-prop"><span>{$t("状态")}</span><span>{closedLabel(w)?<Tag tone="slate" dot>{closedLabel(w)}</Tag>:<Tag tone={stateToneOf(state)} dot>{getWorkColumns()[state]}</Tag>}</span></div>
   <div className="nr-td-prop"><WithInfo help={help($t("做法"))}>{$t("做法")}</WithInfo><span>{pbName||'—'}{!started&&pbName?$t("（未开始）"):''}</span></div>
   {pbKind&&<div className="nr-td-prop"><WithInfo help={help($t("执行者"))}>{$t("执行者")}</WithInfo><span>{legacyAi?$t("在线 AI"):$t("Agent")}{pb&&!started?<small> · {categoryName(pb.category)}</small>:null}</span></div>}
   {started&&<TaskAgentField data={data} busy={busy} lockedReason={closedLabel(w)?$t("任务已关闭"):done?$t("任务已完成"):!allowed?$t("只有负责人和管理员能更换"):runActive?$t("任务正在排队或执行，结束后再更换 Agent"):undefined} onChange={async agentId=>Boolean(await update('setAgent',{agentId}))}/>}
   <div className="nr-td-prop"><label htmlFor="nr-owner">{$t("负责人")}</label><span><select id="nr-owner" aria-label={$t("负责人")} value={w.humanOwnerId||''} disabled={busy||runActive||!members.length||!allowed} title={!allowed?$t("只有负责人和管理员能更换"):runActive?$t("执行者正在运行，结束后再更换"):undefined} onChange={e=>void update('setOwner',{userId:e.target.value})}>{!w.humanOwnerId&&<option value="">{$t("未指定")}</option>}{owners.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></span></div>
   <div className="nr-td-prop"><span>{$t("协作人")}</span><span className="nr-td-people">{collab.map(c=><span key={c.id} className="nr-td-person"><ActorAvatar type="user" name={c.name} size="xs"/>{c.name}</span>)}
    <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant="ghost" disabled={busy||!members.length||!allowed}>{collab.length?$t("调整"):$t("添加")}</Button>}/>
     <DropdownMenuContent align="end">{members.filter(m=>m.id!==w.humanOwnerId).map(m=><DropdownMenuCheckboxItem key={m.id} checked={collabIds.includes(m.id)} onCheckedChange={on=>void update('setCollaborators',{userIds:on?[...collabIds,m.id]:collabIds.filter(x=>x!==m.id)})}>{m.name}</DropdownMenuCheckboxItem>)}{members.filter(m=>m.id!==w.humanOwnerId).length===0&&<p className="nr-td-muted nr-td-menu-empty">{$t("没有其他成员")}</p>}</DropdownMenuContent></DropdownMenu></span></div>
  </div>
  {preview.length>0&&<div className="nr-td-card"><h3>{$t("进度")}</h3><ol className="nr-td-steps">{preview.filter(s=>s.kind!=='observe').map((s,i)=>{const st=!started?'todo':done||i<index?'done':i===index&&!closedLabel(w)?'current':'todo';return <li key={s.key} data-state={st}><span className="nr-td-dot" aria-hidden="true">{st==='done'?<Check/>:null}</span><span>{displayStageName(s)}</span><small>{s.kind==='review'&&!allowed?owner:getStageExecutor()[s.kind]}</small></li>;})}</ol></div>}
  <PageLink data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/>
  {runs.length>0&&<div className="nr-td-card"><h3>{$t("运行记录")}</h3><ul className="nr-td-runs">{runs.slice(0,6).map(r=><li key={r.id} data-status={r.status}><span className="nr-td-run-dot" aria-hidden="true"/><span>{stageName(r.stepId)}<small className="truncate" title={runnerOf(r)}>{runnerOf(r)}</small></span><small>{active(r)?(r.status==='queued'?$t("排队中"):$t("执行中")):r.status==='failed'?(getRunErrors()[r.error||'']||$t("失败")):took(r)}</small></li>)}</ul></div>}
  {(data.related||[]).length>0&&<div className="nr-td-card"><h3>{$t("前后任务")}</h3>{data.related!.map(r=><button key={r.id} type="button" className="nr-link nr-td-related" onClick={()=>navigate(`/actions/${r.id}`)}>{r.relation==='prev'?$t("上一步："):$t("下一步：")}{r.title}</button>)}</div>}
  {pbKind==='build'&&<EffectCard w={w}/>}
 </div>;
}
