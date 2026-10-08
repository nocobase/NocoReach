import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {Toaster} from 'sonner';
import Members from '../../src/pages/members';
import AnalysisRules from '../../src/pages/analysis-rules';
import {MemberGate} from '../../src/pages/me';
import {NotificationBell} from '../../src/components/app-shell/notification-bell';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: 设置 · 成员 and a settings page as 管理员 (?as=admin, default), 成员 (?as=member) or someone
// who has not joined (?as=none); ?page=rules opens 分析规则.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const as=p.get('as')||'admin';
const me={admin:{id:'1',name:'Esther',role:'admin'},member:{id:'2',name:'Lin',role:'member'},none:{id:'9',name:'Mia',role:null}}[as];
let users=[{id:'1',name:'Esther',account:'esther',role:'admin',locked:true},{id:'2',name:'Lin',account:'lin',role:'member',locked:false},{id:'3',name:'Kai',account:'kai@example.com',role:'admin',locked:false},{id:'9',name:'Mia',account:'mia',role:null,locked:false}];
const order:Record<string,number>={admin:0,member:1};
let inbox=[{id:'m1',title:'T-12 等你看方案',content:'补写 Block 显隐文档',status:'unread',receiveTimestamp:Date.now()-5*60000,options:{url:'/x/main/rules'}},{id:'m2',title:'你是 T-9 的负责人了',content:'更新首页的安装命令（Esther 指定）',status:'read',receiveTimestamp:Date.now()-3*3600000,options:{url:'/x/main/members'}}];
const rules={focus:'社区问题优先',watchDays:14,watchLimits:{default:14,min:7,max:28},last:null,rules:[{id:'gsc-low-ctr',source:'gsc',label:'页面曝光多、点击少',description:'近 28 天曝光多',enabled:true,found:4,params:[{key:'minImpressions',label:'曝光至少',default:500,min:50,max:10000,unit:'',value:500}]}]};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(status===200?{data}:{errors:[{message:data}]}),{status,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 const body=JSON.parse(String(init?.body||'{}'));
 // 通知: two messages on NocoReach's channel, one unread linking to 分析规则.
 if(url.includes('myInAppMessages:list'))return json({messages:inbox});
 if(url.includes('notificationInAppMessages:updateMyOwn')){(window as unknown as {__calls:unknown[]}).__calls.push({read:new URL(url,location.href).searchParams.get('filterByTk')||'all'});inbox=inbox.map(m=>({...m,status:'read'}));return json({});}
 if(url.includes('nrMembers:me'))return json(me);
 if(url.includes('nrMembers:list'))return json(users);
 if(url.includes('nrMembers:setRole')){(window as unknown as {__calls:unknown[]}).__calls.push(body);
  if(body.userId===me.id)return json('不能在这里改自己的角色',409);
  users=users.map(u=>u.id===body.userId?{...u,role:body.role}:u).sort((a,b)=>(order[a.role||'']??2)-(order[b.role||'']??2)||Number(a.id)-Number(b.id));return json(users);}
 if(url.includes('nrAnalysisRules:view'))return json(rules);
 if(url.includes('nrSnapshots')||url.includes('nrProjects:list'))return json([{id:1,name:'Demo',domains:['example.com']}]);
 return json([]);};
const page=p.get('page')==='rules'?'/rules':'/members';
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={[page]}><div className="flex justify-end p-2"><NotificationBell/></div><MemberGate><Routes><Route path="/members" element={<Members/>}/><Route path="/rules" element={<AnalysisRules/>}/></Routes></MemberGate></MemoryRouter><Toaster/></WorkspaceCacheProvider>);
