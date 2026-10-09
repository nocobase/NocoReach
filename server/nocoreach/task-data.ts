// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// What the local Agent and the online AI know about each other's side (2026-10-08 user decision, see
// docs/research/agent-context-sharing-proposal.md): each Agent run carries a short data summary of the page it works on
// (search, visits, audit issues, tracked keywords, earlier tasks on that page and their effect), and the daily analysis
// reads the tasks of the last 30 days. Only synced or saved data is read; nothing is fetched, nothing costs money.
const DAY=86400000;
const n=v=>Number(v||0).toLocaleString('en-US');
const pathOf=u=>{let p;try{p=new URL(String(u)).pathname;}catch{p=String(u||'').split(/[?#]/)[0];}return p.replace(/\/+$/,'')||'/';};
const CONCLUSION={up:'上升',down:'下降',flat:'持平',insufficient:'数据不足'};
// One line per effect checkpoint (day 7, day 28), as the task page shows them.
function effectLines(w){return ((w?.observation?.results)||[]).map(r=>{
 if(r.conclusion==='insufficient'||!r.primary||r.change==null)return `第 ${r.day} 天：数据不足`;
 const [b,a]=r.primary==='clicks'?(r.gsc?.clicks||[]):(r.ga4?.views||[]),p=Math.round(r.change*100);
 return `第 ${r.day} 天：${CONCLUSION[r.conclusion]||r.conclusion}，${r.primary==='clicks'?'搜索点击':'浏览量'} ${b} → ${a}（${p>0?'+':''}${p}%）`;});}
// Where a task stands, in a few words.
function taskState(task,w){
 if(!w)return '还没开始';if(w.cancelledAt)return '已关闭';if(w.revert&&w.revert.state!=='failed')return '已撤回';
 const stage=w.flow?.stages?.[w.stageIndex||0];
 if(w.stage==='done')return w.observeFrom?'已上线，效果观察结束':'已完成';
 if(stage?.kind==='observe')return '已上线，正在观察效果';
 if(w.archivedAt)return '已关闭';
 if(!w.flow)return '还没开始';
 return `进行中：${stage?.name||''}`;}
class TaskData{
 constructor(p){this.p=p;}
 async tasks(project){const rows=[];for(let offset=0;offset<2000;offset+=200){const page=await this.p.db.getRepository('nrTasks').find({filter:{projectId:project},sort:['-createdAt'],limit:200,offset});rows.push(...page.map(r=>r.toJSON?r.toJSON():r));if(page.length<200)break;}return rows;}
 // The Agent's data summary, as text lines; empty when nothing is known.
 async forRun(project,{url,taskId}={}){
  const lines=[];let snaps=[];try{snaps=await this.p.sync.snapshots(project);}catch{snaps=[];}
  const get=k=>snaps.find(s=>s.key===k)?.payload,end=[...(get('history-search')||[]),...(get('history-web')||[])].map(r=>r.date).sort().at(-1);
  if(url){const path=pathOf(url),queries=(get('queries-28')||[]).filter(r=>pathOf(r.page)===path),page=(get('pages-28')||[]).find(r=>pathOf(r.page)===path);
   if(queries.length){const clicks=queries.reduce((s,r)=>s+(Number(r.clicks)||0),0),imp=queries.reduce((s,r)=>s+(Number(r.impressions)||0),0),pos=imp?queries.reduce((s,r)=>s+(Number(r.position)||0)*(Number(r.impressions)||0),0)/imp:null;
    lines.push(`搜索（近 28 天）：点击 ${n(clicks)}，曝光 ${n(imp)}，点击率 ${imp?(clicks/imp*100).toFixed(1):'0'}%${pos?`，平均排名 ${pos.toFixed(1)}`:''}`);
    lines.push(`主要搜索词：${queries.slice().sort((a,b)=>(b.impressions||0)-(a.impressions||0)).slice(0,8).map(r=>`${r.keyword}（曝光 ${n(r.impressions)}，点击 ${n(r.clicks)}${r.position?`，第 ${Number(r.position).toFixed(1)} 位`:''}）`).join('；')}`);}
   if(page)lines.push(`访问（近 28 天）：浏览 ${n(page.views)}${page.conversions?`，关键事件 ${n(page.conversions)}`:''}`);
   const audit=await this.p.audit?.report?.(project).catch(()=>null);
   const issues=(audit?.issues||[]).filter(i=>(i.pages||[]).some(p=>pathOf(p?.url||p)===path)).map(i=>`${i.title}${i.severity==='critical'?'（严重）':i.severity==='warning'?'（警告）':''}`);
   if(issues.length)lines.push(`网站审计里这页的问题：${issues.join('；')}`);
   const rank=await this.p.rankTracking?.status?.(project).catch(()=>null);
   const ranked=(rank?.keywords||[]).filter(k=>k.latest?.url&&pathOf(k.latest.url)===path).slice(0,10).map(k=>`${k.keyword} 第 ${k.latest.position||'100+'} 位${k.previous?`（上次 ${k.previous.position||'100+'}）`:''}`);
   if(ranked.length)lines.push(`排名跟踪：${ranked.join('；')}`);
   const earlier=(await this.tasks(project).catch(()=>[])).filter(t=>String(t.id)!==String(taskId)&&t.evidence?.work?.page?.url&&pathOf(t.evidence.work.page.url)===path).slice(0,5)
    .map(t=>{const w=t.evidence.work,e=effectLines(w);return `${t.evidence?.no?`T-${t.evidence.no} `:''}${t.title}（${taskState(t,w)}${e.length?`；${e.join('；')}`:''}）`;});
   if(earlier.length)lines.push(`这页以前的任务：${earlier.join('；')}`);
   if(!lines.length)lines.push('这页在已同步的数据里没有找到搜索和访问记录（可能是新页面，或 Google 还没接入）。');
  }else{
   const view=await this.p.dataViews?.search?.(project,{range:'28'}).catch(()=>null),t=view?.totals,pv=view?.previous;
   if(t)lines.push(`全站搜索（近 28 天）：点击 ${n(t.clicks)}，曝光 ${n(t.impressions)}${pv?`（前 28 天点击 ${n(pv.clicks)}，曝光 ${n(pv.impressions)}）`:''}`);
   const web=get('pages-28')||[];if(web.length)lines.push(`访问最多的页面：${web.slice(0,5).map(r=>`${pathOf(r.page)}（浏览 ${n(r.views)}）`).join('；')}`);
  }
  if(lines.length&&end)lines.unshift(`数据截至 ${end}，来自 NocoReach 已同步的数据，只用于参考。`);
  return lines.join('\n');}
 // The daily analysis: the tasks of the last 30 days, and any still under observation.
 async recent(project,now=Date.now()){
  const since=new Date(now-30*DAY).toISOString();
  return (await this.tasks(project)).filter(t=>String(t.updatedAt||t.createdAt||'')>=since||t.evidence?.work?.flow?.stages?.[t.evidence.work.stageIndex||0]?.kind==='observe').slice(0,30)
   .map(t=>{const w=t.evidence?.work;return {no:t.evidence?.no?`T-${t.evidence.no}`:null,title:t.title,playbook:w?.playbook?.name||null,page:w?.page?.url||null,state:taskState(t,w),effects:effectLines(w),opportunity:t.evidence?.insight?.id||null};});}
}
export { TaskData, effectLines, taskState, pathOf };