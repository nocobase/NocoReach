import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {refreshNavBadges} from '@/components/app-shell/nav-badges';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Archive,ArchiveRestore,Ban,Play,Bot,Check,RotateCcw,AlertCircle,Link2,UserRound,Rocket,Pencil,ArrowRightLeft,Move,FileText,GitPullRequest,GitMerge,Globe,Eye,Search,ExternalLink,Users,Square} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem} from '@/components/ui/dropdown-menu';
import {ReachDetailLayout} from '@/components/reach-detail-layout';
import {useUnsavedWarning} from './reach-data';
import {DocView,DocReader} from './doc-view';
import {ChangeView} from './change-view';
import {effectItems,effectLine,effectPages,latestEffect,type EffectResult} from './effect-model';
import {workColumns,workState,closeCommand,canReopen,closedWhen,closeConfirm,closedLabel,type TaskData as Data,type Work,type Artifact,type PullRequestInfo} from './task-execution-types';
import {playbookRequest,executorOf,deliverableOf,kindLabels,stageExecutor,stagesFor,producesOutput,eventText,type PlaybookList,type Stage} from './playbook-model';
import './strategy/strategy.css';
import './reach-workspace.css';
import './task-execution.css';
import './task-detail.css';
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
type Signal={key:string;source:string;title:string;facts:string[]};
type Member={id:string;name:string};
type Run=Data['runs'][number];
const sourceNames:Record<string,string>={gsc:'Search Console',ga4:'GA4',site:'网站内容',github:'GitHub','github-traffic':'GitHub Traffic',discourse:'社区论坛'};
const runErrors:Record<string,string>={provider_failed_or_unknown:'在线 AI 没有返回结果',interrupted_or_unknown:'运行中断，结果未知',context_changed:'任务内容在运行前已变化',cancelled:'已停止，没有推送任何改动',no_changes:'Agent 没有修改任何文件',agent_failed:'执行没有完成，详情见执行记录',replaced_by_manual:'已改为由你完成'};
const call=<T,>(projectId:number,taskId:string,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId,...body},unwrap:'data'});
// Tasks run by a playbook (new tasks, and tasks started with a flow) use this page; older step-plan tasks keep theirs.
export function isPlaybookTask(d:Data){const w=d.work;return Boolean(w.playbook||w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const when=(iso?:string)=>iso&&!Number.isNaN(Date.parse(iso))?new Date(iso).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const active=(r:Run)=>r.status==='queued'||r.status==='running';
function took(r:Run){if(!r.endedAt)return '';const s=Math.max(0,Math.round((Date.parse(r.endedAt)-Date.parse(r.createdAt))/1000));return s<60?`${s} 秒`:`${Math.floor(s/60)} 分 ${s%60} 秒`;}
function since(iso:string){const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000));return Number.isNaN(m)||m<1?'不到 1 分钟':`${m} 分钟`;}
const runnerOf=(r:Run)=>r.executorKind==='local'?'本机 Agent':'在线 AI';
const pathOf=(u:string)=>{try{const x=new URL(u);return x.pathname+x.search;}catch{return u;}};
const PageLinks=({pages}:{pages:string[]})=>pages.length?<ul className="nr-td-live-pages">{pages.map(u=><li key={u}><a className="nr-link" href={u} target="_blank" rel="noreferrer">{pathOf(u)}<ExternalLink aria-hidden="true"/></a></li>)}</ul>:null;
// Task page (SPEC §6, after NocoProject's issue detail): what waits for you, evidence, outputs and activity on the left;
// properties, progress, linked page and runs on the right.
export function TaskDetail({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 const navigate=useNavigate();const [data,setData]=useState<Data>(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[list,setList]=useState<PlaybookList>(),[dirty,setDirty]=useState(false),[members,setMembers]=useState<Member[]>([]);
 const pending=useRef(false),op=useRef({key:'',id:''});useUnsavedWarning(dirty);
 const w=data.work,runActive=data.runs.some(active);
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setList).catch(()=>undefined);void call<Member[]>(projectId,taskId,'members').then(m=>setMembers(Array.isArray(m)?m:[])).catch(()=>undefined);},[projectId]);
 useEffect(()=>{if(!runActive)return;const t=setInterval(()=>{if(!pending.current)void call<Data>(projectId,taskId,'get').then(setData).catch(()=>undefined);},3000);return()=>clearInterval(t);},[runActive,projectId,taskId]);
 const update:Update=async(command,body={})=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');const key=JSON.stringify([data.work.revision,command,body]);if(op.current.key!==key)op.current={key,id:crypto.randomUUID()};
  try{const d=await call<Data>(projectId,taskId,'advance',{revision:data.work.revision,requestId:op.current.id,command,...body});setData(d);refreshNavBadges();setDirty(false);return d;}catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试。');}finally{pending.current=false;setBusy(false);}};
 const stages:Stage[]=w.flow?.stages||[],index=w.stageIndex||0,stage=stages[index],started=Boolean(w.flow),done=w.stage==='done';
 const kind=w.playbook?.kind||(stages.some(s=>s.kind==='agent')?'build':'plan'),executor=executorOf[kind],state=workState(w);
 const runs=[...data.runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),live=runs.find(active);
 return <div className="nr-app nr-task-page">
  <ReachDetailLayout asideLabel="任务属性" main={<div className="nr-td-main">
   <header className="nr-td-head">
    <nav className="nr-td-crumbs" aria-label="位置"><button type="button" onClick={()=>{if(!dirty||confirm('放弃未保存的内容并返回？'))navigate('/actions');}}>任务</button><span>/</span><span>{data.task.title}</span></nav>
    <div className="nr-td-titlebar"><h1>{data.task.title}</h1><div className="nr-td-head-actions">
     {canReopen(w)?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void update('unarchiveTask')}><ArchiveRestore/>重新打开</Button>
      :(()=>{const cmd=closeCommand(w);return cmd&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(cmd==='archiveTask'||confirm(closeConfirm))void update(cmd);}}><Archive/>关闭任务</Button>;})()}
    </div></div>
    <p className="nr-td-meta">{closedLabel(w)?<span className="nr-pill nr-state-closed">{closedLabel(w)}</span>:<span className={'nr-pill nr-state-'+state}>{workColumns[state]}</span>}{started&&<span className="nr-td-chip">{w.playbook?.name||w.flow?.name}</span>}{started&&<span>{executor}</span>}{live&&<span className="nr-live">● {runnerOf(live)} 正在{stage?.name||'执行'}，已进行 {since(live.createdAt)}</span>}</p>
   </header>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   {w.cancelledAt||w.archivedAt?<ClosedCard w={w}/>:!started?<StartCard data={data} list={list} update={update} busy={busy}/>:done?<DoneCard w={w}/>:<CurrentCard key={`${index}:${stage?.key}`} data={data} update={update} busy={busy} runActive={runActive} list={list} onDirty={setDirty}/>}
   <EvidenceCard data={data}/>
   <OutputsCard data={data}/>
   <ActivityCard data={data} update={update} busy={busy} executor={started?executor:'执行者'} members={members} onDirty={setDirty}/>
  </div>} aside={<Aside data={data} list={list} projectId={projectId} taskId={taskId} busy={busy} runActive={runActive} members={members} runs={runs} update={update}/>}/>
 </div>;
}
// The one thing that waits for you: a card with a coloured edge, one sentence, the content and the actions under it.
function Await({icon,title,sub,at,children,actions,tone='attention',label='等你处理'}:{icon:ReactNode;title:string;sub?:ReactNode;at?:string;children?:ReactNode;actions?:ReactNode;tone?:'attention'|'live'|'done'|'error'|'closed';label?:string}){
 return <section className="nr-td-await" data-tone={tone} aria-label={label}>
  <div className="nr-td-await-body"><header><span className="nr-td-await-icon" aria-hidden="true">{icon}</span><h2>{title}</h2>{at&&<time>{when(at)}</time>}</header>{sub&&<p className="nr-td-sub">{sub}</p>}{children}</div>
  {actions&&<div className="nr-td-await-actions">{actions}</div>}
 </section>;
}
function StartCard({data,list,update,busy}:{data:Data;list?:PlaybookList;update:Update;busy:boolean}){
 const [id,setId]=useState(data.work.playbookId||data.playbookDefault||'optimize-page'),[note,setNote]=useState('');
 const p=list?.playbooks.find(x=>x.id===id),handoff=(data.task.evidence?.handoff as {playbook?:string}|undefined);
 return <Await icon={<Play/>} title="开始前" label="开始任务" sub={handoff?`这个任务由“${handoff.playbook}”交接而来，它交付的文档就是任务说明。`:'选好做法，点开始后执行者才会动手。'}
  actions={<Button disabled={busy||!p} onClick={()=>void update('startTask',{playbookId:id,note})}>开始</Button>}>
  <label className="nr-field">做法<select aria-label="做法" value={id} disabled={busy||!list} onChange={e=>setId(e.target.value)}>
   {(['plan','build'] as const).map(k=><optgroup key={k} label={`${kindLabels[k]} · ${executorOf[k]}`}>{(list?.playbooks||[]).filter(x=>x.kind===k).map(x=><option key={x.id} value={x.id}>{x.name}{x.id===data.playbookDefault?'（推荐）':''}</option>)}</optgroup>)}
  </select></label>
  {p&&<><p className="nr-td-text">{p.description}</p><p className="nr-footnote">由{executorOf[p.kind]}执行，{deliverableOf[p.kind]}。</p>
   <ol className="nr-flow-preview" aria-label="步骤预览">{stagesFor(p).map(s=><li key={s.key}>{s.name}<small>{stageExecutor[s.kind]}</small></li>)}</ol></>}
  <label className="nr-field">补充说明（可选）<textarea aria-label="补充说明" rows={3} value={note} disabled={busy} placeholder="例如：只改英文版；语气保持技术文档风格" onChange={e=>setNote(e.target.value)}/></label>
 </Await>;
}
const focusComposer=()=>{const el=document.getElementById('nr-composer') as HTMLTextAreaElement|null;el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus();};
function PrCard({pr,compact=false}:{pr:PullRequestInfo;compact?:boolean}){
 const add=pr.files.reduce((n,f)=>n+f.additions,0),del=pr.files.reduce((n,f)=>n+f.deletions,0);
 return <div className="nr-td-pr"><div className="nr-td-pr-head"><GitPullRequest aria-hidden="true"/><a className="nr-link" href={pr.url} target="_blank" rel="noreferrer">在 GitHub 查看改动</a><code>#{pr.number}</code></div>
  <dl><div><dt>改动</dt><dd><span className="nr-add">+{add}</span> <span className="nr-del">−{del}</span> · {pr.files.length} 个文件</dd></div><div><dt>分支</dt><dd><code>{pr.branch}</code>{pr.headSha?` · ${pr.headSha.slice(0,7)}`:''}</dd></div>{pr.checks&&<div><dt>检查</dt><dd className={pr.checks.ok?'nr-check-ok':'nr-error'}>{pr.checks.summary}</dd></div>}</dl>
  {!compact&&<ul className="nr-pr-files">{pr.files.slice(0,12).map(f=><li key={f.path}><code>{f.path}</code><span>+{f.additions} −{f.deletions}</span></li>)}{pr.files.length>12&&<li>还有 {pr.files.length-12} 个文件</li>}</ul>}</div>;
}
function Events({events}:{events:{type:string;text:string}[]}){return events.length?<ol className="nr-agent-events" aria-label="执行记录">{events.map((e,i)=><li key={i} data-type={e.type}>{e.text}</li>)}</ol>:null;}
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
  if(runActive)return <Await tone="live" label="当前进度" icon={<Bot/>} title={`在线 AI 正在${stage.name}`} sub="完成后会出现在这里等你审核，通常一两分钟。"/>;
  return <Await icon={<Bot/>} title={stage.name} sub={cur?.status==='failed'?<span className="nr-error">上次运行没有完成：{runErrors[cur.error||'']||cur.error||'原因未知'}。已有内容不受影响。</span>:`这一步由在线 AI 完成，尚未开始。`}
   actions={<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?'重试':'开始'}</Button>}/>;
 }
 if(stage.kind==='review'&&stages[index+1]?.kind==='release'){
  const out=w.results[index-1],pr=out?.pr;
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={stage.name} sub="没有可以看的改动，请刷新后重试。"/>;
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(pr?.outOfScope?.length&&!scopeOk);
  return <Await icon={<Eye/>} title={stage.name} at={out.createdAt} sub={pr?`本机 Agent 改了 ${pr.files.length} 个文件。看过改动后点发布，或在下方写意见让它重改。`:'这是你自己完成的改动。确认发布后，上线了由你确认。'}
   actions={<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,release:{note:relNote},...(pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}><Rocket/>发布</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>要求修改</Button>
    <span className="nr-td-push nr-td-release-hint">{pr?`将合并 PR #${pr.number}（你看过的版本）`:'不需要合并'} · <button type="button" className="nr-link" onClick={()=>setShowNote(v=>!v)}>{showNote?'收起发布说明':'发布说明'}</button></span></>}>
   {pr?.previewUrl&&<a className="nr-td-preview" href={pr.previewUrl} target="_blank" rel="noreferrer"><Globe aria-hidden="true"/>打开预览页面<ExternalLink aria-hidden="true"/></a>}
   {pr?.release&&<div className="nr-td-what"><b>改了什么</b><p>{pr.release}</p></div>}
   {pr?.changes?.length?<ChangeView changes={pr.changes}/>:<DocView content={out.content} title="改动说明" meta={`第 ${out.version} 版`}/>}
   {pr&&<PrCard pr={pr} compact={Boolean(pr.changes?.length)}/>}
   {pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/> 超出允许范围：{pr.outOfScope.join('、')}。我已看过，确认这些改动没有问题</label>:null}
   {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>确认以下事项</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':'（可选）'}</label>)}</fieldset>}
   {showNote&&<label className="nr-field">发布说明（写进发布记录，可以修改）<textarea aria-label="发布说明" rows={3} value={relNote} disabled={busy} placeholder="一两句话说明这次改了什么" onChange={e=>{setRelNote(e.target.value);onDirty(true);}}/></label>}
  </Await>;
 }
 if(stage.kind==='release'){
  const r=w.release,queued=cur?.status==='queued';
  if(!r)return <Await tone="error" icon={<AlertCircle/>} title={stage.name} sub="没有要发布的内容，请刷新后重试。"/>;
  const mark=<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>void act('markMerged',{})}>我已在 GitHub 合并</Button>;
  if(r.state==='merging')return <Await tone="live" label="当前进度" icon={<GitMerge/>} title={`本机 Agent 正在合并 PR #${r.pr?.number}`} sub={queued&&!data.agent?.online?<>等本机 Agent 领取：现在没有在线的电脑，电脑上的 Agent 启动后会自动合并。<Button variant="link" onClick={()=>navigate('/agents')}>查看电脑</Button></>:'只合并你看过的那次提交，合并后自动核实上线。'} actions={queued?mark:undefined}/>;
  if(r.state==='merge_failed')return <Await tone="error" icon={<AlertCircle/>} title="没有合并成功" sub={r.error||'合并没有完成'} actions={<><Button disabled={busy} onClick={()=>void act('retryMerge',{})}>重新合并</Button>{mark}</>}><PageLinks pages={[]}/></Await>;
  const live=<Button variant={r.state==='verifying'?'ghost':'default'} className={r.state==='verifying'?'nr-td-push':''} disabled={busy} onClick={()=>void act('confirmLive',{})}>我确认已上线</Button>;
  if(r.state==='verifying')return <Await tone="live" label="当前进度" icon={<Globe/>} title="已合并，等待上线" sub={`每 30 分钟打开一次线上页面，找“${r.verifyText}”。${r.lastCheckAt?`最近一次 ${when(r.lastCheckAt)}，还没看到。`:''}看到后自动开始观察效果。`} actions={live}><PageLinks pages={r.pages}/></Await>;
  const [title,sub]=r.reason==='manual'?['等你确认上线','这是你自己完成的改动。上线后点确认，之后开始观察效果。']:r.reason==='cannot_verify'?['已合并，等你确认上线','这次改动没有可以在网页上核对的文字，没法自动核实。上线后点确认。']:['24 小时还没在线上看到改动','可能部署还没完成，或者这个仓库不会自动部署到网站（例如测试仓库）。'];
  return <Await icon={<Globe/>} title={title} sub={sub} actions={<>{live}{!r.reason&&<Button variant="outline" disabled={busy} onClick={()=>void act('waitLonger',{})}>再等 24 小时</Button>}</>}><PageLinks pages={r.pages}/></Await>;
 }
 if(stage.kind==='review'){
  const producer=stages[index-1],out=w.results[index-1];
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(out?.pr?.outOfScope?.length&&!scopeOk);
  const label=nextOptions.length&&next?`接受，交给${executorOf.build}“${name(next)}”`:stages[index+1]?.kind==='agent'?`通过，交给${stageExecutor.agent}`:stages[index+1]?.kind==='publish'?'通过，去发布':'接受';
  const by=`${stageExecutor[producer.kind]}${out?.manual?'（你记录的）':''} · 第 ${out?.version} 版`;
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={stage.name} sub="没有可审核的内容，请刷新后重试。"/>;
  return <Await icon={out.pr?<GitPullRequest/>:<FileText/>} title={stage.name} at={out.createdAt} sub={out.pr?`${stageExecutor[producer.kind]}改好了并开了 PR。看过改动后通过，或在下方写意见让它重做。`:`${by}。看完后通过，或写意见让它重做。`}
   actions={editing?<><Button disabled={busy||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft}).then(d=>{if(d)setEditing(false);})}>保存修改</Button><Button variant="ghost" onClick={()=>{setEditing(false);onDirty(false);}}>取消</Button></>
    :<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,...(nextOptions.length&&next?{next}:{}),...(out.pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}>{label}</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>要求修改</Button><Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>{setDraft(out.content);setEditing(true);}}><Pencil/>直接编辑</Button></>}>
   {editing?<textarea className="nr-stage-edit" aria-label="编辑内容" rows={18} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);onDirty(true);}}/>:<>
    {out.pr&&<PrCard pr={out.pr}/>}
    {out.pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/> 超出允许范围：{out.pr.outOfScope.join('、')}。我已看过，确认这些改动没有问题</label>:null}
    <DocView content={out.content} title={producer.name} meta={by}/>
    {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>确认以下事项</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':'（可选）'}</label>)}</fieldset>}
    {nextOptions.length>0&&<label className="nr-inline-field nr-next-field">接着做<select aria-label="接着做" value={next} disabled={busy} onChange={e=>setNext(e.target.value)}>{nextOptions.map(id=><option key={id} value={id}>{name(id)}（{executorOf.build}）</option>)}<option value="">不接着做</option></select></label>}
   </>}
  </Await>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  const agent=data.agent,isActive=cur&&active(cur),events=(data.agentEvents||[]).slice(-10);
  const actions=!manual?<>
   {cur?.status!=='running'&&cur?.status!=='queued'&&agent?.repo&&<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?'重试':'交给本机 Agent'}</Button>}
   {isActive&&<Button variant="outline" disabled={busy||Boolean(cur.cancelRequested)} onClick={()=>void update('cancelRun',{runId:cur.id})}><Square/>停止</Button>}
   {cur?.status!=='running'&&<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>setManual(true)}>我自己完成</Button>}
  </>:<><Button disabled={busy||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>记录并继续</Button><Button variant="ghost" onClick={()=>{setManual(false);onDirty(false);}}>取消</Button></>;
  const body=<>{manual&&<label className="nr-field">{stage.key==='plan'?'方案':'修改记录'}<textarea aria-label={stage.key==='plan'?'方案':'修改记录'} rows={4} value={record} disabled={busy} placeholder={stage.key==='plan'?'要改哪些文件和段落、改成什么':'PR 链接，或改了哪些文件、哪些内容'} onChange={e=>{setRecord(e.target.value);onDirty(Boolean(e.target.value));}}/></label>}
   {!manual&&<Events events={cur?events:[]}/>}
   {approved&&source&&<DocView content={approved.content} title={`已通过的${source.name}`} meta={`第 ${approved.version} 版`}/>}</>;
  if(!agent?.repo)return <Await tone="error" icon={<AlertCircle/>} title={stage.name} sub={<>还没有接入网站源码仓库，本机 Agent 不知道去哪里修改。<Button variant="link" onClick={()=>navigate('/connections?source=repo')}>去数据接入</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='queued')return <Await tone="live" label="当前进度" icon={<Bot/>} title={`本机 Agent：${stage.name}`} sub={agent.online?'已交给本机 Agent，马上开始。':<>等本机 Agent 领取：现在没有在线的电脑，电脑上的 Agent 启动后会自动开始。<Button variant="link" onClick={()=>navigate('/agents')}>查看电脑</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='running')return <Await tone="live" label="当前进度" icon={<Bot/>} title={`本机 Agent 正在${stage.name}${cur.cancelRequested?'（正在停止）':''}`} sub={`已进行 ${since(cur.createdAt)}，下面是它正在做的事。`} actions={actions}>{body}</Await>;
  if(cur?.status==='failed')return <Await tone="error" icon={<AlertCircle/>} title={stage.name} sub={`上次运行：${runErrors[cur.error||'']||cur.error||'没有完成'}。可以重试，或者自己完成。`} actions={actions}>{body}</Await>;
  return <Await icon={<Bot/>} title={stage.name} sub={`这一步由本机 Agent 完成：${stage.instruction}`} actions={actions}>{body}</Await>;
 }
 return <Await icon={<Rocket/>} title="确认发布" sub="PR 审核已通过。合并并上线后在这里确认，之后开始观察效果。在 NocoReach 内一键合并与上线核实将在后续版本接入。"
  actions={<Button disabled={busy||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>确认已发布</Button>}>
  <label className="nr-field">发布后的页面（可选）<input aria-label="发布后的页面" value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label>
  <label className="nr-field">发布说明<textarea aria-label="发布说明" rows={3} value={note} disabled={busy} placeholder="合并了哪个 PR、何时上线" onChange={e=>setNote(e.target.value)}/></label>
 </Await>;
}
// A cancelled or archived task: what happened, and the open PR's fate.
function ClosedCard({w}:{w:Work}){
 const pr=w.prClose,prLine=pr?{closing:`PR #${pr.number} 等本机 Agent 关闭（分支保留）`,closed:`PR #${pr.number} 已关闭，分支保留`,failed:`PR #${pr.number} 没有关闭：${pr.error||'原因未知'}，可以在 GitHub 上关闭`}[pr.state]:'';
 const at=w.cancelledAt||w.archivedAt;
 return <Await tone="closed" label="已关闭" icon={w.cancelledAt?<Ban/>:<Archive/>} title={`已关闭 · ${closedWhen(w)}`} sub={`${at?`${when(at)} 关闭。`:''}${canReopen(w)?'需要时可以点“重新打开”。':'做到一半停下的任务不能接着做；要做的话，从机会页重新交给 Agent。'}`}>{prLine&&<p className="nr-td-text">{prLine}</p>}</Await>;
}
function DoneCard({w}:{w:Work}){
 const r=w.release;
 if(r?.state==='live')return <Await tone="done" label="已完成" icon={<Check/>} title="已上线" sub={`${when(r.liveAt)} ${(w.history||[]).some(e=>e.action==='live'&&e.actor==='system')?'在线上看到了改动':'确认已上线'}。第 7、28 天自动和上线前对比，结果在右侧“效果观察”。`}>
  {latestEffect(w)&&<p className="nr-td-text">{effectLine(latestEffect(w)!)}</p>}
  <div className="nr-td-what"><b>发布说明</b><p>{r.note}</p></div><PageLinks pages={r.pages}/>{r.pr&&<p className="nr-td-muted"><a className="nr-link" href={r.pr.url} target="_blank" rel="noreferrer">PR #{r.pr.number}</a>{r.mergeSha?` · 合并提交 ${r.mergeSha.slice(0,7)}`:''}</p>}
 </Await>;
 return <Await tone="done" label="已完成" icon={<Check/>} title="已完成" sub={w.observeFrom?`从 ${new Date(w.observeFrom).toLocaleDateString()} 开始观察效果，第 7、28 天自动和上线前对比，结果在右侧“效果观察”。`:'交付的内容保存在下方成果中。'}>
  {w.receipt?.note&&<p className="nr-td-text">已发布：{w.receipt.note}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">打开页面</a></>}</p>}
 </Await>;
}
function Section({title,count,children}:{title:string;count?:number;children:ReactNode}){return <section className="nr-td-section" aria-label={title}><h2>{title}{count?<span>{count}</span>:null}</h2>{children}</section>;}
function EvidenceCard({data}:{data:Data}){
 const ev=(data.task.evidence||{}) as {insight?:{signalIds?:string[]};context?:{signals?:{items?:Signal[]}};handoff?:{playbook?:string;content?:string}};
 const ids=new Set(ev.insight?.signalIds||[]),signals=(ev.context?.signals?.items||[]).filter(s=>ids.has(s.key));
 const [open,setOpen]=useState(false),brief=ev.handoff?.content||data.task.brief||'',briefTitle=ev.handoff?.content?`“${ev.handoff.playbook}”交付的文档`:'任务说明';
 return <Section title="依据"><div className="nr-td-evidence">
  {signals.map(s=><div key={s.key} className="nr-td-tile"><span>{sourceNames[s.source]||s.source}</span><b>{s.title}</b>{s.facts.slice(0,3).map(f=><small key={f}>{f}</small>)}</div>)}
  {brief&&<button type="button" className="nr-td-tile nr-td-brief" onClick={()=>setOpen(true)}><span>{briefTitle}</span><p>{brief.replace(/[#*>`_-]/g,'').slice(0,140)}</p><small className="nr-td-open">查看全文</small></button>}
  {data.work.note&&<div className="nr-td-tile"><span>你的补充说明</span><p>{data.work.note}</p></div>}
 </div><DocReader open={open} onClose={()=>setOpen(false)} title={briefTitle} content={brief}/></Section>;
}
function OutputsCard({data}:{data:Data}){
 const w=data.work,stages=w.flow?.stages||[],index=w.stageIndex||0,[view,setView]=useState<{s:Stage;r:Artifact}>();
 const rows=stages.map((s,i)=>({s,r:w.results[i],i})).filter(x=>producesOutput(x.s)&&x.r) as {s:Stage;r:Artifact;i:number}[];
 if(!rows.length)return null;
 const status=(r:Artifact,i:number)=>r.approvedAt?['done','已通过']:r.rejectedAt?['error','已退回']:w.stage==='flow'&&!w.cancelledAt&&stages[index]?.kind==='review'&&index-1===i?['review','待审核']:['todo','已交付'];
 return <Section title="成果" count={rows.length}><ul className="nr-td-outputs">{rows.map(({s,r,i})=>{const [tone,label]=status(r,i);return <li key={s.key}>
  {r.pr?<GitPullRequest aria-hidden="true"/>:<FileText aria-hidden="true"/>}<b>{s.name}</b><span className="nr-td-muted">第 {r.version} 版 · {r.manual?'你记录的':stageExecutor[s.kind]}{r.pr?` · PR #${r.pr.number}`:''}</span>
  <span className={'nr-pill nr-state-'+tone}>{label}</span><Button size="sm" variant="ghost" onClick={()=>setView({s,r})}>查看</Button></li>;})}</ul>
  {view&&<DocReader open onClose={()=>setView(undefined)} title={view.s.name} meta={`第 ${view.r.version} 版 · ${when(view.r.createdAt)}`} content={view.r.content}>{view.r.pr&&<PrCard pr={view.r.pr}/>}</DocReader>}
 </Section>;
}
const eventIcons:Record<string,ReactNode>={merged:<GitMerge/>,live:<Globe/>,notSeen:<AlertCircle/>,retryMerge:<RotateCcw/>,markMerged:<GitMerge/>,confirmLive:<Globe/>,waitLonger:<RotateCcw/>,startTask:<Play/>,runQueued:<Bot/>,runSucceeded:<Bot/>,runFailed:<AlertCircle/>,flowWaiting:<AlertCircle/>,approveStage:<Check/>,editStageOutput:<Pencil/>,recordManual:<Pencil/>,retryStage:<RotateCcw/>,confirmPublish:<Rocket/>,linkContent:<Link2/>,linkPage:<Link2/>,setOwner:<UserRound/>,setCollaborators:<Users/>,handoff:<ArrowRightLeft/>,moveWork:<Move/>,selectPlaybook:<Play/>};
function ActivityCard({data,update,busy,executor,members,onDirty}:{data:Data;update:Update;busy:boolean;executor:string;members:Member[];onDirty:(v:boolean)=>void}){
 const [text,setText]=useState(''),w=data.work,stages=w.flow?.stages||[],stage=stages[w.stageIndex||0],done=w.stage==='done';
 const reviewing=Boolean(w.flow)&&!done&&stage?.kind==='review'&&w.results[(w.stageIndex||0)-1];
 const nameOf=(key?:string)=>stages.find(s=>s.key===key)?.name||'这一步';
 const people=useMemo(()=>new Map(members.map(m=>[m.id,m.name])),[members]);
 const runs=new Map(data.runs.map(r=>[r.id,r]));
 // A command and the run it starts share one time; show the command first.
 const rows=(w.history||[]).map((e,i)=>({e,i,t:eventText(e,nameOf,executor)})).filter(x=>x.t).sort((a,b)=>String(a.e.at).localeCompare(String(b.e.at))||Number(a.e.action==='runQueued')-Number(b.e.action==='runQueued')||a.i-b.i);
 async function send(){const d=reviewing?await update('requestStageChanges',{stageKey:stage.key,artifactId:w.results[(w.stageIndex||0)-1]!.id,comment:text}):await update('comment',{comment:text});if(d){setText('');onDirty(false);}}
 return <Section title="动态"><ol className="nr-td-timeline">{rows.map(({e,t},i)=>{const who=t!.who==='你'?(e.actor&&people.get(e.actor))||'你':t!.who;const run=e.runId?runs.get(e.runId):undefined;
  if(e.action==='comment'||e.action==='requestStageChanges')return <li key={i} className="nr-td-comment"><header><span className="nr-td-avatar" aria-hidden="true">{who.slice(0,1)}</span><b>{who}</b>{e.action==='requestStageChanges'&&<span className="nr-pill nr-state-review">要求修改</span>}<time>{when(e.at)}</time></header><p>{e.comment}</p></li>;
  return <li key={i} className="nr-td-event">{eventIcons[e.action]||<Play/>}<b>{who}</b><span>{t!.text}{e.action==='runQueued'&&run?.endedAt?` · 用时 ${took(run)}`:''}</span><time>{when(e.at)}</time></li>;})}
  {!rows.length&&<li className="nr-td-muted">还没有动态。</li>}</ol>
  {!done&&!w.cancelledAt&&!w.archivedAt&&<div className="nr-td-composer"><textarea id="nr-composer" aria-label="给执行者的话" rows={3} value={text} disabled={busy} placeholder={reviewing?`写修改意见，发送后${stageExecutor[stages[(w.stageIndex||0)-1].kind]}会按意见重做`:`给${executor}留言，下一次运行会读到`} onChange={e=>{setText(e.target.value);onDirty(Boolean(e.target.value));}}/><div><Button size="sm" disabled={busy||!text.trim()} onClick={()=>void send()}>{reviewing?'发送并要求修改':'发送'}</Button></div></div>}
 </Section>;
}
function PageLink({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const page=data.work.page,[q,setQ]=useState(''),[hits,setHits]=useState<{url:string;title:string;type:string}[]>(),[editing,setEditing]=useState(!page),[focused,setFocused]=useState(false);
 useEffect(()=>{setEditing(!page);},[page?.url]);
 useEffect(()=>{if(!editing)return;const t=setTimeout(()=>{void call<{url:string;title:string;type:string}[]>(projectId,taskId,'pages',{q}).then(r=>setHits(Array.isArray(r)?r:[])).catch(()=>setHits([]));},250);return()=>clearTimeout(t);},[q,editing,projectId,taskId]);
 const path=(u:string)=>{try{return new URL(u).pathname;}catch{return u;}};
 return <div className="nr-td-card"><h3>关联页面</h3>
  {page&&!editing?<div className="nr-td-page"><a className="nr-link" href={page.url} target="_blank" rel="noreferrer">{page.title||path(page.url)}<ExternalLink aria-hidden="true"/></a><small>{path(page.url)}</small>
   <div className="nr-td-row-actions"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>更换</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void update('linkPage',{url:''})}>移除</Button></div></div>
  :<><label className="nr-td-search"><Search aria-hidden="true"/><input aria-label="搜索页面" value={q} placeholder="搜索网站内容里的页面" onFocus={()=>setFocused(true)} onChange={e=>setQ(e.target.value)}/></label>
   {hits&&(focused||q)&&(hits.length?<ul className="nr-td-hits">{hits.slice(0,6).map(h=><li key={h.url}><button type="button" disabled={busy} onClick={()=>void update('linkPage',{url:h.url}).then(d=>{if(d){setQ('');setEditing(false);}})}><b>{h.title||path(h.url)}</b><small>{path(h.url)}</small></button></li>)}</ul>:<p className="nr-td-muted">{q?'没有匹配的页面。':'“网站内容”还没有页面，先在数据接入里接入网站。'}</p>)}
   {page&&<Button size="sm" variant="ghost" onClick={()=>setEditing(false)}>取消</Button>}</>}
  {!page&&data.work.contentId&&<p className="nr-td-muted">已关联旧的内容映射；选一个页面后以新的为准。</p>}
 </div>;
}
// 效果观察 (SPEC §8): day 7 and day 28 against the same number of days before going live.
function EffectCard({w}:{w:Work}){
 const items=effectItems(w),pages=effectPages(w);
 return <div className="nr-td-card"><h3>效果观察</h3>
  {!w.observeFrom?<p className="nr-td-muted">上线后开始，第 7、28 天和上线前同样长的时间对比。</p>
  :!pages.length?<p className="nr-td-muted">没有关联页面，无法对比。在上方“关联页面”选一个页面后开始观察。</p>
  :<ul className="nr-td-effects">{items.map(i=>i.result?<EffectRow key={i.day} r={i.result}/>:<li key={i.day} className="nr-td-muted">第 {i.day} 天：约 {i.expected} 出结果</li>)}</ul>}
 </div>;
}
function EffectRow({r}:{r:EffectResult}){
 const [open,setOpen]=useState(false),range=(x:{start:string;end:string})=>`${x.start.slice(5)} 至 ${x.end.slice(5)}`;
 const rows:[string,[number,number],string?][]=[...(r.gsc?[['搜索点击',r.gsc.clicks],['搜索曝光',r.gsc.impressions],['点击率',r.gsc.ctr,'%'],['平均排名',r.gsc.position]] as [string,[number,number],string?][]:[]),...(r.ga4?[['浏览量',r.ga4.views],['关键事件',r.ga4.conversions]] as [string,[number,number],string?][]:[])];
 return <li data-c={r.conclusion}><b>{effectLine(r)}</b><button type="button" className="nr-link" onClick={()=>setOpen(v=>!v)}>{open?'收起':'看数字'}</button>
  {open&&<div className="nr-td-effect-detail"><p className="nr-td-muted">上线前 {range(r.baseline)} · 上线后 {range(r.after)}</p><table><tbody>{rows.map(([k,[b,a],u])=><tr key={k}><th>{k}</th><td>{b}{u}</td><td>→</td><td>{a}{u}</td></tr>)}</tbody></table>{r.notes.map(n=><p key={n} className="nr-td-muted">{n}</p>)}</div>}</li>;
}
function Aside({data,list,projectId,taskId,busy,runActive,members,runs,update}:{data:Data;list?:PlaybookList;projectId:number;taskId:string;busy:boolean;runActive:boolean;members:Member[];runs:Run[];update:Update}){
 const navigate=useNavigate(),w=data.work,started=Boolean(w.flow),done=w.stage==='done',index=w.stageIndex||0,state=workState(w);
 const pb=list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault));
 const preview=started?w.flow!.stages:pb?stagesFor(pb):[];
 const pbName=w.playbook?.name||w.flow?.name||pb?.name,pbKind=w.playbook?.kind||pb?.kind;
 const collab=w.collaborators||[],collabIds=collab.map(c=>c.id),stageName=(key:string)=>preview.find(s=>s.key===key)?.name||key;
 const owners=members.some(m=>m.id===w.humanOwnerId)||!w.humanOwnerId?members:[{id:w.humanOwnerId,name:w.humanOwnerName||w.humanOwnerId},...members];
 return <div className="nr-td-aside">
  <div className="nr-td-card"><h3>属性</h3>
   <div className="nr-td-prop"><span>状态</span><span>{closedLabel(w)?<span className="nr-pill nr-state-closed">{closedLabel(w)}</span>:<span className={'nr-pill nr-state-'+state}>{workColumns[state]}</span>}</span></div>
   <div className="nr-td-prop"><span>做法</span><span>{pbName||'—'}{!started&&pbName?'（未开始）':''}</span></div>
   {pbKind&&<div className="nr-td-prop"><span>执行者</span><span>{executorOf[pbKind]}<small> · {kindLabels[pbKind]}</small></span></div>}
   <div className="nr-td-prop"><label htmlFor="nr-owner">负责人</label><span><select id="nr-owner" aria-label="负责人" value={w.humanOwnerId||''} disabled={busy||runActive||!members.length} title={runActive?'执行者正在运行，结束后再更换':undefined} onChange={e=>void update('setOwner',{userId:e.target.value})}>{!w.humanOwnerId&&<option value="">未指定</option>}{owners.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></span></div>
   <div className="nr-td-prop"><span>协作人</span><span className="nr-td-people">{collab.map(c=><span key={c.id} className="nr-td-person"><span className="nr-td-avatar" aria-hidden="true">{c.name.slice(0,1)}</span>{c.name}</span>)}
    <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant="ghost" disabled={busy||!members.length}>{collab.length?'调整':'添加'}</Button>}/>
     <DropdownMenuContent align="end">{members.filter(m=>m.id!==w.humanOwnerId).map(m=><DropdownMenuCheckboxItem key={m.id} checked={collabIds.includes(m.id)} onCheckedChange={on=>void update('setCollaborators',{userIds:on?[...collabIds,m.id]:collabIds.filter(x=>x!==m.id)})}>{m.name}</DropdownMenuCheckboxItem>)}{members.filter(m=>m.id!==w.humanOwnerId).length===0&&<p className="nr-td-muted nr-td-menu-empty">没有其他成员</p>}</DropdownMenuContent></DropdownMenu></span></div>
  </div>
  {preview.length>0&&<div className="nr-td-card"><h3>进度</h3><ol className="nr-td-steps">{preview.filter(s=>s.kind!=='observe').map((s,i)=>{const st=!started?'todo':done||i<index?'done':i===index&&!closedLabel(w)?'current':'todo';return <li key={s.key} data-state={st}><span className="nr-td-dot" aria-hidden="true">{st==='done'?<Check/>:null}</span><span>{s.name}</span><small>{stageExecutor[s.kind]}</small></li>;})}</ol></div>}
  <PageLink data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/>
  {runs.length>0&&<div className="nr-td-card"><h3>运行记录</h3><ul className="nr-td-runs">{runs.slice(0,6).map(r=><li key={r.id} data-status={r.status}><span className="nr-td-run-dot" aria-hidden="true"/><span>{stageName(r.stepId)}<small>{runnerOf(r)}</small></span><small>{active(r)?(r.status==='queued'?'排队中':'执行中'):r.status==='failed'?(runErrors[r.error||'']||'失败'):took(r)}</small></li>)}</ul></div>}
  {(data.related||[]).length>0&&<div className="nr-td-card"><h3>前后任务</h3>{data.related!.map(r=><button key={r.id} type="button" className="nr-link nr-td-related" onClick={()=>navigate(`/actions/${r.id}`)}>{r.relation==='prev'?'上一步：':'下一步：'}{r.title}</button>)}</div>}
  {pbKind==='build'&&<EffectCard w={w}/>}
 </div>;
}
