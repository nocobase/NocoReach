import {PageContainer,PageHeader} from '@/components/reach/page';
import {GoogleConnection} from './google-connection';
import {KeywordConnection} from './keyword-connection';
import {useEffect,useState,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {ArrowRight,Database,Globe,Search,ListTodo,Plus,X} from 'lucide-react';
import {records,persist,useProject} from './reach-data';
import {safeLink} from './analytics';
import './reach-workspace.css';
import './reach-refinement.css';
import './strategy/strategy.css';
import './task-board.css';

type ConnectionRequest={id:number;source:string;goal:string;status:string};
export function PageHeading({title,description,action}:{title:string;description:string;action?:ReactNode}){return <PageHeader title={title} description={description} actions={action}/>;}
function Feedback({error,notice}:{error:string;notice?:string}){return <>{error&&<div role="alert" className="nr-error">{error}</div>}{notice&&<div role="status" className="nr-success">{notice}</div>}</>;}
export function DetailDrawer({open,onClose,title,description,children,footer}:{open:boolean;onClose:()=>void;title:string;description:string;children:ReactNode;footer?:ReactNode}){return <Sheet open={open} onOpenChange={v=>{if(!v)onClose();}}><SheetContent className="nr-drawer" showCloseButton={false}><SheetHeader className="nr-drawer-head"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription><Button aria-label="关闭详情" variant="ghost" size="icon" className="nr-drawer-close" onClick={onClose}><X size={18}/></Button></SheetHeader><div className="nr-drawer-body nr-app">{children}</div>{footer&&<div className="nr-drawer-footer">{footer}</div>}</SheetContent></Sheet>;}

export {default as ActionsPage} from './optimization-work';

const sources=[{id:'ga4',name:'Google Analytics 4',label:'网站流量',description:'PV、UV、来源、页面表现与关键事件',icon:Database,route:'/website'},{id:'gsc',name:'Search Console',label:'自然搜索',description:'搜索点击、曝光、关键词与页面',icon:Search,route:'/seo-opportunities'},{id:'website',name:'官网内容',label:'内容资产',description:'官网页面、内容主题与页面结构',icon:Globe,route:''}];
export function ConnectionsPage(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [requests,setRequests]=useState<ConnectionRequest[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const selected=sources.find(s=>s.id===params.get('source'));const adding=params.get('source')==='add';
 useEffect(()=>{if(project)records<ConnectionRequest>('nrConnectionRequests',{projectId:String(project.id)}).then(setRequests).catch(e=>setError(String(e)));},[project?.id]);
 function open(id:string){setParams({source:id});}
 async function plan(){if(!project||!selected)return;setBusy(true);setError('');try{const existing=await records<ConnectionRequest>('nrConnectionRequests',{projectId:String(project.id),source:selected.name});if(!existing.length)await persist('nrConnectionRequests',{source:selected.name,goal:`为 ${project.name} 接入${selected.description}`,status:'待配置连接器',projectId:String(project.id)});setRequests(await records<ConnectionRequest>('nrConnectionRequests',{projectId:String(project.id)}));setNotice('已记录接入意向。尚未授权，也不会启动采集。');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <PageContainer className="nr-page"><PageHeading title="数据接入" description="集中查看当前项目的数据来源与可用状态。" action={<Button onClick={()=>open('add')}><Plus size={16}/>添加数据来源</Button>}/><Feedback error={projectError||error} notice={notice}/><div className="nr-information"><Database size={17}/><div><b>管理当前项目的数据接入</b><p>Google 用于本站访问与搜索表现；DataForSEO 用于外部关键词研究。授权验证、数据更新时间和查询费用分别展示。</p></div></div>
 {project&&<><KeywordConnection/><GoogleConnection projectId={String(project.id)}/></>}<div className="nr-source-grid">{sources.map(s=><section className="nr-panel nr-source-card" key={s.id}><div className="nr-source-top"><span className="nr-source-icon"><s.icon size={22}/></span><span className={`nr-status ${s.id==='website'?'':'nr-status-进行中'}`}>{s.id==='website'?'待接入':'历史数据可用'}</span></div><h2>{s.name}</h2><p className="nr-muted">{s.description}</p><dl><dt>所属网站</dt><dd>{project?.domains.join(', ')||'…'}</dd><dt>历史快照截至</dt><dd>{s.id==='website'?'尚无内容采集数据':project?.end||'…'}</dd><dt>持续同步</dt><dd>{s.id==='website'?'尚未实现':'见上方同步管理'}</dd></dl><div className="nr-source-actions"><Button variant="outline" onClick={()=>open(s.id)}>查看详情</Button>{s.route&&<button className="nr-text-button" onClick={()=>navigate(s.route)}>查看数据 <ArrowRight size={14}/></button>}</div></section>)}</div>
 <details className="nr-disclosure"><summary>接入意向 · {requests.length}</summary><p className="nr-muted">仅记录计划，不代表已连接账号。</p>{requests.map(r=><div className="nr-task" key={r.id}><div><b>{r.source}</b><p>{r.goal}</p></div><span className="nr-pill">{r.status}</span></div>)}</details>
 <DetailDrawer open={Boolean(params.get('source'))} onClose={()=>setParams({})} title={adding?'添加数据来源':selected?.name||'来源不存在'} description={adding?'第一轮支持评审以下三类来源。':selected?.description||''} footer={selected?<><Button variant="outline" onClick={()=>setParams({})}>关闭</Button><Button disabled={busy||requests.some(r=>r.source===selected.name)} onClick={plan}>{requests.some(r=>r.source===selected.name)?'已记录接入意向':'记录接入意向'}</Button></>:undefined}>
 <Feedback error={error} notice={notice}/>{adding?sources.map(s=><button className="nr-catalog" key={s.id} onClick={()=>open(s.id)}><s.icon size={22}/><span><b>{s.name}</b><small>{s.description}</small></span><ArrowRight size={16}/></button>):selected&&project?<><section className="nr-detail-section"><h3>当前实际状态</h3><dl className="nr-definition"><dt>项目</dt><dd>{project.name}</dd><dt>资源</dt><dd>{selected.id==='ga4'?project.analyticsPropertyId:selected.id==='gsc'?project.searchConsoleProperty:project.domains.join(', ')}</dd><dt>数据来源</dt><dd>{selected.id==='website'?'尚未接入':'历史快照'}</dd><dt>可用截至</dt><dd>{selected.id==='website'?'—':project.end}</dd><dt>导入时间</dt><dd>{selected.id==='website'?'—':new Date(project.importedAt).toLocaleString('zh-CN')}</dd><dt>最近同步 / 下次更新</dt><dd>尚未启用持续同步</dd></dl></section><section className="nr-detail-section"><h3>第二轮将如何接入</h3><ol className="nr-steps"><li>{selected.id==='website'?'确认官网和允许采集的范围':'你完成 Google 授权，系统读取可访问的资源'}</li><li>{selected.id==='website'?'读取页面并建立内容清单':'系统推荐匹配资源，你确认所属网站'}</li><li>首次采集后校验数据范围与日期</li><li>持续更新，并提供失败恢复与暂停操作</li></ol><p className="nr-footnote">Google 授权与真实同步已在主页面开放；官网内容采集尚在开发中。</p></section></>:null}</DetailDrawer></PageContainer>;
}
