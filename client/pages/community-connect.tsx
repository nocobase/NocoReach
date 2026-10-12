import { useMessageState, getCurrentLocale, $t, $tj } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
export type CommunityStatus={connected:boolean;syncing?:boolean;origin?:string;title?:string;lastSync?:{at:string;ok:boolean;errors:string[]}|null;total?:number;unanswered?:number;solved?:number;categories?:{name:string;count:number}[];top?:{title:string;views:number;replies:number;solved:boolean;url:string}[]};
type Preview={origin:string;title:string;description:string;recent:string[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrCommunity',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function CommunityConnect({projectId,suggestedUrl,onChange}:{projectId:number;suggestedUrl?:string;onChange:()=>void}){
 const [status,setStatus]=useState<CommunityStatus>(),[url,setUrl]=useState(suggestedUrl||''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<CommunityStatus>(projectId,'status').then(setStatus);
 useEffect(()=>{void load().catch(()=>setError(() => ($t("读取论坛状态失败。"))));},[projectId]);
 // The first sync runs in the background; poll until it has finished.
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<CommunityStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$t(e.message):$t("操作未完成，请重试。")));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3><a className="nr-link" href={status.origin} target="_blank" rel="noreferrer">{status.title||status.origin}</a></h3>
  {!status.lastSync?<p role="status">{$t("正在首次同步近 90 天的公开帖子，一般需要一两分钟，可以先关闭面板。")}</p>:<><p>{$tj("近 90 天 {0} 个主题 · 未回复 {1} · 已解决 {2}",{0:status.total,1:status.unanswered,2:status.solved})}</p>
  {!!status.categories?.length&&<p className="nr-footnote">{$tj("主要分类：{0}",{0:status.categories.map(c=>`${c.name} ${c.count}`).join('、')})}</p>}
  {!!status.top?.length&&<div><p className="nr-guide-subtitle">{$t("讨论最多的主题")}</p>{status.top.slice(0,3).map(t=><p key={t.url} className="nr-footnote"><a className="nr-link" href={t.url} target="_blank" rel="noreferrer">{t.title}</a>  {$tj("· 浏览 {0} · 回复 {1}{2}",{0:t.views,1:t.replies,2:t.solved?$t(" · 已解决"):''})}</p>)}</div>}
  <p className="nr-footnote">{$tj("上次同步 {0}，之后每天自动同步。",{0:new Date(status.lastSync.at).toLocaleString(getCurrentLocale())})}{status.lastSync.errors.map(e=><span key={e} className="nr-block">{$tj("部分未更新：{0}",{0:$t(e)})}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'sync'))}>{busy?$t("正在同步…"):$t("立即同步")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t("停止同步这个论坛？")),description:() => ($t("已读取的数据保留。")),action:'停止同步'}))void run(()=>call<CommunityStatus>(projectId,'disconnect'));}}>{$t("断开")}</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <label className="nr-field">{$t("论坛地址")}<input aria-label={$t("论坛地址")} value={url} disabled={busy} placeholder="https://forum.example.com" onChange={e=>{setUrl(e.target.value);setPreview(undefined);}}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{url}));})}>{busy&&!preview?$t("正在识别…"):$t("读取论坛")}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{preview.title}</strong>  {$t("· Discourse 论坛")}</p>{preview.description&&<p className="nr-footnote">{preview.description}</p>}{!!preview.recent.length&&<p className="nr-footnote">{$tj("最近的主题：{0}",{0:preview.recent.join('；')})}</p>}<p className="nr-footnote">{$t("只读取公开分类的帖子内容与互动数据，不保存用户名或头像。")}</p><div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'connect',{url}))}>{$t("确认接入")}</Button></div></div>}</>;
}
