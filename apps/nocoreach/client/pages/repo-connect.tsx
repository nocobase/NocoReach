import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@/lib/reach-api';
import {Button} from '@/components/reach-ui/button';
import {confirmAction} from '@/components/reach/confirm';
export type AgentStatus={revision:number;repo:{repo:string;baseBranch:string}|null;computers:{id:string;name:string;online:boolean;lastSeenAt?:string}[]};
export const agentRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrAgent',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// 数据接入 → 网站源码 (SPEC §11): the one repository the local Agent changes and opens PRs in. One field: the link.
export function RepoConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const navigate=useNavigate();const [st,setSt]=useState<AgentStatus>(),[url,setUrl]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>agentRequest<AgentStatus>('status',projectId).then(setSt);
 useEffect(()=>{void load().catch(()=>setError($t("读取网站源码设置失败。")));},[projectId]);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await load();onChange();}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 if(!st)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 const online=st.computers.filter(c=>c.online).length;
 const computers=<p className="nr-footnote">{st.computers.length?online?$t("{0} 台电脑在线，可以领取任务。",{0:online}):$t("已添加的电脑目前都不在线，启动后才能领取任务。"):$t("还没有添加电脑，任务需要一台电脑来执行。")} <Button variant="link" size="sm" onClick={()=>navigate('/agents')}>{st.computers.length?$t("查看电脑"):$t("去添加电脑")}</Button></p>;
 if(st.repo&&!editing)return <section className="nr-guide-connected"><h3><a className="nr-link" href={`https://github.com/${st.repo.repo}`} target="_blank" rel="noreferrer">{st.repo.repo}</a></h3>
  <p>{$tj("本机 Agent 在这个仓库修改内容、开 PR，基于{0}。PR 只会开在这个仓库里。",{0:st.repo.baseBranch?$t("分支 {0}",{0:st.repo.baseBranch}):$t("仓库的默认分支")})}</p>{computers}
  {error&&<p className="nr-error" role="alert">{error}</p>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setUrl(`https://github.com/${st.repo!.repo}`);setEditing(true);}}>{$t("更换仓库")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("移除网站源码仓库？"),description:$t("本机 Agent 不能再领取任务；已经开的 PR 不受影响。"),action:'移除'}))void run(()=>agentRequest('removeRepo',projectId,{revision:st.revision}));}}>{$t("移除")}</Button></div></section>;
 return <section className="nr-guide-step"><h3>{$t("网站源码仓库")}</h3>
  <label className="nr-field">{$t("仓库链接")}<input aria-label={$t("仓库链接")} value={url} disabled={busy} placeholder="https://github.com/org/website" onChange={e=>setUrl(e.target.value)}/></label>
  <p className="nr-footnote">{$t("私有仓库也可以：Agent 用执行任务那台电脑上的 GitHub 登录读取和推送，NocoReach 不保存 GitHub 凭据。不接仓库也能用本机 Agent 做调研、关键词调研、内容大纲这类只写文档的任务。")}</p>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  <div className="nr-step-actions">{editing&&<Button variant="ghost" disabled={busy} onClick={()=>{setEditing(false);setError('');}}>{$t("取消")}</Button>}<Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{await agentRequest('saveRepo',projectId,{revision:st.revision,repo:url.trim()});setEditing(false);})}>{busy?$t("正在保存…"):$t("保存")}</Button></div>
  {computers}</section>;
}
