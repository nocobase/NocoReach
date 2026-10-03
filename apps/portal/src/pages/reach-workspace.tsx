import {SectionHandOff} from './section-hand-off';
import {visitPageDraft} from './seo-hand-off';
import ConnectionsPage from './source-connections';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {useWorkspaceCache,PageSkeleton} from './workspace-cache';
import {analysisNavigation} from '../analysis-navigation';
import {useEffect,useState,useRef,type ReactNode} from 'react';
import {useLocation,useNavigate,useSearchParams} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts';
import {ArrowUpRight,ArrowRight,Database,Search,Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {opportunities,delta,safeLink,type Pair,type Opportunity} from './analytics';
import './reach-workspace.css';
import './reach-refinement.css';
import './reach-period.css';
import {periods,windowFor,covered} from './period';
import {RangePicker} from './range-picker';
import './data-views.css';
import {ActionsPage,DetailDrawer} from './reach-managed';
import {useUnsavedWarning} from './reach-data';
import {currentProjectId} from './current-project';

type Project={id:number;name:string;domains:string[];end:string;importedAt:string;description:string;audience:string;market:string;analyticsPropertyId:string;searchConsoleProperty:string;positioning?:string;writingStyle?:string;terminology?:string;competitors?:string;keyPages?:string;contentLanguage?:string;doNotChange?:string};
type Daily={date:string;uv?:number;sessions?:number;engaged?:number;conversions?:number;views?:number;clicks?:number;impressions?:number};
type Source={source:string;medium:string;views:number;sessions:number;conversions:number};
type Page={page:string;views:number;conversions:number};
type Snapshot={id:number;key:string;payload:unknown};
type Task={id:number;taskKey:string;title:string;status:string;brief:string;evidence:{keyword:string;end:string;days:number};projectId:string};
const num=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(n||0);
async function list<T>(resource:string){const r=await api.action<T[]>(resource,'list',{query:{pageSize:200,sort:'-createdAt'},unwrap:'data'});return r;}
async function write(resource:string,body:unknown,id?:number){return api.action(resource,id?'update':'create',{method:'POST',body,query:id?{filterByTk:String(id)}:undefined});}
function Panel({title,extra,children}:{title:string;extra?:ReactNode;children:ReactNode}){return <section id={title.startsWith('分析依据')?'nr-evidence':undefined} className="nr-panel"><div className="nr-panel-title"><h2>{title}</h2>{extra}</div>{children}</section>;}
function LinkOut({url,children}:{url:string;children?:ReactNode}){const href=safeLink(url);return href?<a className="nr-link" href={href} target="_blank" rel="noopener noreferrer">{children||url}<ArrowUpRight size={13}/></a>:<span>{children||url}</span>;}

export default function ReachWorkspace(){
 const path=useLocation().pathname.split('/').filter(Boolean).pop();
 if(path==='actions')return <ActionsPage/>;
 if(path==='connections')return <ConnectionsPage/>;
 return <AnalyticsWorkspace/>;
}
function AnalyticsWorkspace(){
 const location=useLocation(),navigate=useNavigate();
 const [params,setParams]=useSearchParams();
 const paramsRef=useRef(params);
 useEffect(()=>{paramsRef.current=params;},[params]);
 const period=periods.some(([k])=>k===params.get('days'))?params.get('days')!:'28';
 const comparing=params.get('compare')!=='off';
 const live=true; // Product analysis always uses connected data; migration snapshots stay off the product surface.
 const segments=location.pathname.split('/').filter(Boolean);
 const path=segments.includes('website')?'website':segments.at(-1)||'home';
 const cache=useWorkspaceCache();
 const [snapshots,setSnapshots]=useState<Snapshot[]>(()=>cache.peek<Snapshot[]>(`analytics:${currentProjectId()}`)||[]),[tasks,setTasks]=useState<Task[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const search=params.get('q')||'',kind=params.get('kind')||'全部',rawTab=params.get('tab')||(path==='website'&&segments.at(-1)!==path?segments.at(-1)!:'overview');
 const tab=rawTab;
 const setSearch=(v:string)=>param('q',v,true),setKind=(v:string)=>param('kind',v),setTab=(v:string)=>{const p=new URLSearchParams(paramsRef.current);p.delete('tab');p.delete('q');p.delete('keyword');const item=analysisNavigation.website.find(x=>x.key===v);if(item)navigate(item.path+'?'+p.toString());};
 const [brief,setBrief]=useState('');
 const [briefDirty,setBriefDirty]=useState(false);
 useUnsavedWarning(briefDirty);
 const loadSeq=useRef(0);
 async function reload(force=false){const seq=++loadSeq.current;setLoading(true);setError('');try{const [s,t]=await Promise.all([cache.load(`analytics:${currentProjectId()}`,()=>api.action<Snapshot[]>('nrGoogle','liveSnapshots',{method:'POST',body:{projectId:String(currentProjectId())},unwrap:'data'}),force),list<Task>('nrTasks') ]);if(seq===loadSeq.current){setSnapshots(s);setTasks(t);}}catch(e){if(seq===loadSeq.current)setError(String(e));}finally{if(seq===loadSeq.current)setLoading(false);}}
 useEffect(()=>{void reload();},[live]);
 useEffect(()=>{setNotice('');},[path]);
 function data<T>(key:string):T|undefined{return snapshots.find(x=>x.key===key)?.payload as T|undefined;}
 const project=data<Project>('project');
 const daily={web:data<Daily[]>('history-web')||[],search:data<Daily[]>('history-search')||[]};
 const sw=windowFor(project?.end||'2026-09-20',period);
 const days=sw.days;
 const searchComplete=covered(daily.search,sw.start,sw.end)&&covered(daily.search,sw.previousStart,sw.previousEnd);
 const pairs=data<Pair[]>(`queries-${period}`)||[];
 const candidates=opportunities(searchComplete?pairs:pairs.map(p=>({...p,previous:0,previousImpressions:0})));
 function param(key:string,value:string,replace=false){const p=new URLSearchParams(paramsRef.current);value?p.set(key,value):p.delete(key);paramsRef.current=p;setParams(p,{replace});}
 function go(to:string){if(briefDirty&&!confirm('放弃未保存的草案修改？'))return;setBriefDirty(false);navigate(['/home','/website','/seo-opportunities'].includes(to)?`${to}?data=${live?'live':'history'}&days=${period}&compare=${comparing?'previous':'off'}`:to);}
 async function save(fn:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await fn();setNotice(message);await reload();}catch(e){setError(String(e));}finally{setBusy(false);}}
 if(loading&&!project)return <PageSkeleton title={(path==='website'?analysisNavigation.website:[]).find(x=>x.key===tab)?.label||'总览'}/>;
 if(!project||!daily)return <PageContainer className="nr-page"><PageHeader title="数据暂时不可用" description={error||(live?'尚未取得两类 Google 数据。请在数据接入中查看同步进度。':'尚未导入项目快照。')} actions={<><Button variant="outline" onClick={()=>void reload(true)}>重试</Button><Button onClick={()=>go('/connections')}>前往数据接入</Button></>}/></PageContainer>;
 const end=project.end;
 const {start,previousStart,previousEnd}=windowFor(end,period);
 const compare=(rows:Daily[],key:keyof Daily)=>!comparing?'未开启对比':!covered(rows,start,end)||!covered(rows,previousStart,previousEnd)?'历史覆盖不足，暂不比较':delta(total(rows,key),total(rows,key,false));
 const averageUV=(current=true)=>{const rows=within(daily.web,current).filter(r=>r.uv!=null);return rows.length?rows.reduce((n,r)=>n+Number(r.uv),0)/rows.length:0;};
 const within=(rows:Daily[],current:boolean)=>rows.filter(r=>current?r.date>=start&&r.date<=end:r.date>=previousStart&&r.date<start);
 const total=(rows:Daily[],key:keyof Daily,current=true)=>within(rows,current).reduce((s,r)=>s+Number(r[key]||0),0);
 const clicks=total(daily.search,'clicks'),impressions=total(daily.search,'impressions');
 const actionable=candidates.filter(c=>c.kind!=='观察');
 const filtered=(tab==='opportunities'?actionable:candidates).filter(c=>(kind==='全部'||c.kind===kind)&&c.keyword.toLowerCase().includes(search.toLowerCase()));
 const titles:Record<string,string>={home:'总览',website:'网站与产品','seo-opportunities':'搜索与关键词',actions:'行动计划',connections:'数据接入',project:'项目设置'};
 const subtitles:Record<string,string>={home:'先看发生了什么，再决定下一步做什么。',website:'把获客、内容与转化放回同一条用户路径。','seo-opportunities':'从已有搜索表现出发，找到值得投入的内容。',actions:'把发现变成任务，让每次优化都有依据。',connections:'围绕业务目标接入数据，而不是先研究配置。',project:'让分析理解你的产品、目标用户与市场。'};
 const metrics=(searchOnly=false)=><div className="nr-metrics">{(searchOnly?[
  ['搜索点击',clicks,compare(daily.search,'clicks')],['搜索曝光',impressions,compare(daily.search,'impressions')],['点击率',`${(clicks/(impressions||1)*100).toFixed(2)}%`,'点击 ÷ 曝光'],['待核查机会',actionable.length,'规则筛选 · 非效果承诺']
 ]:[['流量 · PV',total(daily.web,'views'),compare(daily.web,'views')],...(path==='home'?[['搜索点击',clicks,compare(daily.search,'clicks')]]:[['参与会话',total(daily.web,'engaged'),compare(daily.web,'engaged')]]),['日均访客 · UV',averageUV(),!comparing?'每日去重用户的平均值':covered(daily.web,previousStart,end)?delta(averageUV(),averageUV(false)):'历史覆盖不足，暂不比较'],['关键事件',total(daily.web,'conversions'),'沿用 GA4 事件定义，非成交数']]).map(([label,value,change])=><button className="nr-metric" key={label} onClick={()=>{if(searchOnly)setTab(label==='待核查机会'?'opportunities':'overview');else if(label==='搜索点击')go('/seo-opportunities');else navigate(`/website?data=${live?'live':'history'}&days=${period}&compare=${comparing?'previous':'off'}&tab=${label==='页面浏览'?'pages':label==='关键事件'?'conversion':'overview'}`);}}><span>{label}</span><strong>{typeof value==='number'?num(value):value}</strong><small>{change}</small></button>)}</div>;
 const changePeriod=(value:string)=>{if(briefDirty&&!confirm('放弃未保存的草案修改？'))return;setBriefDirty(false);setBrief('');const p=new URLSearchParams(paramsRef.current);p.set('days',value);p.delete('keyword');paramsRef.current=p;setParams(p);};
 // Same range picker as the other data pages; these tables are pre-aggregated per period, so no custom dates.
 const controls=(label:string)=><div className="nr-time-controls"><RangePicker value={{range:period}} onChange={r=>changePeriod(r.range)} options={periods.map(([k])=>k)}/><label><input type="checkbox" aria-label={label+'上期对比'} checked={comparing} onChange={e=>param('compare',e.target.checked?'previous':'off')}/> 对比上一个等长周期</label></div>;
 const chart=(isSearch=false)=>{
  const rows=isSearch?daily.search:daily.web;
  const field=isSearch?'clicks':'views',fresh=(data<{web:Daily[];search:Daily[]}>('preliminary')?.[isSearch?'search':'web']||[]).filter(r=>r.date>end);
  const base=Array.from({length:days},(_,i)=>{const date=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10),previousDate=new Date(Date.parse(previousStart)+i*86400000).toISOString().slice(0,10);const now=rows.find(r=>r.date===date),prev=rows.find(r=>r.date===previousDate);return {date,previousDate,value:now?.[field]??null,uv:now?.uv??null,previous:prev?.[field]??null,previousUV:prev?.uv??null,fresh:null as number|null};});
  // 初步 days after the cutoff continue the line dotted (joined at the last final day); they are not in the numbers above.
  const points=fresh.length?[...base.map(p=>p.date===end?{...p,fresh:p.value}:p),...fresh.map(r=>({date:r.date,previousDate:'',value:null,uv:null,previous:null,previousUV:null,fresh:Number(r[field]??0)}))]:base;
  return <><p className="nr-footnote">{start} — {end}{comparing&&'；上期 '+previousStart+' — '+previousEnd}。缺失日期不补零。{!isSearch&&' UV 为每日去重访客，不可跨日相加；概览采用日均值。'}</p><div className="nr-chart"><ResponsiveContainer width="100%" height={265}><AreaChart data={points} margin={{left:0,right:18,top:12,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} minTickGap={40} tick={{fontSize:11}}/><YAxis width={55} tick={{fontSize:11}}/><Tooltip labelFormatter={(v,p)=>String(v)+(!p?.[0]?.payload.previousDate?'（初步数据）':comparing?' / 上期 '+p[0].payload.previousDate:'')}/><Area isAnimationActive={false} type="linear" name={isSearch?'本期搜索点击':'本期 PV'} dataKey="value" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={.08}/>{!isSearch&&<Area isAnimationActive={false} type="linear" name="本期 UV" dataKey="uv" stroke="var(--chart-5)" fill="none"/>}{comparing&&<Area isAnimationActive={false} type="linear" name={isSearch?'上期搜索点击':'上期 PV'} dataKey="previous" stroke="var(--muted-foreground)" strokeDasharray="5 4" fill="none"/>}{comparing&&!isSearch&&<Area isAnimationActive={false} type="linear" name="上期 UV" dataKey="previousUV" stroke="var(--chart-5)" strokeDasharray="5 4" fill="none"/>}{fresh.length>0&&<Area isAnimationActive={false} type="linear" name={isSearch?'初步搜索点击':'初步 PV'} dataKey="fresh" stroke="var(--chart-3)" strokeDasharray="2 3" fill="var(--chart-3)" fillOpacity={.03}/>}</AreaChart></ResponsiveContainer></div><p className="nr-footnote">● {isSearch?'搜索点击':'PV（蓝色） · UV（紫色）'}{comparing?' · 虚线为上期':''}{fresh.length>0&&` · 点线是 ${fresh[0].date.slice(5)}${fresh.length>1?` 至 ${fresh.at(-1)!.date.slice(5)}`:''} 的初步数据（Google 还在更新，不计入上面的数字）`}</p></>;
 };
 const sourceRows=data<Source[]>(`sources-${period}`)||[],pageRows=data<Page[]>(`pages-${period}`)||[];
 // Visits from Reddit (reddit.com and the Reddit app as GA4 sources), per day, for the same period and the one before.
 const redditPanel=()=>{const rows=data<Daily[]>('history-reddit-referral')||[],cur=total(rows,'sessions'),prev=total(rows,'sessions',false),list=sourceRows.filter(s=>/reddit/i.test(s.source));
  return <Panel title="来自 Reddit 的访问" extra={<button className="nr-text-button" onClick={()=>navigate('/data/reddit')}>看 Reddit 上的帖子</button>}><p data-reddit-visits>会话 <b>{num(cur)}</b>{comparing&&covered(rows,previousStart,previousEnd)?<>（上期 {num(prev)}{prev?`，${cur>=prev?'+':''}${Math.round((cur-prev)/prev*100)}%`:''}）</>:null} · 浏览 <b>{num(total(rows,'views'))}</b> · 关键事件 <b>{num(total(rows,'conversions'))}</b></p>{list.length?<p className="nr-muted">来源：{list.map(s=>`${s.source} / ${s.medium}（${num(s.views)} PV）`).join('、')}</p>:<p className="nr-muted">所选时间内没有来自 Reddit 的访问。</p>}</Panel>;};
 const detailSource=sourceRows.find(s=>JSON.stringify([s.source,s.medium])===params.get('sourceDetail'));
 const detailPage=pageRows.find(p=>p.page===params.get('pageDetail'));
 const share=(value:number)=>{const all=total(daily.web,'views');return all?(100*value/all).toFixed(1)+'%':'—';};
 const breakdown=(rows:{label:string;views:number}[])=><div>{rows.slice(0,5).map((r,i)=><div key={i} style={{marginBottom:16}}><div style={{display:'flex',justifyContent:'space-between',gap:16}}><span style={{overflowWrap:'anywhere'}}>{r.label}</span><strong>{num(r.views)} PV</strong></div><div style={{height:6,background:'var(--muted)',borderRadius:4,marginTop:7}}><div style={{height:6,background:'var(--chart-3)',borderRadius:4,width:Math.min(100,rows[0]?.views?100*r.views/rows[0].views:0)+'%'}}/></div></div>)}</div>;
 const sourceTable=(limit=40)=> <div className="nr-scroll"><table><thead><tr><th>来源 / 媒介</th><th>浏览量 · PV</th><th>占全站 PV</th><th>会话</th><th>关键事件</th></tr></thead><tbody>{(data<Source[]>(`sources-${period}`)||[]).filter(s=>tab==='overview'||`${s.source} ${s.medium}`.toLowerCase().includes(search.toLowerCase())).slice(0,limit).map((s,i)=><tr key={i}><td><button className="nr-keyword" onClick={()=>param('sourceDetail',JSON.stringify([s.source,s.medium]))}>{s.source}</button><small className="nr-muted nr-block">{s.medium}</small></td><td>{num(s.views)}</td><td>{share(s.views)}</td><td>{num(s.sessions)}</td><td>{num(s.conversions)}</td></tr>)}</tbody></table></div>;
 const pageTable=(limit=60)=> <div className="nr-scroll"><table><thead><tr><th>页面</th><th>浏览量 · PV</th><th>占全站 PV</th><th>关键事件</th></tr></thead><tbody>{(data<Page[]>(`pages-${period}`)||[]).filter(p=>tab==='overview'||p.page.toLowerCase().includes(search.toLowerCase())).slice(0,limit).map((p,i)=><tr key={i}><td><button className="nr-keyword" onClick={()=>param('pageDetail',p.page)}>{p.page||'未提供路径'}</button></td><td>{num(p.views)}</td><td>{share(p.views)}</td><td>{num(p.conversions)}</td></tr>)}</tbody></table></div>;
 return <PageContainer className="nr-page">
  <PageHeader title={path==='website'?'访问':titles[path]||'总览'} description={path==='website'?({overview:'网站访问、获客与内容的整体变化。',sources:'哪些来源带来访问与关键行为？',pages:'哪些内容获得访问，哪些页面值得进一步研究？',conversion:'查看已记录的关键行为，不将事件次数视为成交。'}[tab]||subtitles[path]):subtitles[path]} actions={<Button variant="outline" size="sm" disabled={loading} onClick={()=>void reload(true)}>{loading?'更新中…':'刷新数据'}</Button>}/>
  {path==='website'&&<nav className="nr-tabs" aria-label="分页">{analysisNavigation.website.map(item=><button key={item.key} type="button" aria-selected={item.key===tab} onClick={()=>go(`${item.path}${params.toString()?`?${params}`:""}`)}>{item.label}</button>)}</nav>}
  {controls('分析周期')}
  <div className="nr-provenance"><Database size={14}/><span>数据更新至 {end} · {start} — {end} · {comparing?`对比 ${previousStart} — ${previousEnd}`:'未开启对比'}</span><button className="nr-text-button" onClick={()=>go('/connections')}>查看数据来源 <ArrowRight size={13}/></button></div>
  {((path!=='seo-opportunities'&&!covered(daily.web,start,end))||(path!=='website'&&!covered(daily.search,start,end)))&&<p className="nr-error">所选周期存在历史缺失，当前只展示已记录的数据，不将缺失视作零；请缩短周期以获得完整统计。</p>}
  {error&&<div role="alert" className="nr-error">{error}<button onClick={()=>setError('')}>关闭</button></div>}{notice&&<div role="status" className="nr-success">{notice}</div>}
  {path==='home'&&<>
   {metrics()}
   <section className="nr-summary"><div className="nr-summary-icon"><Sparkles size={22}/></div><div><div className="nr-eyebrow">本期观察 <span className="nr-pill">规则分析</span></div><h2>流量 PV {compare(daily.web,'views')}，搜索点击 {compare(daily.search,'clicks')}</h2><p>在已载入的 {candidates.length} 个高曝光关键词中，有 {actionable.length} 个值得进一步核查。先优化已有内容，再决定是否新增文章。</p><div className="nr-actions"><Button onClick={()=>go('/seo-opportunities/opportunities')}>查看关键词选题 <ArrowRight size={15}/></Button><Button variant="outline" onClick={()=>go('/website')}>查看网站变化</Button></div></div></section>
   <div className="nr-grid"><Panel title="网站流量趋势" extra={<button className="nr-text-button" onClick={()=>go('/website')}>深入查看 →</button>}>{chart()}</Panel><Panel title="下一步值得做什么">{actionable.slice(0,3).map(c=><button className="nr-opportunity-mini" key={c.keyword} onClick={()=>{navigate(`/seo-opportunities?data=${live?'live':'history'}&days=${period}&compare=${comparing?'previous':'off'}&keyword=${encodeURIComponent(c.keyword)}`);setBrief('');}}><span className="nr-pill">{c.kind}</span><b>{c.keyword}</b><p>{c.reason}</p><ArrowUpRight size={17}/></button>)}{!actionable.length&&<p>当前规则下没有明显机会，可查看全部搜索数据。</p>}</Panel></div>
   <Panel title="执行进度" extra={<button className="nr-text-button" onClick={()=>go('/actions')}>打开行动计划 →</button>}><div className="nr-progress">{['待处理','进行中','已完成'].map(status=><div key={status}><strong>{tasks.filter(t=>t.status===status).length}</strong><span>{status}</span></div>)}<p className="nr-muted">每条任务保留关键词、页面与分析时段，执行后可回看基线。</p></div></Panel>
  </>}
  {path==='website'&&<>{tab==='overview'&&metrics()}
   {tab==='overview'&&<><Panel title="每日流量 · PV / UV">{chart()}</Panel><div className="nr-grid"><Panel title="主要获客来源" extra={<button className="nr-text-button" onClick={()=>setTab('sources')}>查看全部 →</button>}>{sourceTable(6)}</Panel><Panel title="高浏览页面" extra={<button className="nr-text-button" onClick={()=>setTab('pages')}>查看全部 →</button>}>{pageTable(6)}</Panel></div></>}
   {tab==='sources'&&<><div className="nr-grid"><Panel title="主要来源 · 按 PV 排序">{breakdown(sourceRows.map(s=>({label:s.source+' / '+s.medium,views:s.views})))}</Panel><Panel title="来源数据范围"><p>当前显示前 {sourceRows.length} 个来源 / 媒介组合，覆盖全站 PV 的 {share(sourceRows.reduce((sum,s)=>sum+s.views,0))}。</p><p className="nr-muted">点击来源可查看会话和关键事件。来源明细为前 40 项，不能用明细合计代替全站总量。</p><Button variant="outline" onClick={()=>setTab('overview')}>查看全站趋势</Button></Panel></div>{redditPanel()}<Panel title="流量来源 · 前 40 项"><div className="nr-filters"><label><Search size={16}/><input aria-label="筛选来源" placeholder="搜索来源或媒介" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>{sourceTable()}</Panel></>}{tab==='pages'&&<><div className="nr-grid"><Panel title="高浏览内容">{breakdown(pageRows.map(p=>({label:p.page,views:p.views})))}</Panel><Panel title="内容数据范围"><p>当前显示前 {pageRows.length} 个页面，覆盖全站 PV 的 {share(pageRows.reduce((sum,p)=>sum+p.views,0))}。</p><p className="nr-muted">点击页面查看访问表现及关联搜索查询；页面访问量不等于该页面作为落地页的访问量。</p><Button variant="outline" onClick={()=>setTab('overview')}>查看全站趋势</Button></Panel></div><Panel title="页面表现 · 前 60 项"><div className="nr-filters"><label><Search size={16}/><input aria-label="筛选页面" placeholder="搜索页面路径" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>{pageTable()}</Panel></>}
   {tab==='conversion'&&<Panel title="关键事件与参与度"><p>当前周期记录 <b>{num(total(daily.web,'conversions'))}</b> 次关键事件；参与会话 <b>{num(total(daily.web,'engaged'))}</b> 次。</p><p className="nr-muted">这里沿用源 GA4 的关键事件口径。尚未接入事件明细、CRM 或订单数据，不能将关键事件直接解释为线索或营收。</p>{sourceTable()}</Panel>}
  </>}
  {detailSource&&<DetailDrawer open={true} onClose={()=>param('sourceDetail','')} title={'来源详情 · '+detailSource.source} description={start+' — '+end+' · GA4'}><p>媒介：{detailSource.medium}</p><p>浏览量：{num(detailSource.views)} PV · 占全站 {share(detailSource.views)}</p><p>会话：{num(detailSource.sessions)} · 关键事件：{num(detailSource.conversions)}</p><p className="nr-muted">关键事件按 GA4 配置记录，不代表成交或归因收入。来源级趋势尚未提供。</p></DetailDrawer>}
  {detailPage&&<DetailDrawer open={true} onClose={()=>param('pageDetail','')} title="页面详情" description={start+' — '+end+' · GA4 / Search Console'}><div className="mb-2 flex justify-end"><SectionHandOff projectId={project.id} playbookId="optimize-page" page={detailPage.page.startsWith('http')?detailPage.page:`https://${project.domains[0]}${detailPage.page}`} description="这个页面的访问、关键事件和搜索查询写进任务说明，确认后立即开始。" draft={()=>visitPageDraft(detailPage.page.startsWith('http')?detailPage.page:`https://${project.domains[0]}${detailPage.page}`,`${start} 至 ${end}`,detailPage.views,detailPage.conversions,share(detailPage.views),pairs.filter(p=>{try{return new URL(p.page).pathname===detailPage.page.split('?')[0];}catch{return p.page===detailPage.page;}}))}/></div><LinkOut url={detailPage.page.startsWith('http')?detailPage.page:`https://${project.domains[0]}${detailPage.page}`}>{detailPage.page}</LinkOut><p>浏览量：{num(detailPage.views)} PV · 占全站 {share(detailPage.views)}</p><p>关键事件：{num(detailPage.conversions)}</p><h3>关联搜索查询</h3>{pairs.filter(p=>{try{return new URL(p.page).pathname===detailPage.page.split('?')[0];}catch{return p.page===detailPage.page;}}).slice(0,10).map((p,i)=><p key={i}>{p.keyword} · {num(p.clicks||0)} 点击 · {num(p.impressions||0)} 曝光</p>)}<p className="nr-muted">仅匹配已载入的关键词–页面组合；没有匹配记录不表示没有搜索流量。Google 两类指标统计范围不同，不直接相减。</p></DetailDrawer>}

 </PageContainer>;
}
