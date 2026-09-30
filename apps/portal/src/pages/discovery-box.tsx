import {useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Sparkles,Check,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
export type Finding={source:string;label:string;url?:string;status:'direct'|'optional'|'auth'|'unsupported';note:string};
type Discovery={origin:string;title:string;description:string;items:Finding[]};
type Outcome={state:'running'|'done'|'failed';message?:string};
const post=<T,>(resource:string,action:string,body:object)=>api.action<T>(resource,action,{method:'POST',body,unwrap:'data'});
// Connecting a finding reuses each source's own confirmation path; the whole website type set is kept and can be narrowed later.
async function connect(projectId:number,f:Finding){
 if(f.source==='site'){const d=await post<{previewId:string;types:Record<string,number>}>('nrSiteContent','discover',{projectId,url:f.url});await post('nrSiteContent','confirm',{projectId,previewId:d.previewId,types:Object.keys(d.types)});return `已读取 ${Object.values(d.types).reduce((a,b)=>a+b,0)} 个页面`;}
 if(f.source==='github'){await post('nrGitHub','connect',{projectId,url:f.url});return '已接入，每天同步';}
 if(f.source==='discourse'){await post('nrCommunity','connect',{projectId,url:f.url});return '已接入，正在后台首次同步';}
 throw new Error('这个来源需要单独接入');
}
export function DiscoveryBox({projectId,open,onDone}:{projectId:number;open:(source:string)=>void;onDone:()=>void}){
 const [url,setUrl]=useState(''),[found,setFound]=useState<Discovery>(),[picked,setPicked]=useState<Set<number>>(new Set()),[outcomes,setOutcomes]=useState<Record<number,Outcome>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function discover(){setBusy(true);setError('');setFound(undefined);setOutcomes({});try{const d=await post<Discovery>('nrDiscovery','discover',{projectId,url});setFound(d);setPicked(new Set(d.items.map((f,i)=>f.status==='direct'?i:-1).filter(i=>i>=0)));}catch(e){setError(e instanceof Error?e.message:'没有完成发现，请检查网址后重试。');}finally{setBusy(false);}}
 async function connectAll(){if(!found)return;setBusy(true);for(const i of picked){setOutcomes(o=>({...o,[i]:{state:'running'}}));try{const message=await connect(projectId,found.items[i]);setOutcomes(o=>({...o,[i]:{state:'done',message}}));}catch(e){setOutcomes(o=>({...o,[i]:{state:'failed',message:e instanceof Error?e.message:'接入失败'}}));}}setBusy(false);onDone();}
 const groups:[string,Finding['status'][]][]=[['可以直接接入',['direct','optional']],['需要你授权',['auth']],['暂不支持',['unsupported']]];
 const finished=found&&Object.keys(outcomes).length>0&&!busy;
 return <section className="nr-discovery-box"><div className="nr-discovery-head"><span className="nr-guide-avatar" aria-hidden="true"><Sparkles/></span><div><h2>输入网站地址，AI 帮你找出所有可接入的数据</h2><p className="nr-muted">读取首页和链接，找出官网与文档站、GitHub 仓库、社区论坛等。你确认后再接入，不会自动导入或产生费用。</p></div></div>
  <div className="nr-discovery-input"><input aria-label="网站地址" value={url} disabled={busy} placeholder="https://example.com" onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&url.trim()&&!busy)void discover();}}/><Button disabled={busy||!url.trim()} onClick={()=>void discover()}>{busy&&!found?'正在发现…':'发现数据'}</Button></div>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  {found&&<div className="nr-discovery-result"><p className="nr-footnote">{found.title}{found.description?` — ${found.description}`:''}</p>
   {groups.map(([title,states])=>{const rows=found.items.map((f,i)=>[f,i] as const).filter(([f])=>states.includes(f.status));return rows.length?<div key={title} className="nr-discovery-group"><h3>{title}</h3>{rows.map(([f,i])=>{const o=outcomes[i];return <div key={i} className="nr-discovery-row" data-status={f.status}>
    {states[0]==='direct'?<input type="checkbox" aria-label={`接入 ${f.label}`} checked={picked.has(i)} disabled={busy||Boolean(o)} onChange={e=>setPicked(p=>{const n=new Set(p);if(e.target.checked)n.add(i);else n.delete(i);return n;})}/>:<span className="nr-discovery-dot"/>}
    <div><strong>{f.label}</strong><span className="nr-footnote">{o?.message||f.note}</span></div>
    {o?.state==='done'&&<Check className="nr-ok" aria-label="已接入"/>}{o?.state==='failed'&&<X className="nr-fail" aria-label="接入失败"/>}{o?.state==='running'&&<span className="nr-footnote">接入中…</span>}
    {f.status==='auth'&&<Button size="sm" variant="outline" onClick={()=>open(f.source)}>去授权</Button>}</div>;})}</div>:null;})}
   <div className="nr-step-actions">{finished?<p className="nr-footnote">完成。需要授权的项目可以随时点“去授权”，也可以在下方目录中管理。</p>:<Button disabled={busy||!picked.size} onClick={()=>void connectAll()}>{busy?'正在接入…':`接入所选的 ${picked.size} 个来源`}</Button>}</div></div>}
 </section>;
}
