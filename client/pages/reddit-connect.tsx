import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "@/lib/nocoreach-api";
import {Button} from '@/components/ui/button';
import {confirmAction} from '@/components/reach/confirm';
// Reddit 讨论 (SPEC §11 外部讨论): Reddit threads found through a weekly Google search on DataForSEO, since Reddit's own API
// needs an approved, paid commercial agreement for brand monitoring.
export type RedditStatus={connected:boolean;checking?:boolean;dataforseo?:boolean;terms?:string[];lastRun?:{at:string;ok:boolean;errors:string[];found?:number;added?:number}|null;retainedFrom?:string|null;total?:number;nextCheckAt?:string|null;recent?:{title:string;subreddit:string;url:string}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrReddit',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function RedditConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<RedditStatus>(),[terms,setTerms]=useState(suggested||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<RedditStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setTerms(t=>t||s.terms!.join(', '));});
 useEffect(()=>{void load().catch(()=>setError($t("读取 Reddit 状态失败。")));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<RedditStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj("搜索：{0}",{0:status.terms!.join('、')})}</h3>
  {!status.lastRun?<p role="status">{$t("正在第一次查找，一般十几秒，可以先关闭面板。")}</p>:<><p>{$tj("已记录 {0} 个帖子{1}{2}",{0:status.total,1:status.retainedFrom?$t(" · 从 {0} 开始记录",{0:status.retainedFrom}):'',2:status.lastRun.added?$t(" · 上次新发现 {0} 个",{0:status.lastRun.added}):''})}</p>
  {!!status.recent?.length&&<div><p className="nr-guide-subtitle">{$t("最近发现的帖子")}</p>{status.recent.slice(0,3).map(p=><p key={p.url} className="nr-footnote"><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title}</a> · r/{p.subreddit}</p>)}</div>}
  <p className="nr-footnote">{$tj("上次查找 {0}，之后每周一次{1}。",{0:new Date(status.lastRun.at).toLocaleString(),1:status.nextCheckAt?$t("（下次约 {0}）",{0:new Date(status.nextCheckAt).toLocaleDateString()}):''})}{status.lastRun.errors.map(e=><span key={e} className="nr-block">{$tj("部分未完成：{0}",{0:e})}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<RedditStatus>(projectId,'check'))}>{busy?$t("正在查找…"):$t("立即查找")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("停止查找 Reddit 讨论？"),description:$t("已记录的帖子保留。"),action:'停止'}))void run(()=>call<RedditStatus>(projectId,'disconnect'));}}>{$t("停止")}</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!status.dataforseo?<p className="nr-footnote">{$t("Reddit 讨论通过 DataForSEO 在 Google 里搜，请先接入 DataForSEO（数据接入 → DataForSEO）。")}</p>:<>
  <label className="nr-field">{$t("产品名")}<input aria-label={$t("产品名")} value={terms} disabled={busy} placeholder="NocoBase" onChange={e=>setTerms(e.target.value)}/></label>
  <p className="nr-footnote">{$t("多个词用逗号分开，最多 5 个；按整个词组搜。每周每个词在 Google 搜一次 site:reddit.com，约 $0.002，算进 DataForSEO 的月度预算。只看得到 Google 收录了的帖子，看不到点赞和评论数；不保存作者。")}</p>
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(()=>call<RedditStatus>(projectId,'connect',{terms}))}>{busy?$t("正在接入…"):$t("接入并开始查找")}</Button></div></>}</>;
}
