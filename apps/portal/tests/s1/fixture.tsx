import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkBoard,type WorkCard} from '../../src/pages/work-board';
import {workState,type Work} from '../../src/pages/task-execution-types';
import '../../src/App.css';
import '../../src/pages/reach-workspace.css';
import '../../src/pages/strategy/strategy.css';
import '../../src/pages/task-board.css';
const p=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',p.has('dark'));
const rows:WorkCard[]=[{id:1,title:'补充博客中的实际案例',brief:'根据已确认资料补充案例，核对事实后交付。',status:'待处理',updatedAt:''},{id:2,title:'调整官网介绍文案',brief:'让首页更清楚地表达产品用途。',status:'待处理',updatedAt:''}];
function Fixture(){const [tasks,setTasks]=useState(rows),[last,setLast]=useState(''),[reject,setReject]=useState(false);return <main className="nr-app nr-discovery nr-task-board"><h1>优化工作</h1><p>合成数据的真实看板组件，仅验证交互，不代表后端持久化。</p><label><input type="checkbox" checked={reject} onChange={e=>setReject(e.target.checked)}/>模拟调用方拒绝保存</label><p role="status">{last}</p><WorkBoard tasks={tasks} busy={false} list={p.has('list')} onOpen={id=>setLast('打开 '+id)} onMove={(t,state,before)=>{setLast(`移动 ${t.id} 到 ${state}，插入 ${before||'末尾'}`);if(reject)return;setTasks(old=>{const moved={...t,evidence:{work:{...t.evidence?.work,stage:'plan',boardState:state} as Work}},rest=old.filter(x=>x.id!==t.id);const i=before?rest.findIndex(x=>x.id===before):-1;rest.splice(i<0?rest.length:i,0,moved);return rest;});}}/><p>卡片总数：{tasks.length} · 待处理：{tasks.filter(t=>workState(t.evidence?.work,t.status)==='todo').length}</p></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
