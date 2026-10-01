import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router';
import {Button} from '@/components/ui/button';
import {useProject,useUnsavedWarning} from './reach-data';
import {flowRequest,flowProblems,kindLabels,executorLabels,producesOutput,type Flow,type FlowList,type Stage,type StageKind} from './flow-model';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-execution.css';
import './flows.css';
const kinds:StageKind[]=['ai','agent','review','publish','observe'];
export default function FlowsPage(){
 const {project,error:projectError}=useProject();const [params,setParams]=useSearchParams();
 const [list,setList]=useState<FlowList>(),[draft,setDraft]=useState<Flow|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useUnsavedWarning(dirty);
 const selectedId=params.get('flow')||list?.flows[0]?.id||'';const selected=list?.flows.find(f=>f.id===selectedId);
 useEffect(()=>{if(!project)return;void flowRequest<FlowList>('list',project.id).then(setList).catch(()=>setError('读取流程失败，请刷新后重试。'));},[project?.id]);
 useEffect(()=>{setDraft(selected&&!selected.system?structuredClone(selected):null);setDirty(false);},[selected?.id,selected?.version]);
 function pick(id:string){if(dirty&&!confirm('放弃未保存的修改？'))return;setNotice('');setError('');const p=new URLSearchParams(params);p.set('flow',id);setParams(p,{replace:true});}
 async function call(action:'save'|'copy'|'remove',body:object,done:string){if(!project||!list)return;setBusy(true);setError('');setNotice('');try{const r=await flowRequest<FlowList&{flow:Flow|null}>(action,project.id,{revision:list.revision,...body});setList(r);setDirty(false);setNotice(done);const p=new URLSearchParams(params);if(r.flow)p.set('flow',r.flow.id);else p.delete('flow');setParams(p,{replace:true});}catch(e){setError(e instanceof Error?e.message:'保存失败，请重试。');}finally{setBusy(false);}}
 function edit(next:Flow){setDraft(next);setDirty(true);setNotice('');}
 function stage(i:number,patch:Partial<Stage>){if(!draft)return;const stages=draft.stages.map((s,j)=>j===i?{...s,...patch}:s);edit({...draft,stages});}
 function move(i:number,d:number){if(!draft)return;const stages=[...draft.stages];const [s]=stages.splice(i,1);stages.splice(i+d,0,s);edit({...draft,stages});}
 const problems=draft?flowProblems(draft.stages):[];
 return <main className="nr-app nr-discovery"><header className="nr-heading"><div><h1>流程</h1><p className="nr-muted">任务按流程推进：每个阶段由在线 AI、本机 Agent 或你来完成。系统流程可以复制后修改；修改不影响已经开始的任务。</p></div></header>
  {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {!list?<p role="status">正在读取流程…</p>:<div className="nr-flow-layout">
   <nav className="nr-flow-list" aria-label="流程列表">{list.flows.map(f=><button key={f.id} type="button" aria-current={f.id===selectedId} onClick={()=>pick(f.id)}>{f.name}<small>{f.system?'系统 · 可复制':'自定义'} · {f.stages.length} 个阶段</small></button>)}</nav>
   {selected&&<section className="nr-panel">
    {selected.system||!draft?<>
     <header className="nr-heading"><div><h2>{selected.name}</h2><p className="nr-footnote">{selected.description}</p></div><Button disabled={busy} onClick={()=>void call('copy',{flowId:selected.id},'已复制，可以开始修改。')}>复制为自定义流程</Button></header>
     <div className="nr-flow-stages">{selected.stages.map((s,i)=><StageView key={s.key} stage={s} index={i}/>)}</div>
    </>:<>
     <label className="nr-field">名称<input aria-label="流程名称" value={draft.name} maxLength={40} disabled={busy} onChange={e=>edit({...draft,name:e.target.value})}/></label>
     <label className="nr-field">说明<input aria-label="流程说明" value={draft.description} maxLength={200} disabled={busy} onChange={e=>edit({...draft,description:e.target.value})}/></label>
     <div className="nr-flow-stages">{draft.stages.map((s,i)=><article key={i} className="nr-flow-stage" data-kind={s.kind}>
      <div className="nr-flow-stage-edit">
       <label className="nr-field">第 {i+1} 个阶段<input aria-label={`第 ${i+1} 个阶段名称`} value={s.name} maxLength={40} disabled={busy} onChange={e=>stage(i,{name:e.target.value})}/></label>
       <label className="nr-field">由谁完成<select aria-label={`第 ${i+1} 个阶段由谁完成`} value={s.kind} disabled={busy} onChange={e=>{const kind=e.target.value as StageKind;stage(i,{kind,instruction:producesOutput({...s,kind})?s.instruction||'':undefined,checklist:kind==='review'?s.checklist||[]:undefined});}}>{kinds.map(k=><option key={k} value={k}>{kindLabels[k]}</option>)}</select></label>
       <div className="nr-step-actions"><Button size="sm" variant="ghost" disabled={busy||i===0} aria-label="上移" onClick={()=>move(i,-1)}>↑</Button><Button size="sm" variant="ghost" disabled={busy||i===draft.stages.length-1} aria-label="下移" onClick={()=>move(i,1)}>↓</Button><Button size="sm" variant="ghost" disabled={busy||draft.stages.length===1} onClick={()=>edit({...draft,stages:draft.stages.filter((_,j)=>j!==i)})}>删除</Button></div>
      </div>
      {producesOutput(s)&&<label className="nr-field">{s.kind==='ai'?'给在线 AI 的指令':'给本机 Agent 的指令'}<span className="nr-footnote">AI 会自动读取任务、依据、关联页面、项目记忆和此前各阶段的成果，这里只写这一步要做什么。</span><textarea aria-label={`第 ${i+1} 个阶段指令`} rows={3} maxLength={4000} value={s.instruction||''} disabled={busy} onChange={e=>stage(i,{instruction:e.target.value})}/></label>}
      {s.kind==='review'&&<div><p className="nr-footnote">审核时需要确认的事项（必选项未勾选时不能通过）</p>{(s.checklist||[]).map((c,j)=><div key={j} className="nr-flow-check"><input type="text" aria-label="检查项" value={c.label} maxLength={120} disabled={busy} onChange={e=>stage(i,{checklist:s.checklist!.map((x,k)=>k===j?{...x,label:e.target.value}:x)})}/><label><input type="checkbox" checked={c.required} disabled={busy} onChange={e=>stage(i,{checklist:s.checklist!.map((x,k)=>k===j?{...x,required:e.target.checked}:x)})}/> 必选</label><Button size="sm" variant="ghost" disabled={busy} onClick={()=>stage(i,{checklist:s.checklist!.filter((_,k)=>k!==j)})}>移除</Button></div>)}
       <Button size="sm" variant="outline" disabled={busy||(s.checklist||[]).length>=10} onClick={()=>stage(i,{checklist:[...(s.checklist||[]),{key:'',label:'',required:true}]})}>添加检查项</Button></div>}
      {(s.kind==='publish'||s.kind==='observe')&&<p className="nr-footnote">{s.kind==='publish'?'系统阶段：由你确认后按审核过的提交合并，并核实上线。':'系统阶段：上线后第 7、28 天对比数据。'}</p>}
     </article>)}</div>
     <Button variant="outline" disabled={busy||draft.stages.length>=12} onClick={()=>edit({...draft,stages:[...draft.stages,{key:'',name:'',kind:'ai',instruction:''}]})}>添加阶段</Button>
     {problems.length>0&&<ul className="nr-flow-problems" aria-label="需要调整">{problems.map(p=><li key={p}>{p}</li>)}</ul>}
     <div className="nr-step-actions"><Button variant="ghost" disabled={busy} onClick={()=>{if(confirm(`删除流程“${selected.name}”？已经开始的任务不受影响。`))void call('remove',{flowId:selected.id},'已删除。');}}>删除流程</Button><Button disabled={busy||!dirty||problems.length>0||!draft.name.trim()} onClick={()=>void call('save',{flowId:draft.id,name:draft.name,description:draft.description,stages:draft.stages.map(s=>({...s,checklist:s.checklist?.filter(c=>c.label.trim())}))},'已保存。新开始的任务会使用这个版本。')}>保存</Button></div>
    </>}
   </section>}
  </div>}
 </main>;
}
function StageView({stage:s,index}:{stage:Stage;index:number}){
 return <article className="nr-flow-stage" data-kind={s.kind}><header><b>{index+1} {s.name}</b><span className="nr-footnote">{executorLabels[s.kind]}</span></header>
  {s.instruction&&<p className="nr-footnote">指令：{s.instruction}</p>}
  {s.kind==='review'&&(s.checklist?.length?<p className="nr-footnote">检查清单：{s.checklist.map(c=>c.label+(c.required?'':'（可选）')).join('；')}</p>:<p className="nr-footnote">审核通过即可继续。</p>)}
  {s.kind==='publish'&&<p className="nr-footnote">你确认后按审核过的提交合并，并核实上线。</p>}{s.kind==='observe'&&<p className="nr-footnote">上线后第 7、28 天与上线前对比。</p>}
 </article>;
}
