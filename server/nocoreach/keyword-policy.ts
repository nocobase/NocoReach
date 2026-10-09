// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { buildResearchSpec, parseResearch } from './research-adapter.js';
import { VisibilityError } from './research-helpers.js';
const markets=[2840,2826,2124,2036,2702,2276,2250,2392,2158,2344];
const languages=['en','de','fr','ja','zh-TW','zh-CN'];
function specification(v){
 if(!['related','suggestions','ideas','serp'].includes(v.view)||!markets.includes(Number(v.locationCode))||!languages.includes(v.language))throw new VisibilityError('请选择支持的研究类型、地区和语言');
 const target=String(v.target||'').trim();
 // Reject encoded and special search operators that can multiply SERP charges.
 if(target.length<2||target.length>100||/[:%\p{C}]/u.test(target))throw new VisibilityError('关键词需为 2–100 字符，不支持冒号、百分号或控制字符');
 const limit=Number(v.limit||50);if(![20,50,100].includes(limit))throw new VisibilityError('查询数量无效');
 const spec=buildResearchSpec({kind:'keywords',view:v.view,target,locationCode:Number(v.locationCode),language:v.language,limit:v.view==='serp'?20:limit,offset:0});
 spec.estimatedUsd=v.view==='serp'?0.002:Number((0.012+limit*0.00012).toFixed(6));
 spec.reservationUsd=0.05;spec.priceVersion='official-list-2026-09-23';
 return spec;
}
function result(raw,spec){
 const parsed=parseResearch(raw,spec);
 if(parsed.result){parsed.result.items=parsed.result.items.filter(i=>spec.view!=='serp'||i.raw?.type==='organic').map(({raw,...i})=>i);}
 return parsed;
}
export { specification, result, markets, languages };