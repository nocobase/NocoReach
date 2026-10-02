import {Link,useNavigate,useSearchParams} from 'react-router';
import {Area,AreaChart,ResponsiveContainer} from 'recharts';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {CardShell} from '@/components/seo/card-shell';
import {StatTile} from '@/components/seo/stat-tile';
import {useProject} from './reach-data';
import {useFreshData} from './workspace-cache';
import {catalog,sourceState,type StatusInput} from './data-sources';
import {RangePicker,useRange} from './range-picker';
import './reach-workspace.css';
import './strategy/strategy.css';
import './data-views.css';
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null;format?:'percent'|'decimal';lowerIsBetter?:boolean};
export type OverviewCard={id:string;title?:string;cutoff:string|null;from:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];notes?:string[]};
type Overview={cards:OverviewCard[]};
const fmt=(v:number|null)=>v===null?'—':Math.abs(v)>=100000?`${(v/1000).toFixed(0)}K`:v.toLocaleString();
export function Change({m}:{m:Metric}){if(m.change===null)return m.complete||m.value===null?null:<small className="nr-muted">数据不完整</small>;const up=m.change>=0;return <small className={up?'nr-up':'nr-down'}>{up?'+':''}{(m.change*100).toFixed(0)}%</small>;}
// The OpenSEO dashboard layout (every-app/open-seo db8bde1 src/client/features/dashboard/, MIT): one half-width card per
// source with a "查看详情" link, cards with data first. Here every catalog source gets a card: connected ones show their
// numbers, available ones what connecting unlocks, and planned ones are one grey line at the bottom.
const pages:Record<string,{title:string;to?:string}>={gsc:{title:'搜索表现',to:'/seo-opportunities'},ga4:{title:'网站流量',to:'/website'},site:{title:'网站内容',to:'/content'},github:{title:'GitHub',to:'/data/github'},discourse:{title:'社区',to:'/data/community'},keywords:{title:'关键词研究',to:'/research/keywords'},packages:{title:'下载量'},mentions:{title:'Hacker News'}};
function tile(m:Metric){
 const value=m.value===null?'—':m.format==='percent'?`${(m.value*100).toFixed(1)}%`:m.format==='decimal'?m.value.toFixed(1):fmt(m.value);
 // Position falls as it improves: show the difference in places, like 搜索表现.
 const delta=m.lowerIsBetter?(m.change!==null&&m.previous!==null&&m.value!==null?{change:m.previous-m.value,better:m.previous>=m.value,points:true}:null):m.change!==null?{change:m.change,better:m.change>=0}:null;
 return <StatTile key={m.key} label={m.label} value={value} delta={delta} hint={m.change===null&&!m.complete&&m.value!==null?'数据不完整':undefined}/>;
}
function Trend({points,label}:{points:{date:string;value:number|null}[];label:string}){
 if(points.filter(p=>p.value!==null).length<2)return null;
 return <div className="nr-chart-box mt-3 h-16" role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{top:4,right:0,bottom:0,left:0}}><Area isAnimationActive={false} type="linear" dataKey="value" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12}/></AreaChart></ResponsiveContainer></div>;
}
export default function DataOverview(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [range,setRange]=useRange();const [params]=useSearchParams();const custom=range.range==='custom'&&(!range.from||!range.to);
 const {data,error:loadError}=useFreshData(project&&!custom?`data-view:overview:${project.id}:${JSON.stringify(range)}`:null,()=>api.action<Overview>('nrDataViews','overview',{method:'POST',body:{projectId:project!.id,...range},unwrap:'data'}));const error=loadError?(loadError instanceof Error?loadError.message:'读取数据失败，请重试。'):'';
 const status=useFreshData<StatusInput>(project?`data-status:${project!.id}`:null,()=>{const post=<T,>(r:string,a:string,body:object)=>api.action<T>(r,a,{method:'POST',body,unwrap:'data'}).catch(()=>null);return Promise.all([post<{sources:{kind:string;status:string}[]}>('nrSources','list',{projectId:project!.id}),post<StatusInput['google']>('nrGoogle','status',{projectId:String(project!.id)}),post<{pages:number}>('nrSiteContent','summary',{projectId:project!.id}),post<StatusInput['keyword']>('nrKeywords','status',{projectId:'1'}),post<StatusInput['github']>('nrGitHub','status',{projectId:project!.id}),post<StatusInput['community']>('nrCommunity','status',{projectId:project!.id}),post<StatusInput['packages']>('nrPackages','status',{projectId:project!.id}),post<StatusInput['hackernews']>('nrHackerNews','status',{projectId:project!.id})]).then(([list,google,site,keyword,github,community,packages,hackernews])=>({publicSources:list?.sources,google,site,keyword,github,community,packages,hackernews}));}).data||{};
 const cards=new Map((data?.cards||[]).map(c=>[c.id,c]));const any=data?.cards[0];
 const summary=any?`${any.window.start} 至 ${any.window.end} · 对比前 ${any.window.days} 天`:undefined;
 const shown=catalog.filter(s=>s.id!=='github-traffic');const connected=shown.filter(s=>cards.has(s.id)),available=shown.filter(s=>!cards.has(s.id)&&s.availability!=='planned'),planned=shown.filter(s=>s.availability==='planned');
 // Detail links keep the selected range, as switching pages from the menu does.
 const keep=['days','from','to'].filter(k=>params.get(k)).map(k=>`${k}=${encodeURIComponent(params.get(k)!)}`).join('&');
 const details=(id:string)=>pages[id]?.to?<Link className="text-sm text-muted-foreground hover:text-foreground" to={pages[id].to+(keep?`?${keep}`:'')}>查看详情 →</Link>:undefined;
 return <PageContainer className="nr-page nr-discovery nr-data-page"><PageHeader title="数据总览" description="已接入数据源的主要指标与变化。"/>
  <RangePicker value={range} onChange={setRange} summary={summary}/>
  {(projectError||error)&&<p className="nr-error" role="alert">{projectError||error}</p>}
  {!data&&!error&&<p role="status">正在读取数据…</p>}
  {data&&<><div className="grid gap-4 lg:grid-cols-2">
   {connected.map(s=>{const c=cards.get(s.id)!;return <CardShell key={s.id} data-source-id={s.id} title={pages[s.id]?.title||s.name} aside={c.title} action={details(s.id)} stamp={`${s.name}${c.cutoff?` · 数据截至 ${c.cutoff}`:''}`}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{c.metrics.map(tile)}</div>
    <Trend points={c.series} label={`${s.name} 每日趋势`}/>
    {c.notes?.map(n=><p key={n} className="nr-data-note mt-2">{n}</p>)}
   </CardShell>;})}
   {available.map(s=>{const st=sourceState(s,status);return <Card key={s.id} data-source-id={s.id} className="nr-data-available h-full gap-2 border border-dashed bg-transparent px-4 ring-0">
    <div className="flex items-baseline justify-between gap-2"><h2 className="font-heading text-base font-medium">{s.name}</h2><span className="text-xs text-muted-foreground">{st==='connected'?'已接入，按需查询':'未接入'}</span></div>
    <p className="text-sm text-muted-foreground">接入后能看到：{s.detects}</p>
    <div className="mt-auto pt-1">{st==='connected'?details(s.id):<Button size="sm" variant="outline" onClick={()=>navigate(`/connections?source=${s.id}`)}>接入</Button>}</div>
   </Card>;})}
  </div>
  {planned.length>0&&<p className="nr-data-planned-line text-sm text-muted-foreground">计划开发：{planned.map(s=>s.name).join('、')}</p>}</>}
 </PageContainer>;
}
