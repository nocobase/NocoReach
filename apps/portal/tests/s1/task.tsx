import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import TaskPage from '../../src/pages/task-work';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: renders the real work detail page per step without auth, persistence or model calls.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));document.documentElement.dataset.theme=new URLSearchParams(location.search).get('density')==='default'?'default':'compact';
const step=p.get('step')||'scope';
const plan={deliverable:'改写标题与 meta 描述',verification:'观察点击率',steps:[{id:'s1',title:'完成确认的工作',owner:'ai',instruction:'改写标题与 meta 描述',acceptance:'遵守范围'}]};
const artifact={id:'a1',version:1,content:'标题：5 分钟完成 NocoBase 安装\n描述：从下载到第一个应用，按步骤完成安装。',createdAt:'2026-09-30T09:00:00Z',runId:'r1'};
const work:Record<string,unknown>={schemaVersion:2,revision:3,planVersion:step==='scope'?0:1,step:0,history:[],simple:step!=='scope',kind:'content',humanOwnerId:'1',humanOwnerName:'Esther',
 ...(step==='scope'?{stage:'plan',plan:null,results:[]}:step==='change'?{stage:'work',plan,approvedPlanVersion:1,results:[]}:step==='failed'?{stage:'work',plan,approvedPlanVersion:1,results:[]}:step==='review'?{stage:'work',plan,approvedPlanVersion:1,results:[artifact]}:step==='publish'?{stage:'execution',plan,approvedPlanVersion:1,results:[{...artifact,approvedAt:'t'}]}:{stage:'verification',plan,approvedPlanVersion:1,results:[{...artifact,approvedAt:'t'}],receipt:{note:'9 月 30 日已更新标题与描述',url:'https://example.com/docs/quick-start',recordedAt:'t'}})};
const runs=step==='change'?[{id:'r1',status:'running',planVersion:1,stepId:'s1',executorId:'atlas',createdAt:'2026-09-30T09:00:00Z'}]:step==='failed'?[{id:'r1',status:'failed',error:'模型服务暂时不可用',planVersion:1,stepId:'s1',executorId:'atlas',createdAt:'2026-09-30T09:00:00Z'}]:[];
const task={task:{id:7,title:'改写「快速开始」的标题和描述',brief:'建议：改写标题与 meta 描述，突出“5 分钟完成安装”。\n\n观察：近 28 天曝光 12,400 次，点击率 0.8%。\n\n依据：GSC 28 天页面与查询样本。\n\n限制：查询样本最多 20 条。',evidence:{insight:{evidenceText:'近 28 天曝光 12,400 次，点击率 0.8%，同类文档页面约 3%。GSC 28 天页面与查询样本。'}}},work,runs,artifacts:step==='scope'?[]:[artifact],reviews:[]};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:string[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 if(url.includes('nrTaskWork:advance')){const body=JSON.parse(String(init?.body||'{}'));(window as unknown as {__calls:string[]}).__calls.push(body.command);const next={...task,work:{...work,revision:Number(work.revision)+1,stage:'work',plan,approvedPlanVersion:1,planVersion:1,results:[]},runs:body.command==='startRun'?[{id:'r2',status:'running',planVersion:1,stepId:'s1',executorId:'atlas',createdAt:'2026-09-30T10:00:00Z'}]:[]};return json(next);}
 if(url.includes('nrTaskWork:get'))return json(task);
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={['/actions/7']}><Routes><Route path="/actions/:taskId" element={<TaskPage/>}/></Routes></MemoryRouter></WorkspaceCacheProvider>);
