import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
export type GitHubStatus={connected:boolean;repo?:string;url?:string;description?:string;lastSync?:{at:string;ok:boolean;errors:string[]}|null;token?:{verifiedAt:string;error:string|null;since:string|null}|null;latest?:{stars:number;forks:number;openIssues:number}|null;starDelta7?:number|null;views14?:number;topReferrers?:{referrer:string;count:number;uniques:number}[];issues?:{total:number;top:{title:string;url:string;comments:number}[]}|null;releases?:{tag:string;name:string;publishedAt:string;url:string}[]};
type Preview={repo:string;url:string;description:string;stars:number;forks:number};
const call=<T,>(projectId:number,action:string,body:object={},headers?:Record<string,string>)=>api.action<T>('nrGitHub',action,{method:'POST',body:{projectId,...body},headers,unwrap:'data'});
const date=(v?:string|null)=>v?new Date(v).toLocaleDateString():'—';
export function GitHubConnect({projectId,focus,suggestedUrl,onChange}:{projectId:number;focus:'repo'|'traffic';suggestedUrl?:string;onChange:()=>void}){
 const [status,setStatus]=useState<GitHubStatus>(),[url,setUrl]=useState(suggestedUrl||''),[preview,setPreview]=useState<Preview>(),[token,setToken]=useState(''),[replacing,setReplacing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void call<GitHubStatus>(projectId,'status').then(setStatus).catch(()=>setError('读取 GitHub 状态失败。'));},[projectId]);
 async function run(fn:()=>Promise<GitHubStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 const repoSection=!status.connected?<section className="nr-guide-step"><h3>第一步：接入仓库</h3>
  <label className="nr-field">仓库链接<input aria-label="仓库链接" value={url} disabled={busy} placeholder="https://github.com/org/repo" onChange={e=>{setUrl(e.target.value);setPreview(undefined);}}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{url}));})}>{busy&&!preview?'正在读取…':'读取仓库'}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{preview.repo}</strong> · ★ {preview.stars.toLocaleString()} · Fork {preview.forks.toLocaleString()}</p>{preview.description&&<p className="nr-footnote">{preview.description}</p>}<p className="nr-footnote">接入后每天记录 Star、Fork 与 Release，并整理近 90 天讨论最多的 Issues。公开仓库不需要凭据。</p><div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(()=>call<GitHubStatus>(projectId,'connect',{url}))}>确认接入</Button></div></div>}
 </section>:<section className="nr-guide-connected"><h3><a className="nr-link" href={status.url} target="_blank" rel="noreferrer">{status.repo}</a></h3>
  <p>★ {status.latest?.stars.toLocaleString()??'—'}（近 7 天 {status.starDelta7===null||status.starDelta7===undefined?'需积累 7 天数据':(status.starDelta7>=0?'+':'')+status.starDelta7}）· Fork {status.latest?.forks.toLocaleString()??'—'} · 近 90 天 Issues {status.issues?.total??'—'}</p>
  {status.releases?.[0]&&<p className="nr-footnote">最新版本 <a className="nr-link" href={status.releases[0].url} target="_blank" rel="noreferrer">{status.releases[0].tag}</a> · {date(status.releases[0].publishedAt)}</p>}
  {!!status.issues?.top.length&&<details><summary className="nr-footnote">讨论最多的 Issues</summary>{status.issues.top.map(i=><p key={i.url} className="nr-footnote"><a className="nr-link" href={i.url} target="_blank" rel="noreferrer">{i.title}</a> · {i.comments} 条评论</p>)}</details>}
  <p className="nr-footnote">上次同步 {status.lastSync?new Date(status.lastSync.at).toLocaleString():'—'}，之后每天自动同步一次。{status.lastSync?.errors.map(e=><span key={e} className="nr-block">部分未更新：{e}</span>)}</p>
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>call<GitHubStatus>(projectId,'sync'))}>立即同步</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm('停止同步这个仓库？已归档的数据仍保留，token 会被删除。'))void run(()=>call<GitHubStatus>(projectId,'disconnect'));}}>断开</Button></div></section>;
 const tokenForm=<><ol className="nr-guide-steps">
   <li>打开 GitHub 的 <a className="nr-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">新建细粒度 token 页面</a>（需要是该仓库的管理员）。</li>
   <li>Token name 填 NocoReach；Expiration 建议选 1 年，到期前回到这里更换。</li>
   <li>Repository access 选 <strong>Only select repositories</strong>，只选 {status.repo||'你的仓库'}。</li>
   <li>Permissions → Repository permissions → <strong>Administration</strong> 设为 <strong>Read-only</strong>（Metadata 会自动设为只读），其他保持 No access。</li>
   <li>点 Generate token，复制以 github_pat_ 开头的内容，粘贴到下面。</li></ol>
  <label className="nr-field">Token<input aria-label="GitHub token" type="password" autoComplete="off" value={token} disabled={busy} placeholder="github_pat_…" onChange={e=>setToken(e.target.value)}/></label>
  <p className="nr-footnote">token 加密保存在服务端，不会显示在页面上、写入日志或发送给 AI。保存前会先用它读取一次 Traffic，确认权限正确。</p>
  <div className="nr-step-actions">{replacing&&<Button variant="ghost" disabled={busy} onClick={()=>{setReplacing(false);setToken('');}}>取消</Button>}<Button disabled={busy||!token.trim()} onClick={()=>void run(async()=>{const s=await call<GitHubStatus>(projectId,'setToken',{},{'x-noreach-github-token':token.trim()});setToken('');setReplacing(false);return s;})}>{busy?'正在验证…':'保存并验证'}</Button></div></>;
 const trafficSection=<section className="nr-guide-step" data-focus={focus==='traffic'||undefined}><h3>{status.connected?'第二步：':''}接入 Traffic（浏览、克隆、来源网站）</h3>
  {!status.connected?<p className="nr-footnote">请先接入仓库。</p>
  :status.token&&!replacing?<div className="nr-guide-connected">{status.token.error?<p role="alert" className="nr-error">{status.token.error}。请更换 token。</p>:<p>已验证 {date(status.token.verifiedAt)} · 从 {date(status.token.since)} 开始归档 · 近 14 天浏览 {status.views14?.toLocaleString()??'—'}</p>}
   {!!status.topReferrers?.length&&<p className="nr-footnote">主要来源：{status.topReferrers.map(r=>`${r.referrer} ${r.count}`).join('、')}</p>}
   <p className="nr-footnote">GitHub 只保留最近 14 天，接入前的数据无法补回。</p>
   <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy} onClick={()=>setReplacing(true)}>更换 token</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm('移除 token 后将停止归档 Traffic，已归档的数据保留。'))void run(()=>call<GitHubStatus>(projectId,'removeToken'));}}>移除 token</Button></div></div>
  :tokenForm}</section>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}{focus==='traffic'&&status.connected?<>{trafficSection}{repoSection}</>:<>{repoSection}{trafficSection}</>}</>;
}
