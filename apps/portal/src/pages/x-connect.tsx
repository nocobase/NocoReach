import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {confirmAction} from '@/components/reach/confirm';
// X 提及 (SPEC §11 外部讨论): the project's own X API Bearer Token (pay-per-use), read once a day within a monthly cap.
export type XStatus={connected:boolean;checking?:boolean;tokenSaved:boolean;terms?:string[];handle?:string;cap?:number;spend?:{usd:number;posts:number;requests:number};total?:number;lastRun?:{at:string;ok:boolean;errors:string[];added:number;capped:boolean}|null;nextCheckAt?:string|null};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrX',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function XConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<XStatus>(),[form,setForm]=useState({token:'',terms:suggested||'',handle:'',cap:'5'}),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<XStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setForm(f=>({...f,terms:s.terms!.join(', '),handle:s.handle||'',cap:String(s.cap??5)}));});
 useEffect(()=>{void load().catch(()=>setError('读取 X 状态失败。'));},[projectId]);
 useEffect(()=>{if(!status?.checking)return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking]);
 async function run(fn:()=>Promise<XStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);setForm(f=>({...f,token:''}));onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 if(status.connected&&!editing){const sp=status.spend!;return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>搜索：{status.terms!.join('、')}{status.handle?`（不含 @${status.handle}）`:''}</h3>
  <p>本月约 ${sp.usd.toFixed(2)} / 上限 ${status.cap}，读了 {sp.posts.toLocaleString()} 条 · 已保存 {status.total} 条</p>
  {!status.lastRun?<p role="status">正在第一次查找（最近 7 天），可以先关闭面板。</p>:<p className="nr-footnote">上次查找 {new Date(status.lastRun.at).toLocaleString()}，之后每天一次。{status.lastRun.capped?<span className="nr-block">本月已到上限，暂停读取，下个月继续；可以调高上限。</span>:null}{status.lastRun.errors.map(e=><span key={e} className="nr-block">没有查完：{e}</span>)}</p>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<XStatus>(projectId,'check'))}>{busy?'正在查找…':'立即查找'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>修改</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:'断开 X？',description:'保存的 Token 会删除，已读到的帖子保留。',action:'断开'}))void run(()=>call<XStatus>(projectId,'disconnect'));}}>断开</Button></div></div>;}
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <ol className="nr-footnote list-decimal pl-5"><li>在 X 开发者后台（developer.x.com）建一个项目和应用，充一点额度（按条付费）。</li><li>在应用的 Keys and tokens 里复制 Bearer Token，粘贴到下面。</li></ol>
  <label className="nr-field">Bearer Token<input aria-label="Bearer Token" type="password" autoComplete="off" value={form.token} disabled={busy} placeholder={status.tokenSaved?'已保存，不改可以留空':'AAAAAAAAAAAAAAAAAAAAA…'} onChange={e=>setForm({...form,token:e.target.value})}/></label>
  <label className="nr-field">搜索词<input aria-label="搜索词" value={form.terms} disabled={busy} placeholder="NocoBase, nocobase.com" onChange={e=>setForm({...form,terms:e.target.value})}/></label>
  <label className="nr-field">官方账号（可选，自己发的帖子不算）<input aria-label="官方账号" value={form.handle} disabled={busy} placeholder="@NocoBase" onChange={e=>setForm({...form,handle:e.target.value})}/></label>
  <label className="nr-field">每月上限（美元）<input aria-label="每月上限" type="number" min={1} max={200} value={form.cap} disabled={busy} onChange={e=>setForm({...form,cap:e.target.value})}/></label>
  <p className="nr-footnote">每天查一次：近一天的帖子数（$0.005）和新帖子（每条约 $0.005，不含转发）。到上限就停，下个月继续；$5 大约 1,000 条。Token 只存在这台服务器上；花费按价格估算，实际以 X 后台为准。</p>
  <div className="nr-step-actions"><Button disabled={busy||!form.terms.trim()||!(form.token.trim()||status.tokenSaved)} onClick={()=>void run(()=>call<XStatus>(projectId,'connect',{...form,cap:Number(form.cap)}))}>{busy?'正在检查 Token…':editing?'保存':'接入并开始查找'}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>取消</Button>}</div></>;
}
