import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {ReachPageHeader} from '@/components/reach-page-header';
import {records,useProject,useUnsavedWarning} from './reach-data';
import {workState,workColumns,type Work} from './task-execution-types';
import './reach-workspace.css';
import './strategy/strategy.css';
import {typeLabels,type SiteSummary} from './site-content-connect';
export type ContentEntry={id:string;title:string;url:string;repository:string;paths:string[];revision:number};
type Task={id:number;title:string;status:string;evidence?:{work?:Work}};
type Page={page:string;views:number;conversions:number};
type Snapshot={key:string;payload:unknown};
export function ManualMappings(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();
 const [entries,setEntries]=useState<ContentEntry[]>([]),[tasks,setTasks]=useState<Task[]>([]),[pages,setPages]=useState<Page[]>([]),[cutoff,setCutoff]=useState(''),[query,setQuery]=useState(''),[draft,setDraft]=useState<ContentEntry|null>(null),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dataError,setDataError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const pending=useRef(false),generation=useRef(0),creation=useRef({id:'',requestId:''});useUnsavedWarning(dirty);
 const call=<T,>(action:string,body:object={})=>api.action<T>('nrContentIndex',action,{method:'POST',body:{projectId:String(project!.id),...body},unwrap:'data'});
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);setError('');const results=await Promise.allSettled([call<ContentEntry[]>('list'),records<Task>('nrTasks',{projectId:String(project.id)}),api.action<Snapshot[]>('nrGoogle','liveSnapshots',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'})]);if(seq!==generation.current)return;
  const [index,work,data]=results;if(index.status==='fulfilled')setEntries(index.value);else setError('内容索引读取失败，请重试。');if(work.status==='fulfilled')setTasks(work.value);else setError('关联工作读取失败，请重试。');
  if(data.status==='fulfilled'){setPages((data.value.find(s=>s.key==='pages-28')?.payload as Page[])||[]);setCutoff((data.value.find(s=>s.key==='project')?.payload as {end?:string})?.end||'');setDataError('');}else setDataError('页面数据暂时不可用，仍可维护内容映射。');setLoading(false);
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 function open(entry?:ContentEntry,url=''){if(dirty&&!confirm('放弃未保存的内容映射？'))return;setDraft(entry||{id:'',title:'',url,repository:'',paths:[],revision:0});setDirty(false);setError('');}
 async function save(){if(!draft||pending.current)return;pending.current=true;setBusy(true);try{const d=await call<ContentEntry>('save',{...draft,paths:draft.paths.filter(p=>p.trim())});setEntries(rows=>[...rows.filter(r=>r.id!==d.id),d]);setDraft(d);setDirty(false);setError('');setNotice('页面映射已保存，正文仍由仓库维护。');}catch(e){setError(e instanceof Error?e.message:'保存失败，编辑保留。');}finally{pending.current=false;setBusy(false);}}
 async function create(e:ContentEntry){if(pending.current)return;pending.current=true;setBusy(true);if(creation.current.id!==e.id)creation.current={id:e.id,requestId:crypto.randomUUID()};try{const task=await call<Task>('createWork',{contentId:e.id,requestId:creation.current.requestId});navigate('/actions/'+task.id);}catch(e){setError(e instanceof Error?e.message:'创建失败，请核对后重试。');}finally{pending.current=false;setBusy(false);}}
 const match=(e:ContentEntry,p:Page)=>{try{return p.page.startsWith('http')?new URL(p.page).href===e.url:new URL(e.url).pathname+new URL(e.url).search===p.page;}catch{return false;}};
 const suggested=pages.filter(p=>!entries.some(e=>match(e,p)));
 return <section className="nr-manual-mappings"><ReachPageHeader title="仓库文件映射" description="手动记录页面对应的仓库文件。接入仓库后将自动识别。" actions={<Button disabled={busy} onClick={()=>open()}>添加页面</Button>}/>
 {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button variant="outline" disabled={busy} onClick={()=>void load()}>重新读取</Button></p>}{notice&&<p role="status">{notice}</p>}{dataError&&<p>{dataError}</p>}
 <p className="nr-footnote">页面指标为截至 {cutoff||'未知'} 的近 28 天已加载 GA4 明细（最多 60 页），不是完整站点清单。路径明细可能聚合多个域名；请确认完整网址与文件映射。</p>
 {draft&&<section className="nr-panel"><h2>{draft.id?'编辑页面映射':'添加页面映射'}</h2><label className="nr-field">标题<input aria-label="内容标题" value={draft.title} disabled={busy} onChange={e=>{setDraft({...draft,title:e.target.value});setDirty(true);}}/></label><label className="nr-field">完整页面网址<input aria-label="页面网址" value={draft.url} disabled={busy||Boolean(draft.id)} onChange={e=>{setDraft({...draft,url:e.target.value});setDirty(true);}}/></label><label className="nr-field">内容仓库（可稍后填写）<input aria-label="内容仓库" placeholder="owner/repository" value={draft.repository} disabled={busy} onChange={e=>{setDraft({...draft,repository:e.target.value});setDirty(true);}}/></label><label className="nr-field">仓库相对路径，每行一个（可稍后填写）<textarea aria-label="仓库文件路径" value={draft.paths.join('\n')} disabled={busy} onChange={e=>{setDraft({...draft,paths:e.target.value.split('\n')});setDirty(true);}}/></label><p className="nr-footnote">此处只记录对应关系，不验证文件存在，也不会写入仓库。</p><Button disabled={busy||!draft.title.trim()||!draft.url.trim()} onClick={()=>void save()}>保存映射</Button> <Button variant="outline" disabled={busy} onClick={()=>{if(!dirty||confirm('放弃未保存编辑？')){setDraft(null);setDirty(false);}}}>关闭</Button></section>}
 <label className="nr-field">搜索内容<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="标题或网址"/></label>
 {loading?<p role="status">正在读取内容…</p>:entries.filter(e=>(e.title+' '+e.url).toLowerCase().includes(query.toLowerCase())).map(e=>{const metrics=pages.find(p=>match(e,p)),linked=tasks.filter(t=>t.evidence?.work?.contentId===e.id);return <section className="nr-panel" key={e.id}><h2>{e.title}</h2><a className="nr-link" href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a><p>{metrics?`${metrics.views} PV · ${metrics.conversions} 个关键事件`:'已加载明细中无匹配数据，不代表流量为零'}</p><p className="nr-footnote">{e.repository||'仓库待关联'}{e.paths.length?' · '+e.paths.join('、'):' · 文件路径待确认'}</p><div className="nr-discovery-buttons"><Button disabled={busy||dirty} onClick={()=>void create(e)}>开始优化</Button><Button variant="outline" disabled={busy} onClick={()=>open(e)}>编辑映射</Button><Button variant="outline" onClick={()=>navigate('/website/pages?pageDetail='+encodeURIComponent(new URL(e.url).pathname+new URL(e.url).search))}>查看数据</Button></div>{linked.map(t=><p key={t.id}><button className="nr-link" onClick={()=>navigate('/actions/'+t.id)}>{t.title} · {workColumns[workState(t.evidence?.work,t.status)]}</button></p>)}</section>;})}
 {!loading&&!entries.length&&<p>还没有内容映射。添加一篇博客，或从下方已有页面数据选择。</p>}
 <details className="nr-panel"><summary>从已有页面数据添加 · {suggested.length}</summary><p>若数据只提供路径，将以项目第一个域名填入建议网址，请保存前确认。</p>{suggested.slice(0,60).map(p=><div className="nr-content-suggestion" key={p.page}><span>{p.page}</span><Button variant="outline" disabled={busy||!project?.domains.length} onClick={()=>{let url='';try{const host=project!.domains[0];url=new URL(p.page,host.includes('://')?host:'https://'+host).href;}catch{/* Leave invalid suggestions for manual entry. */}open(undefined,url);}}>添加映射</Button></div>)}</details></section>;
}

type SitePage={url:string;type:string;lastmod?:string|null;title?:string;words?:number;internalLinks?:number;fetchError?:string;views:number|null;clicks:number|null;impressions:number|null};
type SiteList={pages:SitePage[];summary:SiteSummary;limitations?:string[]};
const fmt=(v:number|null)=>v===null?'—':v.toLocaleString();
export default function ContentPage(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [data,setData]=useState<SiteList>(),[error,setError]=useState(''),[type,setType]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{if(!project)return;void api.action<SiteList>('nrSiteContent','list',{method:'POST',body:{projectId:project.id},unwrap:'data'}).then(setData).catch(()=>setError('读取网站内容失败，请重试。'));},[project?.id]);
 const rows=(data?.pages||[]).filter(p=>(type==='all'||p.type===type)&&(!query||(p.title||p.url).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>(b.views??-1)-(a.views??-1)||(b.impressions??-1)-(a.impressions??-1));
 const shown=rows.slice((page-1)*50,page*50),pages=Math.max(1,Math.ceil(rows.length/50));
 return <main className="nr-app nr-discovery nr-content-page"><header className="nr-heading nr-overview-title"><h1>内容</h1>{data?.summary.pages?<span className="nr-muted">{data.summary.origin} · {data.summary.pages} 页 · 已读取详情 {data.summary.enriched||0} 页</span>:null}</header>
 {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}
 {!data&&!error&&<p role="status">正在读取内容…</p>}
 {data&&!data.summary.pages&&<section className="nr-panel nr-content-empty"><h2>接入网站内容后，这里会自动列出全部页面</h2><p className="nr-muted">把官网地址交给 AI，它会读取 sitemap、识别博客与文档，并关联访问和搜索数据。不需要手动添加。</p><Button onClick={()=>navigate('/connections?source=site')}>接入网站内容</Button></section>}
 {data&&data.summary.pages>0&&<><div className="nr-content-toolbar"><nav className="nr-tabs" aria-label="页面类型">{[['all','全部'],...Object.keys(data.summary.types||{}).map(t=>[t,typeLabels[t]||t])].map(([k,v])=><button key={k} aria-pressed={type===k} onClick={()=>{setType(k);setPage(1);}}>{v}{k!=='all'&&<small> {data.summary.types?.[k]}</small>}</button>)}</nav><input aria-label="搜索页面" placeholder="搜索标题或网址" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
 <div className="nr-scroll"><table><thead><tr><th>页面</th><th>类型</th><th>更新时间</th><th>访问（28 天）</th><th>搜索点击</th><th>搜索曝光</th></tr></thead><tbody>{shown.map(p=><tr key={p.url}><td><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title||(()=>{try{return new URL(p.url).pathname;}catch{return p.url;}})()}</a>{p.title&&<span className="nr-block nr-footnote">{(()=>{try{return new URL(p.url).pathname;}catch{return p.url;}})()}</span>}</td><td>{typeLabels[p.type]||p.type}</td><td>{p.lastmod?p.lastmod.slice(0,10):'—'}</td><td>{fmt(p.views)}</td><td>{fmt(p.clicks)}</td><td>{fmt(p.impressions)}</td></tr>)}</tbody></table>{!shown.length&&<p className="nr-muted">没有匹配的页面。</p>}</div>
 {pages>1&&<div className="nr-step-actions"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</Button><span className="nr-footnote">{page}/{pages}</span><Button variant="outline" size="sm" disabled={page>=pages} onClick={()=>setPage(page+1)}>下一页</Button></div>}
 {data.limitations?.map(l=><p key={l} className="nr-footnote">{l}</p>)}</>}
 <details className="nr-panel nr-content-manual"><summary>仓库文件映射</summary><ManualMappings/></details>
 </main>;
}
