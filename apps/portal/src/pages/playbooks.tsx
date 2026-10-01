import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router';
import {Button} from '@/components/ui/button';
import {useProject,useUnsavedWarning} from './reach-data';
import {playbookRequest,kindLabels,executorOf,deliverableOf,stagesFor,stageExecutor,type Playbook,type PlaybookKind,type PlaybookList} from './playbook-model';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-execution.css';
import './task-detail.css';
import './playbooks.css';
const kinds:PlaybookKind[]=['plan','build'];
// 做法 (SPEC §6.0): each kind of work as a written instruction; built-in ones are copied before editing.
export default function PlaybooksPage(){
 const {project,error:projectError}=useProject();const [params,setParams]=useSearchParams();
 const [list,setList]=useState<PlaybookList>(),[draft,setDraft]=useState<Playbook|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useUnsavedWarning(dirty);
 const selected=list?.playbooks.find(p=>p.id===params.get('id'))||list?.playbooks[0];
 useEffect(()=>{if(!project)return;void playbookRequest<PlaybookList>('list',project.id).then(setList).catch(()=>setError('读取做法失败，请刷新后重试。'));},[project?.id]);
 useEffect(()=>{setDraft(selected&&!selected.system?structuredClone(selected):null);setDirty(false);},[selected?.id,selected?.version]);
 function pick(id:string){if(dirty&&!confirm('放弃未保存的修改？'))return;setNotice('');setError('');const p=new URLSearchParams(params);p.set('id',id);setParams(p,{replace:true});}
 async function call(action:'save'|'copy'|'remove',body:object,done:string){if(!project||!list)return;setBusy(true);setError('');setNotice('');try{const r=await playbookRequest<PlaybookList&{playbook:Playbook|null}>(action,project.id,{revision:list.revision,...body});setList(r);setDirty(false);setNotice(done);const p=new URLSearchParams(params);if(r.playbook)p.set('id',r.playbook.id);else p.delete('id');setParams(p,{replace:true});}catch(e){setError(e instanceof Error?e.message:'保存失败，请重试。');}finally{setBusy(false);}}
 function edit(next:Playbook){setDraft(next);setDirty(true);setNotice('');}
 const name=(id:string)=>list?.playbooks.find(p=>p.id===id)?.name||id;
 const builds=(list?.playbooks||[]).filter(p=>p.kind==='build'&&p.id!==draft?.id);
 return <main className="nr-app nr-discovery"><header className="nr-heading"><div><h1>做法</h1><p className="nr-muted">每种工作怎么做。方案类由在线 AI 出方案、交付文档；落地类由本机 Agent 落地、交付 PR。内置做法可以复制后改写，修改不影响已经开始的任务。</p></div></header>
  {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {!list?<p role="status">正在读取做法…</p>:<div className="nr-pb-layout">
   <nav className="nr-pb-list" aria-label="做法列表">{kinds.map(k=><div key={k}><h2>{kindLabels[k]} · {executorOf[k]}</h2>{list.playbooks.filter(p=>p.kind===k).map(p=><button key={p.id} type="button" aria-current={p.id===selected?.id} onClick={()=>pick(p.id)}>{p.name}<small>{p.system?'内置':'自定义'}{p.description?` · ${p.description}`:''}</small></button>)}</div>)}</nav>
   {selected&&<section className="nr-panel nr-pb-detail">
    {selected.system||!draft?<>
     <header><div><h2>{selected.name}</h2><p className="nr-footnote">{kindLabels[selected.kind]} · 由{executorOf[selected.kind]}执行，{deliverableOf[selected.kind]}</p></div><Button disabled={busy} onClick={()=>void call('copy',{playbookId:selected.id},'已复制，可以开始修改。')}>复制为自定义做法</Button></header>
     <p>{selected.description}</p>
     <h3>说明</h3><div className="nr-stage-output">{selected.instructions}</div>
     <h3>步骤</h3><ol className="nr-flow-preview">{stagesFor(selected).map(s=><li key={s.key}>{s.name}<small>{stageExecutor[s.kind]}</small></li>)}</ol>
     {selected.checklist.length>0&&<><h3>审核时确认</h3><ul>{selected.checklist.map(c=><li key={c.key}>{c.label}{c.required?'':'（可选）'}</li>)}</ul></>}
     {selected.next.length>0&&<><h3>完成后接着做</h3><p>{selected.next.map(name).join('、')}</p></>}
    </>:<>
     <label className="nr-field">名称<input aria-label="做法名称" value={draft.name} maxLength={40} disabled={busy} onChange={e=>edit({...draft,name:e.target.value})}/></label>
     <fieldset className="nr-pb-kind"><legend>类型</legend>{kinds.map(k=><label key={k}><input type="radio" name="kind" checked={draft.kind===k} disabled={busy} onChange={()=>edit({...draft,kind:k,next:k==='plan'?draft.next:[],planFirst:k==="build"?draft.planFirst??false:undefined})}/> {kindLabels[k]}：由{executorOf[k]}执行，{deliverableOf[k]}</label>)}</fieldset>
     <label className="nr-field">简介<input aria-label="做法简介" value={draft.description} maxLength={200} disabled={busy} onChange={e=>edit({...draft,description:e.target.value})}/></label>
     <label className="nr-field">说明<span className="nr-footnote">写清目标、步骤和交付什么。{executorOf[draft.kind]}会自动读取任务、依据、关联页面、项目记忆和你的补充说明。</span><textarea aria-label="做法说明" rows={6} maxLength={6000} value={draft.instructions} disabled={busy} onChange={e=>edit({...draft,instructions:e.target.value})}/></label>
     {draft.kind==='build'&&<label className="nr-pb-check"><input type="checkbox" checked={draft.planFirst===true} disabled={busy} onChange={e=>edit({...draft,planFirst:e.target.checked})}/> 动手前先给我看方案</label>}
     <div><p className="nr-footnote">审核时需要确认的事项（必选项未勾选时不能通过）</p>{draft.checklist.map((c,j)=><div key={j} className="nr-pb-item"><input type="text" aria-label="检查项" value={c.label} maxLength={120} disabled={busy} onChange={e=>edit({...draft,checklist:draft.checklist.map((x,k)=>k===j?{...x,label:e.target.value}:x)})}/><label><input type="checkbox" checked={c.required} disabled={busy} onChange={e=>edit({...draft,checklist:draft.checklist.map((x,k)=>k===j?{...x,required:e.target.checked}:x)})}/> 必选</label><Button size="sm" variant="ghost" disabled={busy} onClick={()=>edit({...draft,checklist:draft.checklist.filter((_,k)=>k!==j)})}>移除</Button></div>)}
      <Button size="sm" variant="outline" disabled={busy||draft.checklist.length>=10} onClick={()=>edit({...draft,checklist:[...draft.checklist,{key:'',label:'',required:true}]})}>添加检查项</Button></div>
     {draft.kind==='plan'&&<div><p className="nr-footnote">完成后接着做（最多 3 个，接受文档时可一键交给它们）</p><div className="nr-pb-next">{builds.map(p=><label key={p.id}><input type="checkbox" checked={draft.next.includes(p.id)} disabled={busy||(!draft.next.includes(p.id)&&draft.next.length>=3)} onChange={e=>edit({...draft,next:e.target.checked?[...draft.next,p.id]:draft.next.filter(x=>x!==p.id)})}/> {p.name}</label>)}</div></div>}
     <div className="nr-step-actions"><Button variant="ghost" disabled={busy} onClick={()=>{if(confirm(`删除做法“${selected.name}”？已经开始的任务不受影响。`))void call('remove',{playbookId:selected.id},'已删除。');}}>删除做法</Button><Button disabled={busy||!dirty||!draft.name.trim()||!draft.instructions.trim()} onClick={()=>void call('save',{playbookId:draft.id,name:draft.name,kind:draft.kind,description:draft.description,instructions:draft.instructions,planFirst:draft.planFirst,checklist:draft.checklist.filter(c=>c.label.trim()),next:draft.next},'已保存。新开始的任务会使用这个版本。')}>保存</Button></div>
    </>}
   </section>}
  </div>}
 </main>;
}
