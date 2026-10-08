import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router';
import OpportunityLibrary from '../../src/pages/strategy/library';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: the 机会 page with a current analysis, an older one, an ignored item and a converted one.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));document.documentElement.dataset.theme=new URLSearchParams(location.search).get('density')==='default'?'default':'compact';
const card=(id:string,title:string,extra:object={})=>({id,title,observation:`${title}的观察：近 28 天数据变化明显，需要核对页面内容与搜索意图是否匹配。`,meaning:'页面承接的是通用命令解释类搜索，但内容过短难以满足意图，导致曝光高而点击为零。',evidenceText:'site-thin 正文约 92 字',limitation:'正文长度来自抽样，未覆盖全部子段落。',suggestion:'补充常用命令示例、部署场景与常见报错三项内容。',objective:'让内容单薄的页面匹配其曝光量',source:'search',priority:'medium',confidence:'supported',sources:['site','gsc'],firstSeenAt:'2026-10-01T09:00:00Z',change:'new',...extra});
const signals={computedAt:'2026-10-01T09:00:00Z',coverage:{},missing:[],items:[
 {key:'site-thin:/docker',type:'page',source:'site',title:'docker compose 文档内容很短',facts:['正文约 92 字','近 28 天仍有流量：曝光 5848'],url:'https://example.com/docs/docker',strength:50,actionable:true,action:'optimize'},
 {key:'gsc-site-impressions',type:'change',source:'gsc',title:'全站搜索曝光上升 +18%',facts:['近 28 天曝光 956,147','前 28 天 808,624'],strength:40,actionable:false,action:null},
 {key:'community-gap:block',type:'gap',source:'discourse',title:'近 30 天 6 个主题在问 Block 显隐',facts:['6 个主题','4 个未标记为已解决'],strength:45,actionable:true,action:'create'},
 // 观察中: two changes the AI judged 先观察; the Reddit one since 9/29 (the day before it was 不用做).
 {key:'reddit-posts',type:'change',source:'reddit',title:'提到产品的 Reddit 帖子增加',chip:{tone:'green',text:'↑ 2 倍'},facts:['近 7 天 6 个帖子','前 7 天 3 个'],strength:30,actionable:true,action:'create'},
 {key:'trends-lowcode',type:'change',source:'trends',title:'「低代码」Google 关注度下降 -12%',facts:['近 4 周 41','前 4 周 47'],strength:25,actionable:false,action:null}]};
const ev=(v:number)=>({analysisVersion:v,periodDays:28,capturedAt:'',availableThrough:null,searchQueries:[],pages:[],industryCandidates:[],limitations:[],...(v===3?{signals}:{})});
// 观察中 records (server watch.js): two open watches, and four ended in the last days with each kind of outcome.
const watch={'reddit-posts':{key:'reddit-posts',source:'reddit',since:'2026-09-29T09:00:00Z',startTitle:'提到产品的 Reddit 帖子增加',startFacts:['近 7 天 4 个帖子','前 7 天 3 个'],startChip:{tone:'green',text:'↑ 1.3 倍'},waitingFor:'出现具体问题或连续两周涨就整理',decideBy:'2026-10-12'},
 'trends-lowcode':{key:'trends-lowcode',source:'trends',since:'2026-10-01T09:00:00Z',startTitle:'「低代码」Google 关注度下降 -12%',startFacts:['近 4 周 41','前 4 周 47'],waitingFor:'看竞品是否同样下降',decideBy:'2026-10-14'},
 'gsc-low-ctr:/cn/commercial':{key:'gsc-low-ctr:/cn/commercial',source:'gsc',since:'2026-09-24T09:00:00Z',startTitle:'/cn/commercial 曝光多、点击少',startFacts:[],decideBy:'2026-10-07',ended:{at:'2026-09-30T09:00:00Z',outcome:'opportunity',reason:'点击率还是 0.4%',opportunityId:'docker'}},
 'ga4-github-referral':{key:'ga4-github-referral',source:'ga4',since:'2026-09-27T09:00:00Z',startTitle:'从 GitHub 来的访问下降 -32%',startFacts:[],decideBy:'2026-10-10',ended:{at:'2026-10-01T09:00:00Z',outcome:'normal'}},
 'packages-downloads':{key:'packages-downloads',source:'packages',since:'2026-09-16T09:00:00Z',startTitle:'下载量下降 21%',startFacts:[],decideBy:'2026-09-29',ended:{at:'2026-09-29T09:00:00Z',outcome:'expired',reason:'到期仍没有结论：季节性波动'}}};
let state={revision:4,goal:null,watch,signalMeta:{} as Record<string,unknown>,opportunityMeta:{old2:{status:'ignored',ignoredAt:'2026-09-30T00:00:00Z'}},
 proposals:[{id:'p1',taskId:12,taskNo:6,insight:{id:'done1'}}],
 insights:{generatedAt:'2026-10-01T09:00:00Z',evidence:ev(3),items:[card('docker','给 docker compose 文档补命令示例',{no:5,reason:'曝光 5,848，正文只有 92 字',signalIds:['site-thin:/docker'],priority:'high'}),card('block','写 Block 显隐的使用文档',{no:4,reason:'30 天 6 个主题在问，网站没有页面',signalIds:['community-gap:block'],sources:['discourse'],change:'unchanged'}),card('impr','全站曝光上升但点击未跟上',{no:6,signalIds:['gsc-site-impressions'],sources:['gsc']}),card('done1','已转任务的机会',{no:3,signalIds:['site-thin:/docker']})],observations:[],signalReviews:{'reddit-posts':{verdict:'watch',reason:'帖子在涨，但还没有具体问题'},'trends-lowcode':{verdict:'watch',reason:'行业整体下降，不是我们的问题'}}},
 insightHistory:[{generatedAt:'2026-09-30T09:00:00Z',evidence:ev(2),items:[],signalReviews:{'reddit-posts':{verdict:'watch',reason:'量还小，再看一周'}}},{generatedAt:'2026-09-29T09:00:00Z',evidence:ev(2),items:[],signalReviews:{'reddit-posts':{verdict:'watch',reason:'刚出现'}}},
  {generatedAt:'2026-09-28T09:00:00Z',signalReviews:{'reddit-posts':{verdict:'skip',reason:'只有 1 个帖子'}},evidence:ev(2),items:[card('old1','首页 AI + 无代码叙事已成型',{no:1,sources:['ga4'],firstSeenAt:'2026-09-28T09:00:00Z'}),card('old2','商业页关键事件高于浏览量',{no:2,sources:['ga4'],firstSeenAt:'2026-09-28T09:00:00Z'})]}]};
const facts={key:'facts',label:'引用的数据与事实准确',required:true};
const playbooks={revision:0,playbooks:[{id:'optimize-page',name:'优化现有页面',kind:'build',category:'optimize',description:'',steps:[{key:'plan',name:'出方案',kind:'analyze',instruction:'先写方案'},{key:'approve-plan',name:'看方案',kind:'review',checklist:[]},{key:'build',name:'修改',kind:'change',instruction:'改页面'},{key:'review',name:'看效果并发布',kind:'review',checklist:[]}],next:[],system:true,version:3},
 {id:'content-outline',name:'内容选题与大纲',kind:'plan',category:'create',description:'',steps:[{key:'analyze',name:'写大纲',kind:'analyze',instruction:'写大纲'},{key:'accept',name:'审核',kind:'review',checklist:[facts]}],next:['new-doc'],system:true,version:3},
 {id:'change-research',name:'变化原因调研',kind:'plan',category:'research',description:'',steps:[{key:'analyze',name:'分析',kind:'analyze',instruction:'调研'},{key:'accept',name:'审核',kind:'review',checklist:[facts]}],next:[],system:true,version:3}]};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 const calls=(window as unknown as {__calls:unknown[]}).__calls,body=JSON.parse(String(init?.body||'{}'));
 if(url.includes('nrStrategy:reviewOpportunity')){calls.push({url:url.split('/api/')[1],...body});return json(state);}
 // A converted opportunity gets task 21 (the hand-off then reads and starts it).
 if(url.includes('nrStrategy:confirmDirection')){calls.push({url:url.split('/api/')[1],...body});state={...state,revision:state.revision+1,proposals:[{id:'p-'+(body.insightId||'draft'),taskId:21,taskNo:3,insight:body.insightId?{id:body.insightId}:null},...state.proposals]};return json(state);}
 if(url.includes('nrTaskWork:get')){calls.push({url:url.split('/api/')[1],...body});return json({work:{revision:7}});}
 if(url.includes('nrTaskWork:advance')){calls.push({url:url.split('/api/')[1],...body});return p.has('startFail')?new Response(JSON.stringify({errors:[{message:'没有在线的电脑'}]}),{status:409,headers:{'Content-Type':'application/json'}}):json({});}
 // 忽略 / 恢复 a watched change: the record ends as ignored, or opens again.
 if(url.includes('nrStrategy:decideSignal')){calls.push({url:url.split('/api/')[1],...body});const w=(state.watch as Record<string,{ended?:unknown}>)[body.signalKey];const meta={...state.signalMeta};if(body.status==='ignored'){meta[body.signalKey]={status:'ignored'};if(w)w.ended={at:'2026-10-01T10:00:00Z',outcome:'ignored'};}else{delete meta[body.signalKey];if(w)delete w.ended;}state={...state,signalMeta:meta,revision:state.revision+1};return json(state);}
 if(url.includes('nrStrategy:state'))return json(state);
 if(url.includes('nrPlaybooks:list'))return json(playbooks);
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
function Where(){const l=useLocation();return <output id="where" hidden>{l.pathname+l.search}</output>;}
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={['/opportunities'+(p.get('q')?'?'+p.get('q'):'')]}><Where/><Routes><Route path="/opportunities" element={<OpportunityLibrary/>}/><Route path="/actions/:taskId" element={<p>task page</p>}/></Routes></MemoryRouter></WorkspaceCacheProvider>);
