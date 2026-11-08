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
const RANGES=['7','28','90','3m','6m','12m','16m'];
// Each (keyword, page)'s sums for one range: clicks, impressions, previous clicks, previous impressions, position weight.
const PAIR_FIELDS=5,PAIR_BLOCK=4096;
const isPageDay=p=>(p.source==='ga4'&&p.grain==='page')||(p.source==='gsc'&&p.grain==='query_page');
// The snapshots of a project's stored days, from its days other than page days (`base`), then its page days one at a
// time (`add`): a day's rows are summed into each range they fall in and dropped, so a build holds the sums of every
// (keyword, page) rather than every row of every day (1.5 million rows, 600 MB of heap for 210 days on 252). The
// result matches summing every row at once, in the same order: rows within a range in the order their days were added,
// ties kept in the order a (keyword, page) first appeared in that range.
function snapshotBuilder(base,project){
 const select=(source,grain)=>base.filter(p=>p.source===source&&p.grain===grain);
 const web=select('ga4','overview').flatMap(p=>p.payload),search=select('gsc','overview').flatMap(p=>p.payload);
 const webEnd=web.map(r=>r.date).sort().at(-1),searchEnd=search.map(r=>r.date).sort().at(-1);if(!webEnd&&!searchEnd)return {add(){},finish:()=>[]};
 const end=webEnd&&searchEnd?(webEnd<searchEnd?webEnd:searchEnd):(webEnd||searchEnd);
 const windows=RANGES.map(key=>periodWindow(end,key)),R=windows.length,pages=windows.map(()=>new Map());
 // Every (keyword, page) seen, by index; for each range, its sums and the order it first appeared in (-1: not in it).
 const index=new Map(),keywords=[],addresses=[],seen=new Int32Array(R),sums=[],first=[];
 const pairOf=(keyword,page)=>{const k=JSON.stringify([keyword,page]);let j=index.get(k);if(j!==undefined)return j;j=keywords.length;index.set(k,j);keywords.push(keyword);addresses.push(page);
  // Blocks of PAIR_BLOCK pairs: growing one array would copy it, holding both for a moment.
  if(j%PAIR_BLOCK===0){sums.push(new Float64Array(PAIR_BLOCK*R*PAIR_FIELDS));first.push(new Int32Array(PAIR_BLOCK*R).fill(-1));}return j;};
 const slot=(j,i)=>(j%PAIR_BLOCK)*R+i;
 return {
  add(p){
   if(p.source==='ga4'&&p.grain==='page'){for(let i=0;i<R;i++){if(p.date<windows[i].start||p.date>end)continue;const m=pages[i];for(const r of p.payload){const k=JSON.stringify([r.host||'',r.page]);const o=m.get(k)||{...r,views:0,sessions:0,conversions:0};o.views+=r.views;o.sessions+=r.sessions||0;o.conversions+=r.conversions;m.set(k,o);}}return;}
   if(p.source!=='gsc'||p.grain!=='query_page')return;
   const ranges=windows.map((w,i)=>p.date>=w.previousStart&&p.date<=end?i:-1).filter(i=>i>=0);if(!ranges.length)return;
   for(const r of p.payload){const j=pairOf(r.keyword,r.page);const b=Math.floor(j/PAIR_BLOCK),f=first[b],v=sums[b];for(const i of ranges){const at=slot(j,i),o=at*PAIR_FIELDS;if(f[at]<0)f[at]=seen[i]++;
    if(p.date>=windows[i].start){v[o]+=r.clicks;v[o+1]+=r.impressions;v[o+4]+=r.position*r.impressions;}else{v[o+2]+=r.clicks;v[o+3]+=r.impressions;}}}
  },
  finish(){
   const out=[{key:'project',payload:{...project,end,mode:'google-live',importedAt:new Date().toISOString()}},{key:'history-web',payload:web},{key:'history-search',payload:search}];
   out.push({key:'history-github-referral',payload:select('ga4','source').map(p=>({date:p.date,...p.payload.filter(r=>/(^|\.)github\.com$/i.test(r.source||'')).reduce((a,r)=>({sessions:a.sessions+(r.sessions||0),views:a.views+(r.views||0),conversions:a.conversions+(r.conversions||0)}),{sessions:0,views:0,conversions:0})}))});
   out.push({key:'history-reddit-referral',payload:select('ga4','source').map(p=>({date:p.date,...p.payload.filter(r=>/(^|\.)reddit\.com$|^com\.reddit\./i.test(r.source||'')).reduce((a,r)=>({sessions:a.sessions+(r.sessions||0),views:a.views+(r.views||0),conversions:a.conversions+(r.conversions||0)}),{sessions:0,views:0,conversions:0})}))});
   RANGES.forEach((key,i)=>{const w=windows[i];
    const rows=select('ga4','source').filter(p=>p.date>=w.start&&p.date<=end).flatMap(p=>p.payload);const sources=new Map();for(const r of rows){const k=JSON.stringify([r.source,r.medium]);const o=sources.get(k)||{...r,views:0,sessions:0,conversions:0};o.views+=r.views;o.sessions+=r.sessions||0;o.conversions+=r.conversions;sources.set(k,o);}
    out.push({key:`sources-${key}`,payload:[...sources.values()].sort((a,b)=>b.views-a.views).slice(0,40)});
    out.push({key:`pages-${key}`,payload:[...pages[i].values()].sort((a,b)=>b.views-a.views).slice(0,60)});
    // The range's (keyword, page)s in the order they first appeared in it.
    const order=new Int32Array(seen[i]);for(let j=0;j<keywords.length;j++){const f=first[Math.floor(j/PAIR_BLOCK)][slot(j,i)];if(f>=0)order[f]=j;}
    const field=(j,n)=>sums[Math.floor(j/PAIR_BLOCK)][slot(j,i)*PAIR_FIELDS+n],totals=new Map();for(const j of order)totals.set(keywords[j],(totals.get(keywords[j])||0)+field(j,1));
    const top=new Set([...totals].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([k])=>k));
    out.push({key:`queries-${key}`,payload:[...order].filter(j=>top.has(keywords[j])&&(field(j,1)>20||field(j,2)>5)).sort((a,b)=>field(b,1)-field(a,1)).slice(0,250).map(j=>({keyword:keywords[j],page:addresses[j],clicks:field(j,0),impressions:field(j,1),previous:field(j,2),previousImpressions:field(j,3),position:field(j,1)?field(j,4)/field(j,1):0}))});
   });
   return out;
  }};
}
function buildSnapshots(partitions,project){const builder=snapshotBuilder(partitions.filter(p=>!isPageDay(p)),project);for(const p of partitions)if(isPageDay(p))builder.add(p);return builder.finish();}
export { shift, compact, periodWindow, buildSnapshots, snapshotBuilder, isPageDay };