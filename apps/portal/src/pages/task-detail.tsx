import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {ReachDetailLayout} from '@/components/reach-detail-layout';
import {useUnsavedWarning} from './reach-data';
import {ContentAssociation} from './work-content';
import {workColumns,workState,type TaskData as Data,type Work} from './task-execution-types';
import {playbookRequest,executorOf,deliverableOf,kindLabels,stageExecutor,stagesFor,producesOutput,eventText,type PlaybookList,type Stage} from './playbook-model';
import './strategy/strategy.css';
import './reach-workspace.css';
import './task-execution.css';
import './task-detail.css';
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
type Signal={key:string;source:string;title:string;facts:string[]};
const sourceNames:Record<string,string>={gsc:'Search Console',ga4:'GA4',site:'网站内容',github:'GitHub','github-traffic':'GitHub Traffic',discourse:'社区论坛'};
const runErrors:Record<string,string>={provider_failed_or_unknown:'在线 AI 没有返回结果',interrupted_or_unknown:'运行中断，结果未知',context_changed:'任务内容在运行前已变化'};
const call=<T,>(projectId:number,taskId:string,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId,...body},unwrap:'data'});
// Tasks run by a playbook (new tasks, and tasks started with a flow) use this page; older step-plan tasks keep theirs.
export function isPlaybookTask(d:Data){const w=d.work;return Boolean(w.playbook||w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const when=(iso?:string)=>iso?new Date(iso).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
export function TaskDetail({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 const navigate=useNavigate();const [data,setData]=useState<Data>(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[list,setList]=useState<PlaybookList>(),[dirty,setDirty]=useState(false);
 const pending=useRef(false),op=useRef({key:'',id:''});useUnsavedWarning(dirty);
 const w=data.work,runActive=data.runs.some(r=>r.status==='queued'||r.status==='running');
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setList).catch(()=>undefined);},[projectId]);
 useEffect(()=>{if(!runActive)return;const t=setInterval(()=>{if(!pending.current)void call<Data>(projectId,taskId,'get').then(setData).catch(()=>undefined);},3000);return()=>clearInterval(t);},[runActive,projectId,taskId]);
 const update:Update=async(command,body={})=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');const key=JSON.stringify([data.work.revision,command,body]);if(op.current.key!==key)op.current={key,id:crypto.randomUUID()};
  try{const d=await call<Data>(projectId,taskId,'advance',{revision:data.work.revision,requestId:op.current.id,command,...body});setData(d);setDirty(false);return d;}catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试。');}finally{pending.current=false;setBusy(false);}};
 const stages:Stage[]=w.flow?.stages||[],index=w.stageIndex||0,stage=stages[index],started=Boolean(w.flow),done=w.stage==='done';
 const kind=w.playbook?.kind||(stages.some(s=>s.kind==='agent')?'build':'plan'),executor=executorOf[kind],state=workState(w);
 const lastRun=[...data.runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
 return <div className="nr-app nr-task-page">
  <div className="nr-task-top"><Button variant="link" onClick={()=>{if(!dirty||confirm('放弃未保存的内容并返回？'))navigate('/actions');}}>← 任务</Button></div>
  <ReachDetailLayout asideLabel="任务属性" main={<div className="nr-task-main">
   <header className="nr-task-head"><h1>{data.task.title}</h1>
    <p className="nr-task-meta"><span className={'nr-pill nr-state-'+state}>{workColumns[state]}</span>{started&&<span>{w.playbook?.name||w.flow?.name} · {executor}</span>}{runActive&&<span className="nr-live">{executor}正在{stage?.name||'执行'}…</span>}</p></header>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   {!started?<StartCard data={data} list={list} update={update} busy={busy}/>:done?<DoneCard w={w}/>:<CurrentCard key={`${w.stageIndex||0}:${w.flow?.stages[w.stageIndex||0]?.key}`} data={data} update={update} busy={busy} runActive={runActive} lastRun={lastRun} list={list} onDirty={setDirty}/>}
   <EvidenceCard data={data}/>
   <OutputsCard data={data}/>
   <ActivityCard data={data} update={update} busy={busy} executor={started?executor:'执行者'} onDirty={setDirty}/>
  </div>} aside={<Aside data={data} list={list} projectId={projectId} busy={busy||runActive} update={update}/>}/>
 </div>;
}
function StartCard({data,list,update,busy}:{data:Data;list?:PlaybookList;update:Update;busy:boolean}){
 const [id,setId]=useState(data.work.playbookId||data.playbookDefault||'optimize-page'),[note,setNote]=useState('');
 const p=list?.playbooks.find(x=>x.id===id),handoff=(data.task.evidence?.handoff as {playbook?:string}|undefined);
 return <section className="nr-panel nr-task-card nr-task-start" aria-label="开始任务">
  <h2>开始前</h2>
  {handoff&&<p className="nr-footnote">这个任务由“{handoff.playbook}”交接而来，它交付的文档就是任务说明。</p>}
  <label className="nr-field">做法<select aria-label="做法" value={id} disabled={busy||!list} onChange={e=>setId(e.target.value)}>
   {(['plan','build'] as const).map(k=><optgroup key={k} label={`${kindLabels[k]} · ${executorOf[k]}`}>{(list?.playbooks||[]).filter(x=>x.kind===k).map(x=><option key={x.id} value={x.id}>{x.name}{x.id===data.playbookDefault?'（推荐）':''}</option>)}</optgroup>)}
  </select></label>
  {p&&<><p>{p.description}</p><p className="nr-footnote">由{executorOf[p.kind]}执行，{deliverableOf[p.kind]}。</p>
   <ol className="nr-flow-preview" aria-label="步骤预览">{stagesFor(p).map(s=><li key={s.key}>{s.name}<small>{stageExecutor[s.kind]}</small></li>)}</ol></>}
  <label className="nr-field">补充说明（可选）<textarea aria-label="补充说明" rows={3} value={note} disabled={busy} placeholder="例如：只改英文版；语气保持技术文档风格" onChange={e=>setNote(e.target.value)}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!p} onClick={()=>void update('startTask',{playbookId:id,note})}>开始</Button></div>
  {p?.kind==='build'&&<p className="nr-footnote">本机 Agent 接入前，每一步可以由你完成并记录，任务照常推进。</p>}
 </section>;
}
function CurrentCard({data,update,busy,runActive,lastRun,list,onDirty}:{data:Data;update:Update;busy:boolean;runActive:boolean;lastRun?:Data['runs'][number];list?:PlaybookList;onDirty:(v:boolean)=>void}){
 const w=data.work,stages=w.flow!.stages,index=w.stageIndex||0,stage=stages[index];
 const navigate=useNavigate();const [manual,setManual]=useState(false),[scopeOk,setScopeOk]=useState(false);
 const [checked,setChecked]=useState<string[]>([]),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[record,setRecord]=useState(''),[note,setNote]=useState(''),[url,setUrl]=useState('');
 const last=stages.slice(index+1).every(s=>s.kind==='observe'),nextOptions=w.playbook?.kind==='plan'&&last?w.playbook.next:[];
 const [next,setNext]=useState(nextOptions[0]||'');
 useEffect(()=>{setChecked([]);setEditing(false);setRecord('');onDirty(false);},[stage.key,index]);
 const act=(command:string,body:object)=>update(command,{stageKey:stage.key,...body});
 const name=(id:string)=>list?.playbooks.find(p=>p.id===id)?.name||id;
 if(stage.kind==='ai')return <section className="nr-panel nr-task-card" aria-label="当前进度">
  {runActive?<p role="status" className="nr-step-status">在线 AI 正在{stage.name}，完成后会出现在这里等你审核。</p>
  :<>{lastRun?.status==='failed'?<p role="alert" className="nr-error">上次运行没有完成：{runErrors[lastRun.error||'']||lastRun.error||'原因未知'}。已有内容不受影响。</p>:<p>“{stage.name}”由在线 AI 完成，尚未开始。</p>}
   <div className="nr-step-actions"><Button disabled={busy} onClick={()=>void act('retryStage',{})}>{lastRun?'重试':'开始'}</Button></div></>}
 </section>;
 if(stage.kind==='review'){
  const producer=stages[index-1],out=w.results[index-1];
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(out?.pr?.outOfScope?.length&&!scopeOk);
  const label=nextOptions.length&&next?`接受，交给${executorOf.build}“${name(next)}”`:stages[index+1]?.kind==='agent'?`通过，交给${stageExecutor.agent}`:stages[index+1]?.kind==='publish'?'通过，去发布':'接受';
  return <section className="nr-panel nr-task-card nr-waiting" aria-label="等你处理">
   <h2>等你处理：{stage.name}</h2>
   {!out?<p role="alert" className="nr-error">没有可审核的内容，请刷新后重试。</p>:<>
   <p className="nr-footnote">{producer.name} · {stageExecutor[producer.kind]}{out.manual?'（你记录的）':''} · 第 {out.version} 版</p>
   {editing?<textarea className="nr-stage-edit" aria-label="编辑内容" rows={16} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);onDirty(true);}}/>:<div className="nr-stage-output">{out.content}</div>}
   {!editing&&out.pr&&<div className="nr-pr-card"><a className="nr-link" href={out.pr.url} target="_blank" rel="noreferrer">PR #{out.pr.number} · 在 GitHub 查看改动</a><small>分支 {out.pr.branch}{out.pr.headSha?` · 提交 ${out.pr.headSha.slice(0,7)}`:''}</small>
    {out.pr.checks&&<p className={out.pr.checks.ok?'nr-check-ok':'nr-error'}>{out.pr.checks.summary}</p>}
    {out.pr.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/> 超出允许范围：{out.pr.outOfScope.join('、')}。我已看过，确认这些改动没有问题</label>:null}
    <ul className="nr-pr-files">{out.pr.files.slice(0,20).map(f=><li key={f.path}><code>{f.path}</code><span>+{f.additions} −{f.deletions}</span></li>)}{out.pr.files.length>20&&<li>还有 {out.pr.files.length-20} 个文件</li>}</ul></div>}
   {!editing&&(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>确认以下事项</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':'（可选）'}</label>)}</fieldset>}
   {!editing&&nextOptions.length>0&&<label className="nr-inline-field nr-next-field">接着做<select aria-label="接着做" value={next} disabled={busy} onChange={e=>setNext(e.target.value)}>{nextOptions.map(id=><option key={id} value={id}>{name(id)}（{executorOf.build}）</option>)}<option value="">不接着做</option></select></label>}
   <div className="nr-step-actions">{editing?<><Button disabled={busy||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft}).then(d=>{if(d)setEditing(false);})}>保存修改</Button><Button variant="ghost" onClick={()=>{setEditing(false);onDirty(false);}}>取消</Button></>
    :<><Button variant="ghost" disabled={busy} onClick={()=>{setDraft(out.content);setEditing(true);}}>直接编辑</Button><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,...(nextOptions.length&&next?{next}:{}),...(out.pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}>{label}</Button></>}</div>
   {!editing&&<p className="nr-footnote">要修改？在下方动态里写意见，发送后{stageExecutor[producer.kind]}会按意见重做。</p>}</>}
  </section>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  const agent=data.agent,cur=data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const active=cur&&(cur.status==='queued'||cur.status==='running'),events=(data.agentEvents||[]).slice(-8);
  const failText:Record<string,string>={cancelled:'已停止，没有推送任何改动',no_changes:'Agent 没有修改任何文件',agent_failed:'执行没有完成，详情见上方记录',interrupted_or_unknown:'运行中断，结果未知',replaced_by_manual:'已改为由你完成'};
  return <section className={'nr-panel nr-task-card'+(active?'':' nr-waiting')} aria-label="当前进度">
   <h2>{active?`本机 Agent：${stage.name}`:`等你处理：${stage.name}`}</h2>
   {!agent?.repo?<p>还没有接入网站源码仓库，本机 Agent 不知道去哪里修改。<Button variant="link" onClick={()=>navigate('/connections?source=repo')}>去数据接入</Button></p>
   :cur?.status==='queued'?<p role="status">{agent.online?'已交给本机 Agent，马上开始。':<>等本机 Agent 领取：现在没有在线的电脑，电脑上的 Agent 启动后会自动开始。<Button variant="link" onClick={()=>navigate('/agents')}>查看电脑</Button></>}</p>
   :cur?.status==='running'?<><p role="status" className="nr-step-status">本机 Agent 正在{stage.name}{cur.cancelRequested?'（正在停止）':''}…</p>{events.length>0&&<ol className="nr-agent-events" aria-label="执行记录">{events.map((e,i)=><li key={i} data-type={e.type}>{e.text}</li>)}</ol>}</>
   :cur?.status==='failed'?<><p role="alert" className="nr-error">上次运行：{failText[cur.error||'']||cur.error||'没有完成'}。</p>{events.length>0&&<ol className="nr-agent-events" aria-label="执行记录">{events.map((e,i)=><li key={i} data-type={e.type}>{e.text}</li>)}</ol>}</>
   :<p>这一步由本机 Agent 完成：{stage.instruction}</p>}
   {approved&&source&&<details className="nr-stage-source"><summary>已通过的{source.name}</summary><div className="nr-stage-output">{approved.content}</div></details>}
   {!manual&&<div className="nr-step-actions">
    {active&&<Button variant="outline" disabled={busy||Boolean(cur.cancelRequested)} onClick={()=>void update('cancelRun',{runId:cur.id})}>停止</Button>}
    {cur?.status!=='running'&&<Button variant="ghost" disabled={busy} onClick={()=>setManual(true)}>我自己完成</Button>}
    {!active&&agent?.repo&&<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?'重试':'交给本机 Agent'}</Button>}
   </div>}
   {manual&&<><label className="nr-field">{stage.key==='plan'?'方案':'修改记录'}<textarea aria-label={stage.key==='plan'?'方案':'修改记录'} rows={4} value={record} disabled={busy} placeholder={stage.key==='plan'?'要改哪些文件和段落、改成什么':'PR 链接，或改了哪些文件、哪些内容'} onChange={e=>{setRecord(e.target.value);onDirty(Boolean(e.target.value));}}/></label>
    <div className="nr-step-actions"><Button variant="ghost" onClick={()=>{setManual(false);onDirty(false);}}>取消</Button><Button disabled={busy||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>记录并继续</Button></div></>}
  </section>;
 }
 return <section className="nr-panel nr-task-card nr-waiting" aria-label="等你处理">
  <h2>等你处理：确认发布</h2>
  <p>PR 审核已通过。合并并上线后在这里确认，之后开始观察效果。</p>
  <p className="nr-footnote">在 NocoReach 内一键合并与上线核实将在后续版本接入。</p>
  <label className="nr-field">发布后的页面（可选）<input aria-label="发布后的页面" value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label>
  <label className="nr-field">发布说明<textarea aria-label="发布说明" rows={3} value={note} disabled={busy} placeholder="合并了哪个 PR、何时上线" onChange={e=>setNote(e.target.value)}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>确认已发布</Button></div>
 </section>;
}
function DoneCard({w}:{w:Work}){
 return <section className="nr-panel nr-task-card" aria-label="已完成"><h2>已完成</h2>
  {w.receipt?.note&&<p>已发布：{w.receipt.note}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">打开页面</a></>}</p>}
  <p className="nr-footnote">{w.observeFrom?`效果观察从 ${new Date(w.observeFrom).toLocaleDateString()} 开始，第 7、28 天自动对比将在后续版本提供。`:'交付的内容保存在下方成果中。'}</p></section>;
}
function EvidenceCard({data}:{data:Data}){
 const ev=(data.task.evidence||{}) as {insight?:{signalIds?:string[]};context?:{signals?:{items?:Signal[]}};handoff?:{playbook?:string;content?:string}};
 const ids=new Set(ev.insight?.signalIds||[]),signals=(ev.context?.signals?.items||[]).filter(s=>ids.has(s.key));
 return <section className="nr-panel nr-task-card" aria-label="依据"><h2>依据</h2>
  {signals.length>0&&<div className="nr-task-signals">{signals.map(s=><div key={s.key}><span>{sourceNames[s.source]||s.source}</span><b>{s.title}</b>{s.facts.slice(0,3).map(f=><small key={f}>{f}</small>)}</div>)}</div>}
  {ev.handoff?.content?<details className="nr-stage-source" open><summary>“{ev.handoff.playbook}”交付的文档（任务说明）</summary><div className="nr-stage-output">{ev.handoff.content}</div></details>:<details className="nr-stage-source"><summary>任务说明</summary><div className="nr-stage-output">{data.task.brief}</div></details>}
  {data.work.note&&<p className="nr-footnote">你的补充说明：{data.work.note}</p>}
 </section>;
}
function OutputsCard({data}:{data:Data}){
 const w=data.work,stages=w.flow?.stages||[],rows=stages.map((s,i)=>({s,r:w.results[i]})).filter(x=>producesOutput(x.s)&&x.r);
 if(!rows.length)return null;
 return <section className="nr-panel nr-task-card" aria-label="成果"><h2>成果</h2>{rows.map(({s,r})=><details key={s.key} className="nr-stage-source"><summary>{s.name} · 第 {r!.version} 版{r!.manual?' · 你记录的':''}{r!.approvedAt?' · 已通过':r!.rejectedAt?' · 已退回':''}</summary><div className="nr-stage-output">{r!.content}</div></details>)}</section>;
}
function ActivityCard({data,update,busy,executor,onDirty}:{data:Data;update:Update;busy:boolean;executor:string;onDirty:(v:boolean)=>void}){
 const [text,setText]=useState(''),w=data.work,stages=w.flow?.stages||[],stage=stages[w.stageIndex||0],done=w.stage==='done';
 const reviewing=Boolean(w.flow)&&!done&&stage?.kind==='review'&&w.results[(w.stageIndex||0)-1];
 const nameOf=(key?:string)=>stages.find(s=>s.key===key)?.name||'这一步';
 const rows=(w.history||[]).map(e=>({e,t:eventText(e,nameOf,executor)})).filter(x=>x.t);
 async function send(){const d=reviewing?await update('requestStageChanges',{stageKey:stage.key,artifactId:w.results[(w.stageIndex||0)-1]!.id,comment:text}):await update('comment',{comment:text});if(d){setText('');onDirty(false);}}
 return <section className="nr-panel nr-task-card" aria-label="动态"><h2>动态</h2>
  {rows.length?<ol className="nr-activity">{rows.map(({e,t},i)=><li key={i}><b>{t!.who}</b><span>{t!.text}</span><time>{when(e.at)}</time></li>)}</ol>:<p className="nr-muted">还没有动态。</p>}
  {!done&&<div className="nr-activity-input"><textarea aria-label="给执行者的话" rows={2} value={text} disabled={busy} placeholder={reviewing?`写修改意见，发送后${stageExecutor[stages[(w.stageIndex||0)-1].kind]}会按意见重做`:`给${executor}留言，下一次运行会读到`} onChange={e=>{setText(e.target.value);onDirty(Boolean(e.target.value));}}/><Button disabled={busy||!text.trim()} onClick={()=>void send()}>{reviewing?'发送并要求修改':'发送'}</Button></div>}
 </section>;
}
function Aside({data,list,projectId,busy,update}:{data:Data;list?:PlaybookList;projectId:number;busy:boolean;update:Update}){
 const navigate=useNavigate(),w=data.work,started=Boolean(w.flow),done=w.stage==='done',index=w.stageIndex||0;
 const preview=started?w.flow!.stages:(()=>{const p=list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault));return p?stagesFor(p):[];})();
 const pbName=w.playbook?.name||w.flow?.name||list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault))?.name;
 const pbKind=w.playbook?.kind||list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault))?.kind;
 return <div className="nr-task-aside">
  <section><h3>做法</h3><p>{pbName||'—'}{!started&&pbName?'（尚未开始）':''}</p>{pbKind&&<p className="nr-footnote">{kindLabels[pbKind]} · {executorOf[pbKind]}</p>}</section>
  <section><h3>进度</h3><ol className="nr-task-progress">{preview.filter(s=>s.kind!=='observe').map((s,i)=><li key={s.key} data-state={!started?'todo':done||i<index?'done':i===index?'current':'todo'}><span>{started&&(done||i<index)?'✓ ':''}{s.name}</span><small>{stageExecutor[s.kind]}</small></li>)}</ol></section>
  <section><h3>负责人</h3><p>{w.humanOwnerName||'—'}</p></section>
  <ContentAssociation compact projectId={projectId} contentId={w.contentId} disabled={busy||started} onLink={id=>void update('linkContent',{contentId:id})}/>
  {(data.related||[]).length>0&&<section><h3>前后任务</h3>{data.related!.map(r=><p key={r.id}><button className="nr-link" onClick={()=>navigate(`/actions/${r.id}`)}>{r.relation==='prev'?'上一步：':'下一步：'}{r.title}</button></p>)}</section>}
  {pbKind==='build'&&<section><h3>效果观察</h3><p className="nr-footnote">{w.observeFrom?`从 ${new Date(w.observeFrom).toLocaleDateString()} 开始，第 7、28 天对比`:'上线后开始'}</p></section>}
 </div>;
}
