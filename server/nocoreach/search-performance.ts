// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// 搜索表现: the OpenSEO GSC Insights report (every-app/open-seo db8bde1, src/server/features/gsc/searchPerformanceReport.ts, MIT),
// computed from the daily-synced Search Console partitions instead of live API calls, so it matches 洞察 and 每日分析.
// Totals and the trend use the date-only grain (all queries); with a query or page filter they fall back to the
// query × page grain, which leaves out the queries Google anonymises.

// "Striking distance" = already ranking, not yet in the top spots: where improving a page most plausibly moves traffic.
const STRIKING_MIN=5,STRIKING_MAX=20,STRIKING_LIMIT=100;
const TABLE_LIMIT=3000;

function totals(rows){let clicks=0,impressions=0,weight=0;for(const r of rows){clicks+=Number(r.clicks)||0;impressions+=Number(r.impressions)||0;weight+=(Number(r.position)||0)*(Number(r.impressions)||0);}
 return {clicks,impressions,ctr:impressions?clicks/impressions:0,position:impressions?weight/impressions:0};}

// contains is case-insensitive, equals is exact, as in Search Console.
function matcher(filter){if(!filter?.expression)return ()=>true;const e=String(filter.expression).trim();if(filter.operator==='equals')return v=>v===e;const l=e.toLowerCase();return v=>String(v||'').toLowerCase().includes(l);}
function readFilter(v){if(!v||typeof v!=='object')return null;const expression=String(v.expression||'').trim().slice(0,4096);if(!expression)return null;return {operator:v.operator==='equals'?'equals':'contains',expression};}

// Sum the per-day query × page rows of the window into one row per pair, keeping the impression-weighted position.
function pairs(days,filters={}){const q=matcher(filters.queryFilter),p=matcher(filters.pageFilter),out=new Map();
 for(const rows of days)for(const r of rows||[]){if(!r||!q(r.keyword)||!p(r.page))continue;const k=JSON.stringify([r.keyword,r.page]);let o=out.get(k);if(!o){o={keyword:r.keyword,page:r.page,clicks:0,impressions:0,weight:0};out.set(k,o);}
  o.clicks+=Number(r.clicks)||0;o.impressions+=Number(r.impressions)||0;o.weight+=(Number(r.position)||0)*(Number(r.impressions)||0);}
 return [...out.values()].map(({weight,...o})=>({...o,position:o.impressions?weight/o.impressions:0}));}

function dimension(rows,key){const out=new Map();for(const r of rows){const k=key==='page'?r.page:r.keyword;if(!k)continue;let o=out.get(k);if(!o){o={key:k,clicks:0,impressions:0,weight:0};out.set(k,o);}o.clicks+=r.clicks;o.impressions+=r.impressions;o.weight+=r.position*r.impressions;}
 const list=[...out.values()].map(({weight,...o})=>({...o,ctr:o.impressions?o.clicks/o.impressions:0,position:o.impressions?weight/o.impressions:0})).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions);
 return {rows:list.slice(0,TABLE_LIMIT),total:list.length};}

// A query fans out across every page it ranks on; it is striking distance only when its BEST page sits in 5–20
// (if any page already ranks above 5, improving a secondary page won't move traffic). Ties go to more impressions.
function striking(rows,limit=STRIKING_LIMIT){const best=new Map();
 for(const r of rows){if(!r.keyword||!r.page||!r.impressions)continue;const c=best.get(r.keyword);if(!c||r.position<c.position||(r.position===c.position&&r.impressions>c.impressions))best.set(r.keyword,{query:r.keyword,page:r.page,clicks:r.clicks,impressions:r.impressions,position:r.position});}
 return [...best.values()].filter(r=>r.position>=STRIKING_MIN&&r.position<=STRIKING_MAX).sort((a,b)=>b.impressions-a.impressions).slice(0,limit);}

// 上升最快 / 下降最快 / 新出现 (Search Console Insights' trending queries and pages): each query or page by its clicks
// against the period before; a new one had no impressions in the period before.
const MOVERS_LIMIT=100;
function movers(cur,prev,key,limit=MOVERS_LIMIT){const sum=rows=>{const out=new Map();for(const r of rows){const k=key==='page'?r.page:r.keyword;if(!k)continue;let o=out.get(k);if(!o){o={clicks:0,impressions:0,weight:0};out.set(k,o);}o.clicks+=Number(r.clicks)||0;o.impressions+=Number(r.impressions)||0;o.weight+=(Number(r.position)||0)*(Number(r.impressions)||0);}return out;};
 const a=sum(cur),b=sum(prev),pos=o=>(o&&o.impressions?o.weight/o.impressions:null);
 const all=[...new Set([...a.keys(),...b.keys()])].map(k=>{const x=a.get(k),y=b.get(k);return {key:k,clicks:x?.clicks||0,previousClicks:y?.clicks||0,change:(x?.clicks||0)-(y?.clicks||0),impressions:x?.impressions||0,previousImpressions:y?.impressions||0,position:pos(x),previousPosition:pos(y)};});
 return {rising:all.filter(r=>r.change>0).sort((x,y)=>y.change-x.change||y.impressions-x.impressions).slice(0,limit),
  falling:all.filter(r=>r.change<0).sort((x,y)=>x.change-y.change||y.previousImpressions-x.previousImpressions).slice(0,limit),
  fresh:all.filter(r=>r.impressions>0&&!r.previousImpressions).sort((x,y)=>y.impressions-x.impressions||y.clicks-x.clicks).slice(0,limit)};}

// 本站排名 for keywords (关键词研究, 关键词): Search Console queries matched case-insensitively; position is the
// impression-weighted average over all pages, and the page is the one ranking best (ties: more impressions).
function ranks(rows,keywords){const want=new Set(keywords.map(k=>String(k).toLowerCase().trim())),out={};
 for(const r of rows){const k=String(r.keyword||'').toLowerCase().trim();if(!want.has(k)||!r.impressions)continue;let o=out[k];if(!o){o=out[k]={clicks:0,impressions:0,weight:0,page:r.page,best:r.position,bestImpressions:r.impressions};}
  o.clicks+=r.clicks;o.impressions+=r.impressions;o.weight+=r.position*r.impressions;if(r.position<o.best||(r.position===o.best&&r.impressions>o.bestImpressions)){o.best=r.position;o.bestImpressions=r.impressions;o.page=r.page;}}
 for(const k of Object.keys(out)){const o=out[k];out[k]={clicks:o.clicks,impressions:o.impressions,position:o.weight/o.impressions,page:o.page};}
 return out;}

export { ranks, totals, matcher, readFilter, pairs, dimension, striking, movers, TABLE_LIMIT, STRIKING_MIN, STRIKING_MAX, MOVERS_LIMIT };