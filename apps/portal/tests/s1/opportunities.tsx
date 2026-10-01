import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router';
import OpportunityLibrary from '../../src/pages/strategy/library';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: the 机会 page with a current analysis, an older one, an ignored item and a converted one.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const card=(id:string,title:string,extra:object={})=>({id,title,observation:`${title}的观察：近 28 天数据变化明显，需要核对页面内容与搜索意图是否匹配。`,meaning:'页面承接的是通用命令解释类搜索，但内容过短难以满足意图，导致曝光高而点击为零。',evidenceText:'site-thin 正文约 92 字',limitation:'正文长度来自抽样，未覆盖全部子段落。',suggestion:'补充常用命令示例、部署场景与常见报错三项内容。',objective:'让内容单薄的页面匹配其曝光量',source:'search',priority:'medium',confidence:'supported',sources:['site','gsc'],firstSeenAt:'2026-10-01T09:00:00Z',change:'new',...extra});
const signals={computedAt:'2026-10-01T09:00:00Z',coverage:{},missing:[],items:[
 {key:'site-thin:/docker',type:'page',source:'site',title:'docker compose 文档内容很短',facts:['正文约 92 字','近 28 天仍有流量：曝光 5848'],url:'https://example.com/docs/docker',strength:50,actionable:true,action:'optimize'},
 {key:'gsc-site-impressions',type:'change',source:'gsc',title:'全站搜索曝光上升 +18%',facts:['近 28 天曝光 956,147','前 28 天 808,624'],strength:40,actionable:false,action:null},
 {key:'community-gap:block',type:'gap',source:'discourse',title:'近 30 天 6 个主题在问 Block 显隐',facts:['6 个主题','4 个未标记为已解决'],strength:45,actionable:true,action:'create'}]};
const ev=(v:number)=>({analysisVersion:v,periodDays:28,capturedAt:'',availableThrough:null,searchQueries:[],pages:[],industryCandidates:[],limitations:[],...(v===3?{signals}:{})});
const state={revision:4,goal:null,opportunityMeta:{old2:{status:'ignored',ignoredAt:'2026-09-30T00:00:00Z'}},
 proposals:[{id:'p1',taskId:12,insight:{id:'done1'}}],
 insights:{generatedAt:'2026-10-01T09:00:00Z',evidence:ev(3),items:[card('docker','加长 docker compose 命令文档',{signalIds:['site-thin:/docker'],priority:'high'}),card('block','补写 Block 显隐与编辑文档',{signalIds:['community-gap:block'],sources:['discourse'],change:'unchanged'}),card('impr','全站曝光上升但点击未跟上',{signalIds:['gsc-site-impressions'],sources:['gsc']}),card('done1','已转任务的机会',{signalIds:['site-thin:/docker']})],observations:[]},
 insightHistory:[{generatedAt:'2026-09-28T09:00:00Z',evidence:ev(2),items:[card('old1','首页 AI + 无代码叙事已成型',{sources:['ga4'],firstSeenAt:'2026-09-28T09:00:00Z'}),card('old2','商业页关键事件高于浏览量',{sources:['ga4'],firstSeenAt:'2026-09-28T09:00:00Z'})]}]};
const playbooks={revision:0,playbooks:[{id:'optimize-page',name:'优化现有页面',kind:'build',description:'',instructions:'',planFirst:true,checklist:[],next:[],system:true,version:1},{id:'content-outline',name:'内容选题与大纲',kind:'plan',description:'',instructions:'',checklist:[],next:['new-doc'],system:true,version:1},{id:'change-research',name:'变化原因调研',kind:'plan',description:'',instructions:'',checklist:[],next:[],system:true,version:1}]};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 if(url.includes('nrStrategy:reviewOpportunity')||url.includes('nrStrategy:confirmDirection')){(window as unknown as {__calls:unknown[]}).__calls.push({url:url.split('/api/')[1],...JSON.parse(String(init?.body||'{}'))});return json(state);}
 if(url.includes('nrStrategy:state'))return json(state);
 if(url.includes('nrPlaybooks:list'))return json(playbooks);
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
function Where(){const l=useLocation();return <output id="where" hidden>{l.pathname+l.search}</output>;}
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={['/opportunities'+(p.get('q')?'?'+p.get('q'):'')]}><Where/><Routes><Route path="/opportunities" element={<OpportunityLibrary/>}/><Route path="/actions/:taskId" element={<p>task page</p>}/></Routes></MemoryRouter></WorkspaceCacheProvider>);
