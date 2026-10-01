import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import TaskPage from '../../src/pages/task-work';
import PlaybooksPage from '../../src/pages/playbooks';
import StrategyPage from '../../src/pages/strategy';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: the playbook task page per state, and the 做法 page, without auth or model calls.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const state=p.get('state')||'start';
const pb=(id:string,name:string,kind:'plan'|'build',next:string[]=[],extra={})=>({id,name,kind,description:`${name}的简介`,instructions:`${name}的说明：目标、步骤和交付物。`,planFirst:kind==='build'?true:undefined,checklist:kind==='plan'?[{key:'facts',label:'引用的数据与事实准确',required:true}]:[{key:'scope',label:'改动范围与任务说明一致',required:true}],next,system:true,version:1,...extra});
const playbooks={revision:2,playbooks:[pb('change-research','变化原因调研','plan',['optimize-page']),pb('content-outline','内容选题与大纲','plan',['new-doc','blog-post']),pb('optimize-page','优化现有页面','build'),pb('new-doc','新建文档页','build'),pb('blog-post','写博客文章','build'),{...pb('custom-1','只改英文的优化','build'),system:false,planFirst:false}]};
const planStages=[{key:'draft',name:'撰写',kind:'ai',instruction:'x'},{key:'accept',name:'审核',kind:'review',checklist:[{key:'facts',label:'引用的数据与事实准确',required:true}]}];
const buildStages=[{key:'plan',name:'出方案',kind:'agent',instruction:'先不要修改文件。读任务说明、依据和仓库，写出具体方案。'},{key:'approve-plan',name:'看方案',kind:'review',checklist:[]},{key:'build',name:'修改并开 PR',kind:'agent',instruction:'按任务说明优化对应页面。'},{key:'review',name:'审核 PR',kind:'review',checklist:[{key:'scope',label:'改动范围与任务说明一致',required:true}]},{key:'publish',name:'发布',kind:'publish'},{key:'observe',name:'观察',kind:'observe'}];
const doc={id:'a1',stepId:'draft',planVersion:0,version:2,content:'## 选题\nBlock 显隐与编辑\n\n## 大纲\n1. 什么时候需要隐藏区块\n2. 显隐规则怎么配置\n3. 常见问题：Show block card 关闭后无法编辑',createdAt:'2026-10-01T09:00:00Z',createdBy:'system',runId:'r1'};
const plan={id:'p1',stepId:'plan',planVersion:0,version:1,content:'改 docs/docs/en/nocobase-cli/installation/docker-compose.md：补充常用命令表和三个常见报错。',manual:true,approvedAt:'t',createdAt:'t',createdBy:'1'};
const pr={id:'p2',stepId:'build',planVersion:0,version:1,content:'PR https://github.com/estheryo/docs-test/pull/3',manual:true,createdAt:'t',createdBy:'1'};
const isPlan=['ai','review'].includes(state);
const work:Record<string,unknown>={schemaVersion:2,revision:7,planVersion:0,step:0,plan:null,humanOwnerId:'1',humanOwnerName:'Esther',history:[{at:'2026-10-01T08:59:00Z',actor:'1',action:'startTask',note:isPlan?'内容选题与大纲':'优化现有页面'},{at:'2026-10-01T09:00:00Z',actor:'1',action:'runQueued',note:'撰写'},{at:'2026-10-01T09:01:00Z',actor:'system',action:'runSucceeded'},{at:'2026-10-01T09:02:00Z',actor:'1',action:'comment',comment:'例子用中文界面截图'}],
 ...(state==='start'?{stage:'plan',playbookId:'new-doc',results:[]}:isPlan?{stage:'flow',playbook:{id:'content-outline',name:'内容选题与大纲',kind:'plan',version:1,next:['new-doc','blog-post']},flow:{id:'content-outline',name:'内容选题与大纲',version:1,stages:planStages},stageIndex:state==='ai'?0:1,results:state==='ai'?[]:[doc]}
 :{stage:state==='done'?'done':'flow',playbook:{id:'optimize-page',name:'优化现有页面',kind:'build',version:1,next:[]},flow:{id:'optimize-page',name:'优化现有页面',version:1,stages:buildStages},stageIndex:{plan:0,pr:3,publish:4,done:5}[state],results:state==='plan'?[]:[plan,null,pr],...(state==='done'?{receipt:{note:'已合并 PR #3 并上线',url:'https://example.com/docs/docker',recordedAt:'t'},observeFrom:'2026-10-01T10:00:00Z'}:{})})};
const runs=state==='ai'?[{id:'r1',status:'running',planVersion:0,stepId:'draft',executorId:'atlas',createdAt:'2026-10-01T09:00:00Z'}]:[];
const signals={items:[{key:'community-gap:block',source:'discourse',title:'近 30 天 6 个主题在问 Block 显隐',facts:['6 个主题','4 个未标记为已解决']}]};
const task={task:{id:12,title:state==='start'?'新建文档页：补写 Block 显隐文档':isPlan?'补写 Block 显隐与编辑文档':'加长 docker compose 安装文档',brief:'行动目标：补齐文档。\n\n建议：新建 JS Block 使用文档页。',evidence:{insight:{signalIds:['community-gap:block']},context:{signals},...(state==='start'?{handoff:{taskId:'11',playbook:'内容选题与大纲',content:doc.content}}:{})}},work,runs,artifacts:[],reviews:[],playbookDefault:'new-doc',related:state==='start'?[{id:11,title:'补写 Block 显隐与编辑文档',relation:'prev'}]:[]};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 if(url.includes('nrTaskWork:advance')){(window as unknown as {__calls:unknown[]}).__calls.push(JSON.parse(String(init?.body||'{}')));return json(task);}
 if(url.includes('nrTaskWork:get'))return json(task);
 if(url.includes('nrPlaybooks:list'))return json(playbooks);
 if(url.includes('nrPlaybooks:'))return json({...playbooks,playbook:playbooks.playbooks[5]});
 if(url.includes('nrStrategy:state'))return json({revision:1,goal:null,proposals:[],opportunityMeta:{},insights:{generatedAt:'2026-10-01T01:00:00Z',evidence:{analysisVersion:3,periodDays:28,signals:{computedAt:'',coverage:{},missing:[],items:[]}},items:[],observations:['近 28 天全站搜索曝光上升 18%，点击只增长 3.6%。']}});
 if(url.includes('nrStrategy:context'))return json({evidence:{periodDays:28,availableThrough:'2026-09-27',summary:null},warnings:[]});
 if(url.includes('nrAnalysis:status'))return json({running:false,last:{ok:true},runs:[{ok:true,trigger:'workflow'}],schedule:{enabled:true}});
 if(url.includes('nrTasks:list'))return json([{id:12,title:'补写 Block 显隐与编辑文档',status:'待确认',updatedAt:'2026-10-01T09:05:00Z',evidence:{work:{stage:'flow',flow:{stages:[{key:'draft',name:'撰写',kind:'ai'},{key:'accept',name:'审核',kind:'review'}]},stageIndex:1}}},{id:13,title:'加长 docker compose 安装文档',status:'待确认',updatedAt:'2026-10-01T08:00:00Z',evidence:{work:{stage:'flow',flow:{stages:[{key:'plan',name:'出方案',kind:'agent'},{key:'approve-plan',name:'看方案',kind:'review'}]},stageIndex:1}}},{id:14,title:'进行中的任务',status:'进行中',evidence:{work:{stage:'flow',flow:{stages:[{key:'draft',name:'撰写',kind:'ai'}]},stageIndex:0}}}]);
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
const path=p.get('page')==='insights'?'/home':p.get('page')==='playbooks'?'/playbooks'+(p.get('id')?'?id='+p.get('id'):''):'/actions/12';
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/actions/:taskId" element={<TaskPage/>}/><Route path="/playbooks" element={<PlaybooksPage/>}/><Route path="/home" element={<StrategyPage/>}/></Routes></MemoryRouter></WorkspaceCacheProvider>);
