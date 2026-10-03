import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
export type AgentStatus={revision:number;repo:{repo:string;baseBranch:string}|null;computers:{id:string;name:string;online:boolean;lastSeenAt?:string}[]};
export const agentRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrAgent',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// 数据接入 → 网站源码 (SPEC §11): the one repository the local Agent changes and opens PRs in. One field: the link.
export function RepoConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const navigate=useNavigate();const [st,setSt]=useState<AgentStatus>(),[url,setUrl]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>agentRequest<AgentStatus>('status',projectId).then(setSt);
 useEffect(()=>{void load().catch(()=>setError('读取网站源码设置失败。'));},[projectId]);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await load();onChange();}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!st)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 const online=st.computers.filter(c=>c.online).length;
 const computers=<p className="nr-footnote">{st.computers.length?online?`${online} 台电脑在线，可以领取任务。`:'已添加的电脑目前都不在线，启动后才能领取任务。':'还没有添加电脑，任务需要一台电脑来执行。'} <Button variant="link" size="sm" onClick={()=>navigate('/agents')}>{st.computers.length?'查看电脑':'去添加电脑'}</Button></p>;
 if(st.repo&&!editing)return <section className="nr-guide-connected"><h3><a className="nr-link" href={`https://github.com/${st.repo.repo}`} target="_blank" rel="noreferrer">{st.repo.repo}</a></h3>
  <p>本机 Agent 在这里修改内容、开 PR，基于{st.repo.baseBranch?`分支 ${st.repo.baseBranch}`:'仓库的默认分支'}。PR 只会开在这个仓库里。</p>{computers}
  {error&&<p className="nr-error" role="alert">{error}</p>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setUrl(`https://github.com/${st.repo!.repo}`);setEditing(true);}}>更换仓库</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm('移除后，本机 Agent 不能再领取任务；已经开的 PR 不受影响。'))void run(()=>agentRequest('removeRepo',projectId,{revision:st.revision}));}}>移除</Button></div></section>;
 return <section className="nr-guide-step"><h3>网站源码仓库</h3>
  <label className="nr-field">仓库链接<input aria-label="仓库链接" value={url} disabled={busy} placeholder="https://github.com/org/website" onChange={e=>setUrl(e.target.value)}/></label>
  <p className="nr-footnote">私有仓库也可以：Agent 用执行任务那台电脑上的 GitHub 登录读取和推送，NocoReach 不保存 GitHub 凭据。不接仓库也能用本机 Agent 做调研、关键词调研、内容大纲这类只写文档的任务。</p>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  <div className="nr-step-actions">{editing&&<Button variant="ghost" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>取消</Button>}<Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{await agentRequest('saveRepo',projectId,{revision:st.revision,repo:url.trim()});setEditing(false);})}>{busy?'正在保存…':'保存'}</Button></div>
  {computers}</section>;
}
