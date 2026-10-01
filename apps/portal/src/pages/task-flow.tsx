import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {flowRequest,executorLabels,nextLabel,producesOutput,type FlowList,type Stage} from './flow-model';
import type {TaskData as Data,Work} from './task-execution-types';
import './flows.css';
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
// New tasks start with a flow; tasks that already had a step plan keep the earlier page.
export function isFlowTask(d:Data){const w=d.work;return Boolean(w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const runErrors:Record<string,string>={provider_failed_or_unknown:'在线 AI 没有返回结果',interrupted_or_unknown:'运行中断，结果未知',context_changed:'任务内容在运行前已变化'};
export function FlowPanel({projectId,data,update,locked,runActive}:{projectId:number;data:Data;update:Update;locked:boolean;runActive:boolean}){
 const w=data.work;
 if(!w.flow)return <section className="nr-panel nr-step-panel"><FlowStart projectId={projectId} data={data} update={update} locked={locked}/></section>;
 const stages=w.flow.stages,index=w.stageIndex||0,done=w.stage==='done',stage=stages[index];
 return <>
  <ol className="nr-stepper nr-flow-stepper" aria-label="流程阶段">{stages.map((s,i)=><li key={s.key} data-state={done||i<index?'done':i===index?'current':'todo'} aria-current={!done&&i===index?'step':undefined}><span>{i+1}</span><div>{s.name}<small>{executorLabels[s.kind]}</small></div></li>)}</ol>
  <section className="nr-panel nr-step-panel">{done?<FlowDone w={w}/>:<StageBody key={stage.key+':'+index} data={data} update={update} locked={locked} runActive={runActive}/>}</section>
  <FlowOutputs data={data}/>
 </>;
}
function FlowStart({projectId,data,update,locked}:{projectId:number;data:Data;update:Update;locked:boolean}){
 const [list,setList]=useState<FlowList>(),[flowId,setFlowId]=useState(data.work.flowId||data.flowDefault||'site-change'),[note,setNote]=useState(''),[error,setError]=useState('');
 useEffect(()=>{void flowRequest<FlowList>('list',projectId).then(setList).catch(()=>setError('读取流程失败，请刷新后重试。'));},[projectId]);
 const flow=list?.flows.find(f=>f.id===flowId);
 return <>
  <label className="nr-inline-field">流程<select aria-label="流程" value={flowId} disabled={locked||!list} onChange={e=>setFlowId(e.target.value)}>{(list?.flows||[]).map(f=><option key={f.id} value={f.id}>{f.name}{f.id===data.flowDefault?'（推荐）':''}</option>)}</select></label>
  {flow&&<><p className="nr-footnote">{flow.description}</p><ol className="nr-flow-preview" aria-label="流程阶段预览">{flow.stages.map(s=><li key={s.key}>{s.name}<small>{executorLabels[s.kind]}</small></li>)}</ol></>}
  <label className="nr-field">给 AI 的补充说明（可选）<textarea aria-label="给 AI 的补充说明" rows={3} value={note} disabled={locked} placeholder="例如：只改英文版；语气保持技术文档风格" onChange={e=>setNote(e.target.value)}/></label>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  <div className="nr-step-actions"><Button disabled={locked||!flow} onClick={()=>void update('startFlow',{flowId,note})}>开始</Button></div>
  {flow&&producesOutput(flow.stages[0])&&<p className="nr-footnote">{flow.stages[0].kind==='ai'?`开始后在线 AI 会先${flow.stages[0].name}，完成后等你审核。`:`第一步“${flow.stages[0].name}”由本机 Agent 完成。`}流程开始后不能更换。</p>}
 </>;
}
function StageBody({data,update,locked,runActive}:{data:Data;update:Update;locked:boolean;runActive:boolean}){
 const w=data.work,stages=w.flow!.stages,index=w.stageIndex||0,stage=stages[index];
 const [checked,setChecked]=useState<string[]>([]),[comment,setComment]=useState(''),[changing,setChanging]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[record,setRecord]=useState(''),[note,setNote]=useState(''),[url,setUrl]=useState('');
 const lastRun=[...(data.runs||[])].filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
 async function act(command:string,body:object){const d=await update(command,{stageKey:stage.key,...body});if(d){setChanging(false);setEditing(false);setComment('');}}
 if(stage.kind==='ai'){
  if(runActive)return <p role="status" className="nr-step-status">在线 AI 正在{stage.name}…完成后自动进入下一步。</p>;
  return <>{lastRun?.status==='failed'?<p role="alert" className="nr-error">上次运行失败：{runErrors[lastRun.error||'']||lastRun.error||'原因未知'}。已有内容不受影响。</p>:<p>“{stage.name}”由在线 AI 完成，尚未开始。</p>}
   <div className="nr-step-actions"><Button disabled={locked} onClick={()=>void act('retryStage',{})}>{lastRun?'重试':'开始'}</Button></div></>;
 }
 if(stage.kind==='review'){
  const producer=stages[index-1],out=w.results[index-1];if(!out)return <p role="alert" className="nr-error">没有可审核的内容，请刷新后重试。</p>;
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key));
  return <>
   <p className="nr-footnote">{producer.name} · {executorLabels[producer.kind]}{out.manual?'（人工记录）':''} · 第 {out.version} 版</p>
   {editing?<label className="nr-field">编辑内容<textarea aria-label="编辑内容" rows={16} value={draft} disabled={locked} onChange={e=>setDraft(e.target.value)}/></label>:<div className="nr-readable nr-stage-output">{out.content}</div>}
   {!editing&&!changing&&(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>确认以下事项</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={locked} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':'（可选）'}</label>)}</fieldset>}
   {changing&&<label className="nr-field">修改意见<textarea aria-label="修改意见" rows={3} value={comment} disabled={locked} onChange={e=>setComment(e.target.value)}/></label>}
   <div className="nr-step-actions">{editing?<><Button disabled={locked||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft})}>保存修改</Button><Button variant="ghost" onClick={()=>setEditing(false)}>取消</Button></>
    :changing?<><Button variant="outline" disabled={locked||!comment.trim()} onClick={()=>void act('requestStageChanges',{artifactId:out.id,comment})}>发送修改意见</Button><Button variant="ghost" onClick={()=>setChanging(false)}>取消</Button></>
    :<><Button disabled={locked||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked})}>{nextLabel(stages,index)}</Button><Button variant="outline" disabled={locked} onClick={()=>setChanging(true)}>要求修改</Button><Button variant="ghost" disabled={locked} onClick={()=>{setDraft(out.content);setEditing(true);}}>直接编辑</Button></>}</div>
   {changing&&<p className="nr-footnote">{producer.kind==='ai'?`发送后在线 AI 会按意见重新${producer.name}。`:`发送后回到“${producer.name}”，按意见修改后重新记录。`}</p>}
  </>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  return <>
   <p>“{stage.name}”由本机 Agent 完成：{stage.instruction}</p>
   <p className="nr-footnote">本机 Agent 接入后会自动执行这一步。现在可以自己按已批准的内容修改，完成后记录 PR 链接或修改说明，流程继续。</p>
   {approved&&source&&<details className="nr-stage-source"><summary>已批准的{source.name}</summary><div className="nr-readable nr-stage-output">{approved.content}</div></details>}
   <label className="nr-field">修改记录<textarea aria-label="修改记录" rows={4} value={record} disabled={locked} placeholder="PR 链接，或改了哪些文件、哪些内容" onChange={e=>setRecord(e.target.value)}/></label>
   <div className="nr-step-actions"><Button disabled={locked||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>记录并继续</Button></div>
  </>;
 }
 return <>
  <p>审核已通过。合并并上线后在这里确认，之后开始观察效果。</p>
  <p className="nr-footnote">在 NocoReach 内一键合并与上线核实将在后续版本接入。</p>
  <label className="nr-field">发布后的页面（可选）<input aria-label="发布后的页面" value={url} disabled={locked} onChange={e=>setUrl(e.target.value)}/></label>
  <label className="nr-field">发布说明<textarea aria-label="发布说明" rows={3} value={note} disabled={locked} placeholder="合并了哪个 PR、何时上线" onChange={e=>setNote(e.target.value)}/></label>
  <div className="nr-step-actions"><Button disabled={locked||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>确认已发布</Button></div>
 </>;
}
function FlowDone({w}:{w:Work}){
 return <>
  <p>已完成。</p>
  {w.receipt?.note&&<p>已发布：{w.receipt.note}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">打开页面</a></>}</p>}
  {w.observeFrom?<p className="nr-footnote">效果观察从 {new Date(w.observeFrom).toLocaleDateString()} 开始；第 7、28 天的自动对比将在后续版本提供。</p>:<p className="nr-footnote">各阶段成果保存在下方。</p>}
 </>;
}
function FlowOutputs({data}:{data:Data}){
 const w=data.work,stages:Stage[]=w.flow?.stages||[];const rows=stages.map((s,i)=>({s,r:w.results[i]})).filter(x=>producesOutput(x.s)&&x.r);
 if(!rows.length)return null;
 return <details className="nr-panel nr-flow-outputs"><summary>各阶段成果（{rows.length}）</summary>{rows.map(({s,r})=><section key={s.key}><h3>{s.name}<span className="nr-footnote"> · 第 {r!.version} 版{r!.manual?' · 人工记录':''}{r!.approvedAt?' · 已通过':r!.rejectedAt?' · 已退回':''}</span></h3><div className="nr-readable nr-stage-output">{r!.content}</div></section>)}</details>;
}
