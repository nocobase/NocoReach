import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
export const typeLabels:Record<string,string>={blog:'博客',docs:'文档',page:'其他页面'};
export type SiteEntry={origin:string;pages:number;types:Record<string,number>;confirmedAt?:string;warnings:string[]};
export type SiteSummary={pages:number;origin?:string;sites?:SiteEntry[];types?:Record<string,number>;enriched?:number};
type Discovery={origin:string;sitemaps:string[];types:Record<string,number>;warnings:string[];total:number;samples:Record<string,string[]>;previewId:string};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrSiteContent',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function SiteContentConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const [summary,setSummary]=useState<SiteSummary>(),[url,setUrl]=useState(''),[found,setFound]=useState<Discovery>(),[keep,setKeep]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false);
 useEffect(()=>{void call<SiteSummary>(projectId,'summary').then(setSummary).catch(()=>setError('读取网站内容状态失败。'));},[projectId]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 const sites=summary?.sites||[],connected=sites.length>0&&!editing;
 const describe=(t:Record<string,number>)=>Object.entries(t).map(([k,n])=>`${typeLabels[k]||k} ${n}`).join('，');
 if(connected&&summary)return <><div className="nr-guide-connected"><h3>已接入 {sites.length} 个网址，共 {summary.pages} 个页面</h3>{error&&<p className="nr-error" role="alert">{error}</p>}{sites.map(x=><div className="nr-guide-row" key={x.origin}><div><strong>{x.origin}</strong><p className="nr-footnote">{x.pages} 页：{describe(x.types)}</p>{x.warnings.map(w=><p className="nr-footnote" key={w}>{w}</p>)}</div><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setUrl(x.origin);setEditing(true);setFound(undefined);}}>重新读取</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm(`移除 ${x.origin} 及其页面？已有的任务不受影响。`))void run(async()=>{setSummary(await call<SiteSummary>(projectId,'remove',{origin:x.origin}));onChange();});}}>移除</Button></div>)}<p className="nr-footnote">已读取标题与正文信息 {summary.enriched||0}/{summary.pages} 页，后台每分钟补充几页，避免给网站造成压力。</p></div>
 <div className="nr-step-actions"><Button variant="outline" onClick={()=>{setUrl('');setEditing(true);setFound(undefined);}}>再添加一个网址（如文档站）</Button></div></>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  <label className="nr-field">官网地址<input aria-label="官网地址" value={url} disabled={busy} placeholder="https://example.com" onChange={e=>{setUrl(e.target.value);setFound(undefined);}}/></label>
  <div className="nr-step-actions">{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>取消</Button>}<Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{const d=await call<Discovery>(projectId,'discover',{url});setFound(d);setKeep(Object.keys(d.types));})}>{busy&&!found?'正在读取网站…':'读取网站'}</Button></div>
  {found&&<div className="nr-guide-preview"><p>在 {found.sitemaps.length} 个 sitemap 中找到 <strong>{found.total}</strong> 个页面。请选择要纳入分析的类型：</p>
   {Object.entries(found.types).map(([t,n])=><label key={t} className="nr-guide-type"><input type="checkbox" checked={keep.includes(t)} disabled={busy} onChange={e=>setKeep(k=>e.target.checked?[...k,t]:k.filter(x=>x!==t))}/><span><strong>{typeLabels[t]||t}</strong> · {n} 页<small>{found.samples[t]?.slice(0,3).map(u=>{try{return new URL(u).pathname;}catch{return u;}}).join('、')}</small></span></label>)}
   {found.warnings.map(w=><p className="nr-footnote" key={w}>{w}</p>)}
   <p className="nr-footnote">类型按网址路径自动判断，可能有误；之后可以在内容页调整。</p>
   <div className="nr-step-actions"><Button disabled={busy||!keep.length} onClick={()=>void run(async()=>{const s=await call<SiteSummary>(projectId,'confirm',{previewId:found.previewId,types:keep});setSummary(s);setFound(undefined);setEditing(false);onChange();})}>确认接入</Button></div></div>}</>;
}
