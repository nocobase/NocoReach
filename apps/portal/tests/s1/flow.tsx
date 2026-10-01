import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import TaskPage from '../../src/pages/task-work';
import FlowsPage from '../../src/pages/flows';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: renders the flow task page per stage and the flows page without auth or model calls.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const state=p.get('state')||'start';
const siteChange={id:'site-change',name:'官网修改',system:true,version:1,description:'在线 AI 写方案，你批准后由本机 Agent 写进仓库并创建 PR，审核后发布并观察效果。',stages:[
 {key:'plan',name:'写方案',kind:'ai',instruction:'根据依据和关联页面写修改方案。'},
 {key:'approve-plan',name:'批准方案',kind:'review',checklist:[{key:'scope',label:'修改范围合理，不涉及无关页面',required:true},{key:'facts',label:'数据与事实准确',required:true}]},
 {key:'repo',name:'写进仓库',kind:'agent',instruction:'按已批准的方案修改仓库中对应的文件，运行检查，推送分支并创建 PR。'},
 {key:'review',name:'审核',kind:'review',checklist:[{key:'diff',label:'改动与批准的方案一致',required:true}]},
 {key:'publish',name:'发布',kind:'publish'},{key:'observe',name:'观察',kind:'observe'}]};
const research={id:'research',name:'调研报告',system:true,version:1,description:'在线 AI 根据数据写调研报告，你审核后完成。',stages:[{key:'research',name:'调研',kind:'ai',instruction:'写调研报告。'},{key:'review',name:'审核报告',kind:'review',checklist:[]}]};
const custom={id:'custom-1a2b3c4d',name:'官网修改 · 多语言',version:2,description:'复制自官网修改，加了多语言同步。',copiedFrom:'site-change',stages:[siteChange.stages[0],siteChange.stages[1],siteChange.stages[2],{key:'i18n',name:'同步多语言',kind:'agent',instruction:'把改动同步到 es、ru、ja 版本，提交到同一个 PR。'},siteChange.stages[3],siteChange.stages[4],siteChange.stages[5]]};
const flows={revision:3,flows:[siteChange,research,custom]};
const plan={id:'a1',stepId:'plan',planVersion:0,version:1,content:'## 修改方案\n1. 安装文档 docker compose 一节补充完整的 compose 文件示例与升级步骤。\n2. 标题改为「使用 Docker Compose 安装 NocoBase」。\n\n效果判断：上线后观察该页搜索点击与停留。',createdAt:'2026-10-01T09:00:00Z',createdBy:'system',runId:'r1'};
const index:Record<string,number>={start:0,ai:0,review:1,agent:2,publish:4,done:5};
const results=state==='review'?[plan]:state==='agent'?[{...plan,approvedAt:'t'}]:state==='publish'||state==='done'?[{...plan,approvedAt:'t'},null,{id:'a2',stepId:'repo',planVersion:0,version:1,content:'PR https://github.com/nocobase/docs/pull/482',manual:true,approvedAt:'t',createdAt:'t',createdBy:'1'}]:[];
const work:Record<string,unknown>={schemaVersion:2,revision:5,planVersion:0,step:0,history:[],plan:null,humanOwnerId:'1',humanOwnerName:'Esther',results,
 ...(state==='start'?{stage:'plan'}:{stage:state==='done'?'done':'flow',flow:{id:'site-change',name:'官网修改',version:1,stages:siteChange.stages},stageIndex:index[state]}),
 ...(state==='done'?{receipt:{note:'已合并 PR #482 并上线',url:'https://example.com/docs/docker',recordedAt:'t'},observeFrom:'2026-10-01T10:00:00Z'}:{})};
const runs=state==='ai'?[{id:'r1',status:'running',planVersion:0,stepId:'plan',executorId:'atlas',createdAt:'2026-10-01T09:00:00Z'}]:[];
const task={task:{id:12,title:'加长 docker compose 安装文档',brief:'建议：补充 docker compose 安装文档的内容。',evidence:{insight:{evidenceText:'搜索点击 −41%（9/1–9/27），正文约 120 字，社区近 30 天 4 个相关提问。'}}},work,runs,artifacts:results.filter(Boolean),reviews:[],flowDefault:'site-change'};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 if(url.includes('nrTaskWork:advance')){(window as unknown as {__calls:unknown[]}).__calls.push(JSON.parse(String(init?.body||'{}')));return json(task);}
 if(url.includes('nrTaskWork:get'))return json(task);
 if(url.includes('nrFlows:list'))return json(flows);
 if(url.includes('nrFlows:'))return json({...flows,flow:custom});
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
const path=p.get('page')==='flows'?'/flows':'/actions/12';
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={[path+(p.get('flow')?'?flow='+p.get('flow'):'')]}><Routes><Route path="/actions/:taskId" element={<TaskPage/>}/><Route path="/flows" element={<FlowsPage/>}/></Routes></MemoryRouter></WorkspaceCacheProvider>);
