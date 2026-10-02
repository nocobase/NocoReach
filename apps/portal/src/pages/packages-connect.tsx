import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
// 下载量 (SPEC §11 使用量): npm, PyPI and Docker Hub packages from public data; read first, then confirm.
export type PackagesStatus={connected:boolean;syncing?:boolean;lastSync?:{at:string;ok:boolean;errors:string[]}|null;packages:{id:string;registry:string;registryName:string;name:string;title:string;description:string;url:string;downloads28:number|null;pulls:number|null;since:string|null}[]};
type Preview={id:string;registry:string;name:string;title:string;description:string;version:string|null;url:string;recent7:number|null;pulls?:number|null};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrPackages',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
const registries:[string,string][]=[['npm','npm'],['pypi','PyPI'],['docker','Docker Hub']];
const n=(v:number|null|undefined)=>v==null?'—':v.toLocaleString();
export function PackagesConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const [status,setStatus]=useState<PackagesStatus>(),[registry,setRegistry]=useState('npm'),[name,setName]=useState(''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<PackagesStatus>(projectId,'status').then(setStatus);
 useEffect(()=>{void load().catch(()=>setError('读取下载量状态失败。'));},[projectId]);
 // The first read runs in the background; poll until it has finished.
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<PackagesStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {status.connected&&<div className="nr-guide-connected">
   {status.packages.map(p=><div key={p.id} className="nr-package-row" data-package={p.id}><div><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title||p.name}</a><span className="nr-footnote"> · {p.registryName}</span>
    <p className="nr-footnote">{p.registry==='docker'?`累计拉取 ${n(p.pulls)}，每天记录一次，比较前后两天的差`:p.downloads28!=null?`近 28 天下载 ${n(p.downloads28)}`:'正在读取下载量'}{p.since?` · 从 ${p.since} 起`:''}</p></div>
    <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm(`不再记录 ${p.title||p.name} 的下载量？已记录的数据一起删除。`))void run(()=>call<PackagesStatus>(projectId,'remove',{id:p.id}));}}>移除</Button></div>)}
   {status.lastSync?<p className="nr-footnote">上次同步 {new Date(status.lastSync.at).toLocaleString()}，之后每天自动同步。{status.lastSync.errors.map(e=><span key={e} className="nr-block">部分未更新：{e}</span>)}</p>:<p role="status" className="nr-footnote">正在第一次读取下载量…</p>}
   <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<PackagesStatus>(projectId,'sync'))}>{busy?'正在同步…':'立即同步'}</Button></div>
  </div>}
  <h3 className="nr-guide-subtitle">{status.connected?'再加一个包':'接入一个包'}</h3>
  <div className="nr-package-form">
   <label className="nr-field">平台<select aria-label="平台" value={registry} disabled={busy} onChange={e=>{setRegistry(e.target.value);setPreview(undefined);}}>{registries.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="nr-field">包名或页面地址<input aria-label="包名或页面地址" value={name} disabled={busy} placeholder={registry==='docker'?'例如 nocobase/nocobase':registry==='pypi'?'例如 requests':'例如 @nocobase/client'} onChange={e=>{setName(e.target.value);setPreview(undefined);}}/></label>
  </div>
  <div className="nr-step-actions"><Button disabled={busy||!name.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{registry,name}));})}>{busy&&!preview?'正在读取…':'读取'}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{preview.title}</strong> · {registries.find(([k])=>k===preview.registry)?.[1]}{preview.version?` · 最新 ${preview.version}`:''}</p>{preview.description&&<p className="nr-footnote">{preview.description}</p>}
   <p className="nr-footnote">{preview.registry==='docker'?`累计拉取 ${n(preview.pulls)}。Docker Hub 只给累计数，接入后每天记录一次。`:preview.recent7!=null?`最近 7 天下载 ${n(preview.recent7)}。`:'暂时没读到下载量，接入后会再试。'}{preview.registry==='pypi'?' PyPI 只提供最近 180 天的下载量。':''}</p>
   <div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(async()=>{const s=await call<PackagesStatus>(projectId,'add',{registry:preview.registry,name:preview.name});setPreview(undefined);setName('');return s;})}>确认接入</Button></div></div>}</>;
}
