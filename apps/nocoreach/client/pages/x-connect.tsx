import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@/lib/reach-api';
import {Button} from '@/components/reach-ui/button';
import {confirmAction} from '@/components/reach/confirm';
// X 提及 (SPEC §11 外部讨论): the project's own X API Bearer Token (pay-per-use), read once a day within a monthly cap.
export type XStatus={connected:boolean;checking?:boolean;tokenSaved:boolean;terms?:string[];handle?:string;cap?:number;spend?:{usd:number;posts:number;requests:number};total?:number;lastRun?:{at:string;ok:boolean;errors:string[];added:number;capped:boolean}|null;nextCheckAt?:string|null};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrX',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function XConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<XStatus>(),[form,setForm]=useState({token:'',terms:suggested||'',handle:'',cap:'5'}),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<XStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setForm(f=>({...f,terms:s.terms!.join(', '),handle:s.handle||'',cap:String(s.cap??5)}));});
 useEffect(()=>{void load().catch(()=>setError($t("读取 X 状态失败。")));},[projectId]);
 useEffect(()=>{if(!status?.checking)return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking]);
 async function run(fn:()=>Promise<XStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);setForm(f=>({...f,token:''}));onChange();}}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 if(status.connected&&!editing){const sp=status.spend!;return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj("搜索：{0}{1}",{0:status.terms!.join('、'),1:status.handle?$t("（不含 @{0}）",{0:status.handle}):''})}</h3>
  <p>{$tj("本月约 ${0} / 上限 ${1}，读了 {2} 条 · 已保存 {3} 条",{0:sp.usd.toFixed(2),1:status.cap,2:sp.posts.toLocaleString(),3:status.total})}</p>
  {!status.lastRun?<p role="status">{$t("正在第一次查找（最近 7 天），可以先关闭面板。")}</p>:<p className="nr-footnote">{$tj("上次查找 {0}，之后每天一次。",{0:new Date(status.lastRun.at).toLocaleString()})}{status.lastRun.capped?<span className="nr-block">{$t("本月已到上限，暂停读取，下个月继续；可以调高上限。")}</span>:null}{status.lastRun.errors.map(e=><span key={e} className="nr-block">{$tj("没有查完：{0}",{0:e})}</span>)}</p>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<XStatus>(projectId,'check'))}>{busy?$t("正在查找…"):$t("立即查找")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t("修改")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("断开 X？"),description:$t("保存的 Token 会删除，已读到的帖子保留。"),action:'断开'}))void run(()=>call<XStatus>(projectId,'disconnect'));}}>{$t("断开")}</Button></div></div>;}
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <ol className="nr-footnote list-decimal pl-5"><li>{$t("在 X 开发者后台（developer.x.com）建一个项目和应用，充一点额度（按条付费）。")}</li><li>{$t("在应用的 Keys and tokens 里复制 Bearer Token，粘贴到下面。")}</li></ol>
  <label className="nr-field">Bearer Token<input aria-label="Bearer Token" type="password" autoComplete="off" value={form.token} disabled={busy} placeholder={status.tokenSaved?$t("已保存，不改可以留空"):'AAAAAAAAAAAAAAAAAAAAA…'} onChange={e=>setForm({...form,token:e.target.value})}/></label>
  <label className="nr-field">{$t("搜索词")}<input aria-label={$t("搜索词")} value={form.terms} disabled={busy} placeholder="NocoBase, nocobase.com" onChange={e=>setForm({...form,terms:e.target.value})}/></label>
  <label className="nr-field">{$t("官方账号（可选，自己发的帖子不算）")}<input aria-label={$t("官方账号")} value={form.handle} disabled={busy} placeholder="@NocoBase" onChange={e=>setForm({...form,handle:e.target.value})}/></label>
  <label className="nr-field">{$t("每月上限（美元）")}<input aria-label={$t("每月上限")} type="number" min={1} max={200} value={form.cap} disabled={busy} onChange={e=>setForm({...form,cap:e.target.value})}/></label>
  <p className="nr-footnote">{$t("每天查一次：近一天的帖子数（$0.005）和新帖子（每条约 $0.005，不含转发）。到上限就停，下个月继续；$5 大约 1,000 条。Token 只存在这台服务器上；花费按价格估算，实际以 X 后台为准。")}</p>
  <div className="nr-step-actions"><Button disabled={busy||!form.terms.trim()||!(form.token.trim()||status.tokenSaved)} onClick={()=>void run(()=>call<XStatus>(projectId,'connect',{...form,cap:Number(form.cap)}))}>{busy?$t("正在检查 Token…"):editing?$t("保存"):$t("接入并开始查找")}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>{$t("取消")}</Button>}</div></>;
}
