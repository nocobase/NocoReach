import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {BarChart,Bar,AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,ReferenceLine,Legend} from 'recharts';
import {Button} from '@/components/ui/button';
import {useProject} from './reach-data';
import {useFreshData} from './workspace-cache';
import {RangePicker,useRange} from './range-picker';
import {Change,type Metric} from './data-overview';
import './reach-workspace.css';
import './strategy/strategy.css';
import './data-views.css';
type Day={date:string;stars?:number|null;forks?:number|null;views?:number;uniques?:number;clones?:number};
type View={connected:boolean;repo?:string;url?:string;window?:{start:string;end:string;days:number};notes?:string[];kpis?:Metric[];daily?:Day[];releases?:{tag:string;publishedAt:string;url:string}[];referrers?:{date:string;items:{referrer:string;count:number;uniques:number}[]}|null;paths?:{date:string;items:{path:string;title:string;count:number;uniques:number}[]}|null;issues?:{total:number;top:{title:string;url:string;comments:number;state:string}[]}|null};
const fmt=(v:number|null)=>v===null?'—':v.toLocaleString();
const short=(d:string)=>d.slice(5);
export default function DataGitHub(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [range,setRange]=useRange();
 const custom=range.range==='custom'&&(!range.from||!range.to);const {data:view,error:loadError}=useFreshData(project&&!custom?`data-view:github:${project.id}:${JSON.stringify(range)}`:null,()=>api.action<View>('nrDataViews','github',{method:'POST',body:{projectId:project!.id,...range},unwrap:'data'}));const error=loadError?(loadError instanceof Error?loadError.message:'读取 GitHub 数据失败，请重试。'):'';
 const w=view?.window,hasTraffic=Boolean(view?.daily?.some(d=>d.views!==undefined)),hasStars=Boolean(view?.daily?.some(d=>typeof d.stars==='number'));
 return <main className="nr-app nr-discovery nr-data-page"><header className="nr-heading nr-overview-title"><h1>GitHub</h1>{view?.repo&&<a className="nr-link" href={view.url} target="_blank" rel="noreferrer">{view.repo}</a>}</header>
  <RangePicker value={range} onChange={setRange} summary={w?`${w.start} 至 ${w.end} · 对比前 ${w.days} 天`:undefined}/>
  {(projectError||error)&&<p className="nr-error" role="alert">{projectError||error}</p>}
  {!view&&!error&&<p role="status">正在读取 GitHub 数据…</p>}
  {view&&!view.connected&&<section className="nr-panel nr-content-empty"><h2>接入 GitHub 仓库后，这里会显示 Star、Fork、仓库浏览与来源网站</h2><p className="nr-muted">公开仓库不需要凭据；接入只读 token 后还能看到 Traffic，并补全 Star 历史。</p><Button onClick={()=>navigate('/connections?source=github')}>接入 GitHub</Button></section>}
  {view?.connected&&<>
   <div className="nr-data-metrics nr-data-kpis">{view.kpis!.map(m=><div key={m.key}><span>{m.label}</span><strong>{fmt(m.value)}</strong><Change m={m}/></div>)}</div>
   {view.notes!.map(n=><p key={n} className="nr-data-note">{n}</p>)}
   <section className="nr-panel"><h2>每日新增 Star</h2>{hasStars?<div className="nr-chart-box"><ResponsiveContainer width="100%" height={240}><BarChart data={view.daily}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11}/><YAxis allowDecimals={false} fontSize={11} width={40}/><Tooltip/>{view.releases!.map(r=><ReferenceLine key={r.tag} x={r.publishedAt.slice(0,10)} stroke="#ba7517" strokeDasharray="4 3" label={{value:r.tag,position:'top',fontSize:10,fill:'#854f0b'}}/>)}<Bar dataKey="stars" name="新增 Star" fill="#1d9e75"/></BarChart></ResponsiveContainer></div>:<p className="nr-muted">所选时间内还没有每日 Star 记录。</p>}
    {!!view.releases!.length&&<p className="nr-footnote">虚线为版本发布：{view.releases!.map(r=>r.tag).join('、')}</p>}</section>
   <section className="nr-panel"><h2>仓库浏览与克隆</h2>{hasTraffic?<div className="nr-chart-box"><ResponsiveContainer width="100%" height={240}><AreaChart data={view.daily}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11}/><YAxis allowDecimals={false} fontSize={11} width={40}/><Tooltip/><Legend/><Area dataKey="views" name="浏览" stroke="#378add" fill="#378add33"/><Area dataKey="uniques" name="当日独立访客" stroke="#7f77dd" fill="#7f77dd22"/><Area dataKey="clones" name="克隆" stroke="#1d9e75" fill="#1d9e7522"/></AreaChart></ResponsiveContainer></div>:<p className="nr-muted">{view.notes!.some(n=>n.includes('Traffic'))?'接入 Traffic 后显示。':'所选时间内没有 Traffic 记录。'}</p>}
    <p className="nr-footnote">独立访客按天统计，不能相加为整段时间的独立访客。</p></section>
   <div className="nr-data-two">
    <section className="nr-panel"><h2>来源网站</h2>{view.referrers?<><p className="nr-footnote">GitHub 提供的最近 14 天数据（记录于 {view.referrers.date}）</p><table><thead><tr><th>来源</th><th>浏览</th><th>独立访客</th></tr></thead><tbody>{view.referrers.items.map(r=><tr key={r.referrer}><td>{r.referrer}</td><td>{r.count.toLocaleString()}</td><td>{r.uniques.toLocaleString()}</td></tr>)}</tbody></table></>:<p className="nr-muted">接入 Traffic 后显示。</p>}</section>
    <section className="nr-panel"><h2>热门页面</h2>{view.paths?<><p className="nr-footnote">GitHub 提供的最近 14 天数据（记录于 {view.paths.date}）</p><table><thead><tr><th>页面</th><th>浏览</th></tr></thead><tbody>{view.paths.items.map(p=><tr key={p.path}><td>{p.title||p.path}<span className="nr-block nr-footnote">{p.path}</span></td><td>{p.count.toLocaleString()}</td></tr>)}</tbody></table></>:<p className="nr-muted">接入 Traffic 后显示。</p>}</section>
   </div>
   <section className="nr-panel"><h2>Issues</h2>{view.issues?<><p className="nr-footnote">近 90 天共 {view.issues.total} 个 issue，下面是讨论最多的；这部分不随时间范围变化。</p>{view.issues.top.map(i=><p key={i.url} className="nr-issue-row"><a className="nr-link" href={i.url} target="_blank" rel="noreferrer">{i.title}</a><span className="nr-footnote">{i.comments} 条评论 · {i.state==='open'?'未关闭':'已关闭'}</span></p>)}</>:<p className="nr-muted">下一次同步后显示。</p>}</section>
  </>}
 </main>;
}
