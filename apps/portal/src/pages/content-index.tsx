import {useEffect,useState} from 'react';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {records,useProject} from './reach-data';
import {useFreshData} from './workspace-cache';
import './reach-workspace.css';
import './strategy/strategy.css';
import {typeLabels,type SiteSummary} from './site-content-connect';
import {RangePicker,useRange,ranges} from './range-picker';
import './data-views.css';
import {ContentDetail,activeTasks,tasksForPage,type ContentTask} from './content-detail';
export type ContentEntry={id:string;title:string;url:string;repository:string;paths:string[];revision:number};

type SitePage={url:string;type:string;lastmod?:string|null;title?:string;words?:number;internalLinks?:number;fetchError?:string;views:number|null;clicks:number|null;impressions:number|null};
type SiteList={range?:string;cutoff?:string|null;pages:SitePage[];summary:SiteSummary;limitations?:string[]};
const CONTENT_RANGES=['7','28','90','3m','12m'];
const fmt=(v:number|null)=>v===null?'—':v.toLocaleString();
export default function ContentPage(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [type,setType]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(1);const [rangeValue,setRange]=useRange();const range=CONTENT_RANGES.includes(rangeValue.range)?rangeValue.range:'28';const rangeLabel=ranges.find(([k])=>k===range)?.[1]||'近 28 天';
 // Page-level metrics are pre-aggregated per period, so custom dates are not offered here.
 const {data,error:loadError}=useFreshData(project?`site-list:${project.id}:${range}`:null,()=>api.action<SiteList>('nrSiteContent','list',{method:'POST',body:{projectId:project!.id,range},unwrap:'data'}));const error=loadError?'读取网站内容失败，请重试。':'';
 const rows=(data?.pages||[]).filter(p=>(type==='all'||p.type===type)&&(!query||(p.title||p.url).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>(b.views??-1)-(a.views??-1)||(b.impressions??-1)-(a.impressions??-1));
 const shown=rows.slice((page-1)*50,page*50),pages=Math.max(1,Math.ceil(rows.length/50));
 const tasks=useFreshData<ContentTask[]>(project?`content-tasks:${project.id}`:null,()=>records<ContentTask>('nrTasks',{projectId:String(project!.id)})).data||[];
 const [detail,setDetail]=useState<SitePage>();
 return <PageContainer className="nr-page nr-discovery nr-content-page"><PageHeader title="页面" description={data?.summary.pages?`${data.summary.origin} · ${data.summary.pages} 页 · 已读取详情 ${data.summary.enriched||0} 页`:"网站内容数据源列出的全部页面。"}/>
 <RangePicker value={{range}} onChange={setRange} options={CONTENT_RANGES} summary={data?.cutoff?`页面数据截至 ${data.cutoff}`:undefined}/>
 {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}
 {!data&&!error&&<p role="status">正在读取内容…</p>}
 {data&&!data.summary.pages&&<section className="nr-panel nr-content-empty"><h2>接入网站内容后，这里会自动列出全部页面</h2><p className="nr-muted">把官网地址交给 AI，它会读取 sitemap、识别博客与文档，并关联访问和搜索数据。不需要手动添加。</p><Button onClick={()=>navigate('/connections?source=site')}>接入网站内容</Button></section>}
 {data&&data.summary.pages>0&&<><div className="nr-content-toolbar"><nav className="nr-tabs" aria-label="页面类型">{[['all','全部'],...Object.keys(data.summary.types||{}).map(t=>[t,typeLabels[t]||t])].map(([k,v])=><button key={k} aria-pressed={type===k} onClick={()=>{setType(k);setPage(1);}}>{v}{k!=='all'&&<small> {data.summary.types?.[k]}</small>}</button>)}</nav><input aria-label="搜索页面" placeholder="搜索标题或网址" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
 <div className="nr-scroll"><table><thead><tr><th>页面</th><th>类型</th><th>更新时间</th><th>访问（{rangeLabel}）</th><th>搜索点击</th><th>搜索曝光</th><th>进行中的任务</th></tr></thead><tbody>{shown.map(p=>{const active=activeTasks(tasksForPage(tasks,p.url));return <tr key={p.url}><td><button type="button" className="nr-keyword text-left" onClick={()=>setDetail(p)}>{p.title||(()=>{try{return new URL(p.url).pathname;}catch{return p.url;}})()}</button>{p.title&&<span className="nr-block nr-footnote">{(()=>{try{return new URL(p.url).pathname;}catch{return p.url;}})()}</span>}</td><td>{typeLabels[p.type]||p.type}</td><td>{p.lastmod?p.lastmod.slice(0,10):'—'}</td><td>{fmt(p.views)}</td><td>{fmt(p.clicks)}</td><td>{fmt(p.impressions)}</td><td>{active.length?<button type="button" className="nr-text-button" onClick={()=>setDetail(p)}>{active[0].evidence?.no?`T-${active[0].evidence.no} `:''}{active[0].title.slice(0,16)}{active.length>1?` 等 ${active.length} 个`:''}</button>:<span className="nr-muted">—</span>}</td></tr>;})}</tbody></table>{!shown.length&&<p className="nr-muted">没有匹配的页面。</p>}</div>
 {pages>1&&<div className="nr-step-actions"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</Button><span className="nr-footnote">{page}/{pages}</span><Button variant="outline" size="sm" disabled={page>=pages} onClick={()=>setPage(page+1)}>下一页</Button></div>}
 {data.limitations?.map(l=><p key={l} className="nr-footnote">{l}</p>)}</>}
 {detail&&project&&<ContentDetail projectId={project.id} page={detail} tasks={tasks} range={range} rangeLabel={rangeLabel} onClose={()=>setDetail(undefined)}/>}
 </PageContainer>;
}
