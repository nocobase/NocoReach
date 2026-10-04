import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {confirmAction} from '@/components/reach/confirm';
export type CommunityStatus={connected:boolean;syncing?:boolean;origin?:string;title?:string;lastSync?:{at:string;ok:boolean;errors:string[]}|null;total?:number;unanswered?:number;solved?:number;categories?:{name:string;count:number}[];top?:{title:string;views:number;replies:number;solved:boolean;url:string}[]};
type Preview={origin:string;title:string;description:string;recent:string[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrCommunity',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function CommunityConnect({projectId,suggestedUrl,onChange}:{projectId:number;suggestedUrl?:string;onChange:()=>void}){
 const [status,setStatus]=useState<CommunityStatus>(),[url,setUrl]=useState(suggestedUrl||''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<CommunityStatus>(projectId,'status').then(setStatus);
 useEffect(()=>{void load().catch(()=>setError('读取论坛状态失败。'));},[projectId]);
 // The first sync runs in the background; poll until it has finished.
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<CommunityStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3><a className="nr-link" href={status.origin} target="_blank" rel="noreferrer">{status.title||status.origin}</a></h3>
  {!status.lastSync?<p role="status">正在首次同步近 90 天的公开帖子，一般需要一两分钟，可以先关闭面板。</p>:<><p>近 90 天 {status.total} 个主题 · 未回复 {status.unanswered} · 已解决 {status.solved}</p>
  {!!status.categories?.length&&<p className="nr-footnote">主要分类：{status.categories.map(c=>`${c.name} ${c.count}`).join('、')}</p>}
  {!!status.top?.length&&<div><p className="nr-guide-subtitle">讨论最多的主题</p>{status.top.slice(0,3).map(t=><p key={t.url} className="nr-footnote"><a className="nr-link" href={t.url} target="_blank" rel="noreferrer">{t.title}</a> · 浏览 {t.views} · 回复 {t.replies}{t.solved?' · 已解决':''}</p>)}</div>}
  <p className="nr-footnote">上次同步 {new Date(status.lastSync.at).toLocaleString()}，之后每天自动同步。{status.lastSync.errors.map(e=><span key={e} className="nr-block">部分未更新：{e}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'sync'))}>{busy?'正在同步…':'立即同步'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:'停止同步这个论坛？',description:'已读取的数据保留。',action:'停止同步'}))void run(()=>call<CommunityStatus>(projectId,'disconnect'));}}>断开</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <label className="nr-field">论坛地址<input aria-label="论坛地址" value={url} disabled={busy} placeholder="https://forum.example.com" onChange={e=>{setUrl(e.target.value);setPreview(undefined);}}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{url}));})}>{busy&&!preview?'正在识别…':'读取论坛'}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{preview.title}</strong> · Discourse 论坛</p>{preview.description&&<p className="nr-footnote">{preview.description}</p>}{!!preview.recent.length&&<p className="nr-footnote">最近的主题：{preview.recent.join('；')}</p>}<p className="nr-footnote">只读取公开分类的帖子内容与互动数据，不保存用户名或头像。</p><div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'connect',{url}))}>确认接入</Button></div></div>}</>;
}
