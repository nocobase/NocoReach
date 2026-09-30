import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DiscoveryFeed,PerformanceSummary,type Row} from '../../src/pages/strategy/board';
import type {Evidence,StrategyState,Opportunity} from '../../src/pages/strategy/model';
import '../../src/App.css';
import '../../src/pages/reach-workspace.css';
import '../../src/pages/strategy/strategy.css';
// Synthetic data only: renders the real overview components without auth, API or model calls.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const metric=(current:number|null,previous:number|null)=>{const comparable=current!==null&&previous!==null;return {current,previous,comparable,change:comparable?current-previous:null,percent:comparable&&previous?(current-previous)/previous*100:null};};
const source=(metrics:Record<string,ReturnType<typeof metric>>)=>({from:'2026-08-31',through:'2026-09-27',availableFrom:'2026-06-01',availableDays:90,days:28,metrics});
const evidence:Evidence={analysisVersion:2,capturedAt:'2026-09-30T08:00:00Z',availableThrough:'2026-09-27',periodDays:28,searchQueries:[],pages:[],industryCandidates:[],limitations:[],summary:{search:source({clicks:metric(1240,1105),impressions:metric(48210,null)}),web:source({sessions:metric(3902,4120),views:metric(null,null)})}};
const card=(id:string,title:string,extra:Partial<Opportunity>={}):Opportunity=>({id,title,observation:'过去 28 天曝光 12,400 次，点击率 0.8%，低于同类页面的 3%。',meaning:'标题和描述没有回答搜索者的问题。',evidenceText:'GSC 28 天页面与查询样本。',limitation:'查询样本最多 20 条。',suggestion:'改写标题与 meta 描述，突出安装步骤。',objective:'提高该页面点击率',source:'search',sources:['gsc'],category:'optimize',priority:'high',confidence:'supported',lifecycle:'persistent',reviewAt:'2026-10-28T00:00:00Z',...extra});
const state:StrategyState={revision:1,goal:null,proposals:[],insights:{generatedAt:'2026-09-30T08:00:00Z',evidence,items:[card('a','「快速开始」文档点击率偏低'),card('b','插件开发指南排名在第 11 位',{priority:'medium'}),card('c','博客「v1.5 发布」流量持续下滑',{confidence:'tentative'})]}};
function Fixture(){const [last,setLast]=useState('');return <main className="nr-app nr-discovery nr-opportunities"><header className="nr-heading"><div><h1>概览</h1><p className="nr-muted">合成数据，仅验证真实组件的展示与交互。</p></div></header><PerformanceSummary evidence={evidence}/><p role="status">{last}</p><DiscoveryFeed state={state} busy={false} periodDays={28} review={async(id,c)=>setLast(`review ${id} ${JSON.stringify(c)}`)} open={(r:Row)=>setLast('open '+r.card.id)} convert={(r:Row)=>setLast('convert '+r.card.id)}/></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
