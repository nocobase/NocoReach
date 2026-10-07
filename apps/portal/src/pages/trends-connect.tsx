import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {confirmAction} from '@/components/reach/confirm';
// 趋势 (SPEC §11 市场需求): Google Trends through DataForSEO, once a week — the product and up to four competitors over
// 12 months, and the searches related to the product. Only the product name is typed here; the competitors come from 竞品.
export type TrendsStatus={connected:boolean;checking?:boolean;dataforseo?:boolean;product?:string;competitors?:{id:string;name:string;included:boolean}[];maxRivals?:number;terms?:string[];locationCode?:number;place?:string;locations:{code:number;name:string}[];lastRun?:{at:string;ok:boolean;errors:string[]}|null;checkedAt?:string|null;nextCheckAt?:string|null;summary?:{term:string;average:number|null;recent:number|null;change:number|null}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrTrends',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function TrendsConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<TrendsStatus>(),[product,setProduct]=useState(suggested||''),[place,setPlace]=useState(0),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<TrendsStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length){setProduct(s.product||s.terms[0]);setPlace(s.locationCode||0);}});
 useEffect(()=>{void load().catch(()=>setError($t("读取趋势状态失败。")));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<TrendsStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);onChange();}}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 const rivals=(status.competitors||[]).filter(c=>c.included).map(c=>c.name);
 const form=<><label className="nr-field">{$t("产品名")}<input aria-label={$t("产品名")} value={product} disabled={busy} placeholder="NocoBase" onChange={e=>setProduct(e.target.value)}/></label>
  <label className="nr-field">{$t("地区")}<select aria-label={$t("地区")} value={place} disabled={busy} onChange={e=>setPlace(Number(e.target.value))}>{status.locations.map(l=><option key={l.code} value={l.code}>{$t(l.name)}</option>)}</select></label>
  <p className="nr-footnote">{$tj("竞品自动来自“竞品”页（{0}），最多比较 4 个。每周查一次过去 12 个月的关注度，以及和产品相关的搜索；每次约 $0.022，算进 DataForSEO 的月度预算。想单独关注的行业关键词在“趋势”页添加。",{0:rivals.length?rivals.join('、'):$t("还没有")})}</p></>;
 if(status.connected&&!editing)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj("比较：{0} · {1}",{0:status.terms!.join('、'),1:$t(status.place||"")})}</h3>
  {!status.lastRun?<p role="status">{$t("正在第一次查询，一般半分钟，可以先关闭面板。")}</p>:<>{status.summary?.length&&status.checkedAt?<p>{status.summary.map(x=>$t("{0} 近 4 周 {1}",{0:x.term,1:x.recent??'—'})).join(' · ')}</p>:null}
  <p className="nr-footnote">{$tj("上次查询 {0}，之后每周一次{1}。",{0:new Date(status.lastRun.at).toLocaleString(),1:status.nextCheckAt?$t("（下次约 {0}）",{0:new Date(status.nextCheckAt).toLocaleDateString()}):''})}{status.lastRun.errors.map(e=><span key={e} className="nr-block">{$tj("没有查完：{0}",{0:e})}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'check'))}>{busy?$t("正在查询…"):$t("立即查询")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t("改产品名或地区")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("停止每周查询趋势？"),description:$t("已查到的数据保留。"),action:'停止'}))void run(()=>call<TrendsStatus>(projectId,'disconnect'));}}>{$t("停止")}</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!status.dataforseo?<p className="nr-footnote">{$t("趋势通过 DataForSEO 查 Google Trends，请先接入 DataForSEO（数据接入 → DataForSEO）。")}</p>:<>{form}
  <div className="nr-step-actions"><Button disabled={busy||!product.trim()} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'connect',{product,locationCode:place}))}>{busy?$t("正在接入…"):editing?$t("保存并重新查询"):$t("接入并开始查询")}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>{$t("取消")}</Button>}</div></>}</>;
}
