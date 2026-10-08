import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {Toaster} from 'sonner';
import AnalysisRules from '../../src/pages/analysis-rules';
import {WorkspaceCacheProvider} from '../../src/pages/workspace-cache';
import '../../src/App.css';
// Synthetic API responses only: 分析规则 with a few rules of three sources (one without data), the last run, saving.
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const prm=(key:string,label:string,d:number,min:number,max:number,unit='')=>({key,label,default:d,min,max,unit,value:d});
let view={focus:'',watchDays:14,watchLimits:{default:14,min:7,max:28},
 last:{computedAt:'2026-10-08T01:00:00Z',found:52,passed:40,missing:['packages'],analyzedAt:'2026-10-08T01:02:00Z',verdicts:{do:13,watch:9,skip:18}},
 rules:[{id:'gsc-low-ctr',source:'gsc',label:'页面曝光多、点击少',description:'近 28 天曝光多，点击率低于站内中位数的一半，也低于下面的点击率',enabled:true,found:4,params:[prm('minImpressions','曝光至少',500,50,100000),prm('maxCtr','点击率低于',2,0.1,20,'%')]},
  {id:'gsc-near-first',source:'gsc',label:'页面接近首页',description:'平均排名在这个范围、曝光够多的页面，改进后最有希望进前几名',enabled:true,found:11,params:[prm('posFrom','排名从',8,2,50),prm('posTo','到',20,3,100),prm('minImpressions','曝光至少',300,50,100000)]},
  {id:'community-theme',source:'discourse',label:'社区反复问到的主题',description:'近 30 天几个主题都提到同一个词：网站没写的算缺口，写了还在问的算要改',enabled:true,found:5,params:[prm('minTopics','至少',3,2,50,'个主题')]},
  {id:'community-category',source:'discourse',label:'论坛某个分类讨论增加',description:'近 14 天比前 14 天',enabled:false,found:null,params:[prm('minTopics','至少',5,2,100,'个主题'),prm('ratio','是之前的',1.5,1.1,10,'倍')]},
  {id:'github-release',source:'github',label:'新版本发布',description:'近 7 天发布的正式版或预发布版本',enabled:true,found:1,params:[]},
  {id:'packages-downloads',source:'packages',label:'下载量涨跌',description:'近 28 天比前 28 天：全部包合计，或某一个包',enabled:true,found:null,params:[prm('totalPct','合计涨跌至少',20,5,300,'%')]}]};
const json=(data:unknown)=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
const real=window.fetch.bind(window);(window as unknown as {__calls:unknown[]}).__calls=[];
window.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.includes('/api/'))return real(input,init);
 const body=JSON.parse(String(init?.body||'{}'));
 if(url.includes('nrAnalysisRules:view'))return json(view);
 if(url.includes('nrAnalysisRules:save')){(window as unknown as {__calls:unknown[]}).__calls.push(body);
  if(body.rules)view={...view,rules:view.rules.map(r=>{const s=body.rules[r.id]||{};return {...r,enabled:s.enabled!==false,params:r.params.map(x=>({...x,value:s.values?.[x.key]??x.default}))};})};
  if(typeof body.focus==='string')view={...view,focus:body.focus};if(typeof body.watchDays==='number')view={...view,watchDays:body.watchDays};return json(view);}
 if(url.includes('nrSnapshots'))return json([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com'],end:'2026-09-27'}}]);
 return json([]);};
createRoot(document.getElementById('root')!).render(<WorkspaceCacheProvider><MemoryRouter initialEntries={['/rules']}><Routes><Route path="/rules" element={<AnalysisRules/>}/></Routes></MemoryRouter><Toaster/></WorkspaceCacheProvider>);
