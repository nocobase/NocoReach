import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import {useProject} from '../reach-data';
import {request} from './service';
import type {StrategyState} from './model';
import '../reach-workspace.css';
import './strategy.css';
const names:Record<string,string>={website:'网站表现',search:'自然搜索',market:'关键词研究',mixed:'多来源'};
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();
 const [state,setState]=useState<StrategyState>(),[error,setError]=useState(''),[query,setQuery]=useState(''),[source,setSource]=useState('all'),[status,setStatus]=useState('all'),[page,setPage]=useState(1);
 useEffect(()=>{if(!project)return;let active=true;request<StrategyState>(project.id,'state').then(s=>{if(active)setState(s);}).catch(()=>{if(active)setError('机会库读取失败，请刷新重试。');});return()=>{active=false;};},[project?.id]);
 const rows=useMemo(()=>{const seen=new Set<string>();return [state?.insights,...(state?.insightHistory||[])].flatMap(batch=>batch?batch.items.filter(i=>{if(seen.has(i.id))return false;seen.add(i.id);return true;}).map(card=>({card,batch,linked:state?.proposals.filter(p=>p.taskId&&p.insight?.id===card.id)||[]})):[]);},[state]);
 const filtered=rows.filter(({card,linked})=>(source==='all'||card.source===source)&&(status==='all'||(status==='task'?linked.length>0:linked.length===0))&&`${card.title} ${card.observation} ${card.suggestion}`.toLowerCase().includes(query.trim().toLowerCase()));
 useEffect(()=>setPage(1),[query,source,status]);const pages=Math.max(1,Math.ceil(filtered.length/12));
 return <main className="nr-app nr-discovery nr-opportunities"><header className="nr-heading"><div><h1>机会库</h1><p className="nr-muted">所有已保存的机会集中在这里，更新首页不会覆盖历史记录。</p></div><Button variant="outline" onClick={()=>navigate('/home')}>返回发现机会</Button></header>
 {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
 {!state&&!error&&!projectError&&<p role="status">正在读取机会…</p>}
 {state&&<><div className="nr-library-filters"><label>搜索机会<input aria-label="搜索机会" placeholder="标题、观察或建议" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>来源<select aria-label="筛选来源" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部来源</option>{Object.entries(names).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label><label>行动关联<select aria-label="筛选行动关联" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部机会</option><option value="task">已关联任务</option><option value="open">未关联任务</option></select></label><span>共 {rows.length} 条 · 当前 {filtered.length} 条</span></div>
 {!filtered.length&&<p className="nr-panel">{rows.length?'没有匹配的机会，请调整筛选条件。':'还没有已保存的机会，请到发现机会生成。'}</p>}
 <section className="nr-library-list" aria-label="历史机会"><div className="nr-library-list-head" aria-hidden="true"><span>机会与建议</span><span>来源</span><span>生成时间 / 数据截至</span><span>行动关联</span><span>操作</span></div>{filtered.slice((page-1)*12,page*12).map(({card,batch,linked})=><article className="nr-library-row" data-opportunity-id={card.id} key={card.id}><div className="nr-library-summary"><h2><button onClick={()=>navigate(`/home/opportunities/${encodeURIComponent(card.id)}`)}>{card.title}</button></h2><p title={card.suggestion}>{card.suggestion}</p></div><div><span className={`nr-pill nr-source-tag nr-source-${names[card.source]?card.source:'mixed'}`}>{names[card.source]||'多来源'}</span></div><div className="nr-library-date"><time dateTime={batch.generatedAt}>{new Date(batch.generatedAt).toLocaleString()}</time><span>数据截至 {batch.evidence.availableThrough||'未知'}</span></div><div className="nr-library-status">{linked.length?<button onClick={()=>navigate('/actions')}>已关联 {linked.length} 个任务</button>:<span>未关联任务</span>}</div><Button variant="outline" onClick={()=>navigate(`/home/opportunities/${encodeURIComponent(card.id)}`)}>查看与继续讨论</Button></article>)}</section>
 <div className="nr-discovery-buttons"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</Button><span>第 {page} / {pages} 页</span><Button variant="outline" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>下一页</Button></div></>}
 </main>;
}
