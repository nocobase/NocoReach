import {useNavigate} from 'react-router';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {ComposedChart,Bar,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,Legend} from 'recharts';
import {Button} from '@/components/ui/button';
import {useProject} from './reach-data';
import {useFreshData} from './workspace-cache';
import {RangePicker,useRange} from './range-picker';
import {Change,type Metric} from './data-overview';
import './reach-workspace.css';
import './strategy/strategy.css';
import './data-views.css';
type Topic={title:string;url:string;views?:number;replies?:number;solved?:boolean;category:string;date:string};
type View={connected:boolean;origin?:string;title?:string;window?:{start:string;end:string;days:number};notes?:string[];kpis?:(Metric&{unit?:string})[];daily?:{date:string;topics:number|null;replies:number|null}[];categories?:{name:string;count:number;previous:number|null}[];top?:Topic[];unanswered?:Topic[]};
const short=(d:string)=>d.slice(5);
export default function DataCommunity(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [range,setRange]=useRange();
 const custom=range.range==='custom'&&(!range.from||!range.to);const {data:view,error:loadError}=useFreshData(project&&!custom?`data-view:community:${project.id}:${JSON.stringify(range)}`:null,()=>api.action<View>('nrDataViews','community',{method:'POST',body:{projectId:project!.id,...range},unwrap:'data'}));const error=loadError?(loadError instanceof Error?loadError.message:'读取社区数据失败，请重试。'):'';
 const w=view?.window;
 return <PageContainer className="nr-page nr-discovery nr-data-page"><PageHeader title="社区" description={view?.origin?<a className="nr-link" href={view.origin} target="_blank" rel="noreferrer">{view.title||view.origin}</a>:"社区论坛的主题、回复与高频问题。"}/>
  <RangePicker value={range} onChange={setRange} summary={w?`${w.start} 至 ${w.end} · 对比前 ${w.days} 天`:undefined}/>
  {(projectError||error)&&<p className="nr-error" role="alert">{projectError||error}</p>}
  {!view&&!error&&<p role="status">正在读取社区数据…</p>}
  {view&&!view.connected&&<section className="nr-panel nr-content-empty"><h2>接入社区论坛后，这里会显示讨论量、分类趋势和无人回复的主题</h2><p className="nr-muted">目前支持 Discourse 论坛的公开分类，不需要账号，不保存用户名。</p><Button onClick={()=>navigate('/connections?source=discourse')}>接入社区论坛</Button></section>}
  {view?.connected&&<>
   <div className="nr-data-metrics nr-data-kpis">{view.kpis!.map(m=><div key={m.key}><span>{m.label}</span><strong>{m.value===null?'—':`${m.value.toLocaleString()}${m.unit||''}`}</strong><Change m={m}/></div>)}</div>
   {view.notes!.map(n=><p key={n} className="nr-data-note">{n}</p>)}
   <section className="nr-panel"><h2>每日新主题与回复</h2><div className="nr-chart-box"><ResponsiveContainer width="100%" height={240}><ComposedChart data={view.daily}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={short} minTickGap={24} fontSize={11}/><YAxis yAxisId="t" allowDecimals={false} fontSize={11} width={32}/><YAxis yAxisId="r" orientation="right" allowDecimals={false} fontSize={11} width={40}/><Tooltip/><Legend/><Bar yAxisId="t" dataKey="topics" name="新主题" fill="var(--chart-2)"/><Line yAxisId="r" dataKey="replies" name="这些主题的回复" stroke="var(--chart-5)" dot={false}/></ComposedChart></ResponsiveContainer></div><p className="nr-footnote">回复按主题创建日归类，是最近一次读取时的累计回复数。</p></section>
   <div className="nr-data-two">
    <section className="nr-panel"><h2>分类</h2>{view.categories!.length?<table><thead><tr><th>分类</th><th>新主题</th><th>前一期</th></tr></thead><tbody>{view.categories!.map(c=><tr key={c.name}><td>{c.name}</td><td>{c.count}</td><td>{c.previous??'—'}</td></tr>)}</tbody></table>:<p className="nr-muted">所选时间内没有新主题。</p>}</section>
    <section className="nr-panel"><h2>无人回复</h2>{view.unanswered!.length?view.unanswered!.map(t=><p key={t.url} className="nr-issue-row"><a className="nr-link" href={t.url} target="_blank" rel="noreferrer">{t.title}</a><span className="nr-footnote">{t.category} · {t.date}</span></p>):<p className="nr-muted">所选时间内没有无人回复的主题。</p>}</section>
   </div>
   <section className="nr-panel"><h2>讨论最多的主题</h2>{view.top!.length?view.top!.map(t=><p key={t.url} className="nr-issue-row"><a className="nr-link" href={t.url} target="_blank" rel="noreferrer">{t.title}</a><span className="nr-footnote">{t.category} · 浏览 {t.views} · 回复 {t.replies}{t.solved?' · 已解决':''}</span></p>):<p className="nr-muted">所选时间内没有新主题。</p>}</section>
  </>}
 </PageContainer>;
}
