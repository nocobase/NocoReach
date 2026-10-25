// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { buildResearchSpec, parseResearch } from './research-adapter.js';
import { VisibilityError } from './research-helpers.js';
const markets=[2840,2826,2124,2036,2702,2276,2250,2392,2158,2344];
const languages=['en','de','fr','ja','zh-TW','zh-CN'];
function specification(v){
 if(!['related','suggestions','ideas','serp'].includes(v.view)||!markets.includes(Number(v.locationCode))||!languages.includes(v.language))throw new VisibilityError(systemMessageText('keywordPolicy.pickSupportedResearchTypeRegion'));
 const target=String(v.target||'').trim();
 // Reject encoded and special search operators that can multiply SERP charges.
 if(target.length<2||target.length>100||/[:%\p{C}]/u.test(target))throw new VisibilityError(systemMessageText('keywordPolicy.keywords2100CharactersWithout'));
 const limit=Number(v.limit||50);if(![20,50,100].includes(limit))throw new VisibilityError(systemMessageText('keywordPolicy.invalidNumberQueries'));
 const spec=buildResearchSpec({kind:'keywords',view:v.view,target,locationCode:Number(v.locationCode),language:v.language,limit:v.view==='serp'?20:limit,offset:0});
 spec.estimatedUsd=v.view==='serp'?0.002:Number((0.012+limit*0.00012).toFixed(6));
 spec.reservationUsd=0.05;spec.priceVersion='official-list-2026-09-23';
 return spec;
}
function result(raw,spec){
 const parsed=parseResearch(raw,spec);
 if(parsed.result){parsed.result.items=parsed.result.items.filter(i=>spec.view!=='serp'||i.raw?.type==='organic').map(({raw: _raw,...i})=>i);}
 return parsed;
}
export { specification, result, markets, languages };