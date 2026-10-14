// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

const day=86400000;
const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*day).toISOString().slice(0,10);
function compact(rows,grain){
 const groups=new Map();
 for(const row of rows){const key=grain==='source'?JSON.stringify([row.source,row.medium]):grain==='page'?JSON.stringify([row.hostname||'',row.pagePath]):grain==='query_page'?JSON.stringify([row.queryFull||row.query,row.page]):row.periodDate;
  let r=groups.get(key);if(!r){r=grain==='source'?{source:row.source,medium:row.medium,sessions:0,views:0,conversions:0}:grain==='page'?{page:row.pagePath,...(row.hostname?{host:row.hostname}:{}),views:0,conversions:0}:grain==='query_page'?{keyword:row.queryFull||row.query,page:row.page,clicks:0,impressions:0,weight:0}:{date:row.periodDate,views:0,uv:0,sessions:0,engaged:0,conversions:0,clicks:0,impressions:0,weight:0};groups.set(key,r);}
  for(const [to,from] of [['views','views'],['uv','totalUsers'],['sessions','sessions'],['engaged','engagedSessions'],['conversions','keyEvents'],['clicks','clicks'],['impressions','impressions']])if(to in r)r[to]+=Number(row[from]||0);
  if('weight'in r)r.weight+=Number(row.avgPosition||0)*Number(row.impressions||0);
 }
 return [...groups.values()].map(r=>{if('weight'in r){r.position=r.impressions?r.weight/r.impressions:0;delete r.weight;}return r;});
}
function periodWindow(end,key){let start=new Date(Date.parse(end+'T00:00:00Z')+day);if(key.endsWith('m')){const d=start.getUTCDate();start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-parseInt(key));start.setUTCDate(Math.min(d,new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate()));}else start=new Date(Date.parse(end)-(Number(key)-1)*day);const first=start.toISOString().slice(0,10),days=Math.round((Date.parse(end)-Date.parse(first))/day)+1;return {start:first,previousStart:shift(first,-days)};}
function buildSnapshots(partitions,project){
 const select=(source,grain)=>partitions.filter(p=>p.source===source&&p.grain===grain);
 const web=select('ga4','overview').flatMap(p=>p.payload),search=select('gsc','overview').flatMap(p=>p.payload);
 const webEnd=web.map(r=>r.date).sort().at(-1),searchEnd=search.map(r=>r.date).sort().at(-1);if(!webEnd&&!searchEnd)return [];
 const end=webEnd&&searchEnd?(webEnd<searchEnd?webEnd:searchEnd):(webEnd||searchEnd);
 const out=[{key:'project',payload:{...project,end,mode:'google-live',importedAt:new Date().toISOString()}},{key:'history-web',payload:web},{key:'history-search',payload:search}];
 out.push({key:'history-github-referral',payload:select('ga4','source').map(p=>({date:p.date,...p.payload.filter(r=>/(^|\.)github\.com$/i.test(r.source||'')).reduce((a,r)=>({sessions:a.sessions+(r.sessions||0),views:a.views+(r.views||0),conversions:a.conversions+(r.conversions||0)}),{sessions:0,views:0,conversions:0})}))});
 out.push({key:'history-reddit-referral',payload:select('ga4','source').map(p=>({date:p.date,...p.payload.filter(r=>/(^|\.)reddit\.com$|^com\.reddit\./i.test(r.source||'')).reduce((a,r)=>({sessions:a.sessions+(r.sessions||0),views:a.views+(r.views||0),conversions:a.conversions+(r.conversions||0)}),{sessions:0,views:0,conversions:0})}))});
 for(const key of ['7','28','90','3m','6m','12m','16m']){const w=periodWindow(end,key);for(const [grain,limit] of [['source',40],['page',60]]){const rows=select('ga4',grain).filter(p=>p.date>=w.start&&p.date<=end).flatMap(p=>p.payload);const sums=new Map();for(const r of rows){const k=grain==='source'?JSON.stringify([r.source,r.medium]):JSON.stringify([r.host||'',r.page]);const o=sums.get(k)||{...r,views:0,sessions:0,conversions:0};o.views+=r.views;o.sessions+=r.sessions||0;o.conversions+=r.conversions;sums.set(k,o);}out.push({key:`${grain==='source'?'sources':'pages'}-${key}`,payload:[...sums.values()].sort((a,b)=>b.views-a.views).slice(0,limit)});}
 const sums=new Map();for(const p of select('gsc','query_page').filter(p=>p.date>=w.previousStart&&p.date<=end))for(const r of p.payload){const k=JSON.stringify([r.keyword,r.page]);const o=sums.get(k)||{keyword:r.keyword,page:r.page,clicks:0,impressions:0,previous:0,previousImpressions:0,weight:0};if(p.date>=w.start){o.clicks+=r.clicks;o.impressions+=r.impressions;o.weight+=r.position*r.impressions;}else{o.previous+=r.clicks;o.previousImpressions+=r.impressions;}sums.set(k,o);}
 const keywords=new Map();for(const r of sums.values())keywords.set(r.keyword,(keywords.get(r.keyword)||0)+r.impressions);const top=new Set([...keywords].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([k])=>k));out.push({key:`queries-${key}`,payload:[...sums.values()].filter(r=>top.has(r.keyword)&&(r.impressions>20||r.previous>5)).sort((a,b)=>b.impressions-a.impressions).slice(0,250).map(({weight,...r})=>({...r,position:r.impressions?weight/r.impressions:0}))});
 }
 return out;
}
export { shift, compact, periodWindow, buildSnapshots };