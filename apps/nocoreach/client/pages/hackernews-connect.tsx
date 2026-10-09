import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@/lib/reach-api';
import {Button} from '@/components/reach-ui/button';
import {confirmAction} from '@/components/reach/confirm';
// Hacker News 提及 (SPEC §11 外部讨论): exact-phrase search on the public HN search; read the last 30 days, then confirm.
export type HackerNewsStatus={connected:boolean;syncing?:boolean;terms?:string[];lastSync?:{at:string;ok:boolean;errors:string[]}|null;retainedFrom?:string|null;total?:number;last30?:number;stories30?:number;top?:{title:string;points:number;comments:number;hnUrl:string;createdAt:string}[]};
type Preview={terms:string[];last30:number;stories:number;recent:{title:string;type:string;hnUrl:string;createdAt:string}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrHackerNews',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function HackerNewsConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<HackerNewsStatus>(),[terms,setTerms]=useState(suggested||''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<HackerNewsStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setTerms(t=>t||s.terms!.join(', '));});
 useEffect(()=>{void load().catch(()=>setError($t("读取 Hacker News 状态失败。")));},[projectId]);
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<HackerNewsStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj("搜索：{0}",{0:status.terms!.join('、')})}</h3>
  {!status.lastSync?<p role="status">{$t("正在补读近一年的提及，一般需要几十秒，可以先关闭面板。")}</p>:<><p>{$tj("近 30 天 {0} 条提及，其中帖子 {1} 个{2}",{0:status.last30,1:status.stories30,2:status.retainedFrom?$t(" · 从 {0} 开始记录",{0:status.retainedFrom}):''})}</p>
  {!!status.top?.length&&<div><p className="nr-guide-subtitle">{$t("分数最高的帖子")}</p>{status.top.slice(0,3).map(t=><p key={t.hnUrl} className="nr-footnote"><a className="nr-link" href={t.hnUrl} target="_blank" rel="noreferrer">{t.title}</a>  {$tj("· {0} 分 · {1} 条评论 · {2}",{0:t.points,1:t.comments,2:t.createdAt.slice(0,10)})}</p>)}</div>}
  <p className="nr-footnote">{$tj("上次同步 {0}，之后每天自动同步。",{0:new Date(status.lastSync.at).toLocaleString()})}{status.lastSync.errors.map(e=><span key={e} className="nr-block">{$tj("部分未更新：{0}",{0:e})}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<HackerNewsStatus>(projectId,'sync'))}>{busy?$t("正在同步…"):$t("立即同步")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("停止搜索 Hacker News？"),description:$t("已保存的提及保留。"),action:'停止'}))void run(()=>call<HackerNewsStatus>(projectId,'disconnect'));}}>{$t("断开")}</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <label className="nr-field">{$t("产品名或域名")}<input aria-label={$t("产品名或域名")} value={terms} disabled={busy} placeholder="nocobase, nocobase.com" onChange={e=>{setTerms(e.target.value);setPreview(undefined);}}/></label>
  <p className="nr-footnote">{$t("多个词用逗号分开，最多 5 个；按整个词组搜索。名字太常见会搜到不相关的内容，加上域名更准。")}</p>
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{terms}));})}>{busy&&!preview?$t("正在搜索…"):$t("搜索最近 30 天")}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{$tj("近 30 天 {0} 条提及",{0:preview.last30})}</strong>{$tj("，其中帖子 {0} 个",{0:preview.stories})}</p>{preview.recent.map(r=><p key={r.hnUrl} className="nr-footnote"><a className="nr-link" href={r.hnUrl} target="_blank" rel="noreferrer">{r.title||$t("（评论）")}</a> · {r.type==='story'?$t("帖子"):$t("评论")} · {r.createdAt.slice(0,10)}</p>)}
   {!preview.last30&&<p className="nr-footnote">{$t("最近 30 天没有搜到，接入后仍会每天检查。")}</p>}<p className="nr-footnote">{$t("只保存帖子和评论的内容、分数与评论数，不保存作者。")}</p>
   <div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(()=>call<HackerNewsStatus>(projectId,'connect',{terms:preview.terms}))}>{$t("确认接入")}</Button></div></div>}</>;
}
