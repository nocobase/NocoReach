import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {useProject} from './reach-data';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-execution.css';
import './agents.css';
type Computer={id:string;name:string;createdAt:string;lastSeenAt?:string;version?:string;tools?:Record<string,string>;online:boolean};
type Repo={repo:string;baseBranch:string;allowedPaths:string[];contentCheck:boolean};
type Status={revision:number;repo:Repo|null;computers:Computer[]};
const agent=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrAgent',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// Agent (SPEC §10): the online AI needs no setup; the local Agent runs on a connected computer and works on one repository.
export default function AgentsPage(){
 const {project,error:projectError}=useProject();const [st,setSt]=useState<Status>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [name,setName]=useState('我的电脑'),[key,setKey]=useState(''),[form,setForm]=useState<{repo:string;baseBranch:string;paths:string;contentCheck:boolean}>({repo:'',baseBranch:'main',paths:'',contentCheck:true});
 async function load(){if(!project)return;try{const s=await agent<Status>('status',project.id);setSt(s);setForm(f=>f.repo||!s.repo?f:{repo:s.repo.repo,baseBranch:s.repo.baseBranch,paths:s.repo.allowedPaths.join('\n'),contentCheck:s.repo.contentCheck});}catch{setError('读取 Agent 状态失败，请刷新后重试。');}}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),10000);return()=>clearInterval(t);},[project?.id]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试。');}finally{setBusy(false);}}
 const server=window.location.origin,cli='node apps/agent/dist/cli.js',commands=`node apps/agent/build.cjs\n${cli} login --server ${server} --project ${project?.id} --key ${key}\n${cli} start`;
 return <main className="nr-app nr-discovery nr-agents-page"><header className="nr-heading"><div><h1>Agent</h1><p className="nr-muted">方案类任务由在线 AI 完成，使用 NocoBase AI 设置中的模型，不需要额外设置。落地类任务由本机 Agent 在你的电脑上用 Claude Code 完成：读仓库、修改、检查，并在登记的仓库里开 PR。</p></div></header>
  {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <section className="nr-panel"><h2>电脑</h2>
   {!st?<p role="status">正在读取…</p>:st.computers.length?<ul className="nr-computers">{st.computers.map(c=><li key={c.id}><span className={'nr-dot '+(c.online?'nr-dot-on':'')} aria-hidden="true"/><b>{c.name}</b><small>{c.online?'在线':c.lastSeenAt?`离线 · 上次在线 ${new Date(c.lastSeenAt).toLocaleString()}`:'尚未连上'}{c.tools?.claude?` · Claude Code ${c.tools.claude}`:''}{c.version?` · 程序 ${c.version}`:''}</small><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm(`断开“${c.name}”？它将不能再领取任务。`))void run(async()=>{await agent('revoke',project!.id,{computerId:c.id});await load();});}}>断开</Button></li>)}</ul>:<p className="nr-muted">还没有连接电脑。</p>}
   {key?<div className="nr-connect"><p>在这台电脑上，进入 NocoReach 源码目录，依次运行下面三行。密钥只显示这一次。</p>
     <pre aria-label="连接命令">{commands}</pre>
     <div className="nr-step-actions"><Button variant="outline" onClick={()=>void navigator.clipboard?.writeText(commands).then(()=>setNotice('已复制。'))}>复制命令</Button><Button onClick={()=>{setKey('');void load();}}>完成</Button></div></div>
   :<div className="nr-connect-row"><input aria-label="电脑名称" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/><Button disabled={busy||!project} onClick={()=>void run(async()=>{const r=await agent<{key:string}>('connect',project!.id,{name});setKey(r.key);})}>连接一台电脑</Button></div>}
   <p className="nr-footnote">需要先安装 Claude Code，并用 GitHub CLI 登录（gh auth login）。程序用这台电脑上的 git 凭据推送。</p>
  </section>
  <section className="nr-panel"><h2>仓库</h2>
   <div className="nr-repo-form">
    <label className="nr-field">仓库<input aria-label="仓库" placeholder="owner/repository" value={form.repo} disabled={busy} onChange={e=>setForm({...form,repo:e.target.value})}/></label>
    <label className="nr-field">基础分支<input aria-label="基础分支" value={form.baseBranch} disabled={busy} onChange={e=>setForm({...form,baseBranch:e.target.value})}/></label>
   </div>
   <label className="nr-field">允许修改的目录<span className="nr-footnote">每行一个，例如 content/articles。留空表示整个仓库。超出范围的改动会在审核时标出。</span><textarea aria-label="允许修改的目录" rows={3} value={form.paths} disabled={busy} onChange={e=>setForm({...form,paths:e.target.value})}/></label>
   <label className="nr-check"><input type="checkbox" checked={form.contentCheck} disabled={busy} onChange={e=>setForm({...form,contentCheck:e.target.checked})}/> 推送前做内容检查（JSON 格式、空文件、语言版本是否同步）</label>
   <div className="nr-step-actions"><Button disabled={busy||!st||!form.repo.trim()} onClick={()=>void run(async()=>{await agent('saveRepo',project!.id,{revision:st!.revision,repo:form.repo.trim(),baseBranch:form.baseBranch.trim()||'main',allowedPaths:form.paths.split('\n').map(s=>s.trim()).filter(Boolean),contentCheck:form.contentCheck});setNotice('仓库已保存。');await load();})}>保存仓库</Button></div>
   <p className="nr-footnote">PR 只会开在这个仓库里；如果它是 fork，也不会开到上游仓库。</p>
  </section>
 </main>;
}
