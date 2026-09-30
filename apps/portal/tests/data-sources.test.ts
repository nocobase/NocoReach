import {it,expect} from 'vitest';
import {catalog,sourceState,categories} from '../src/pages/data-sources';
const by=(id:string)=>catalog.find(s=>s.id===id)!;
it('catalog covers every category and all P0 sources are not planned',()=>{
 expect(new Set(catalog.map(s=>s.category))).toEqual(new Set(categories));
 expect(catalog.filter(s=>s.priority==='P0').every(s=>s.availability!=='planned')).toBe(true);
 expect(catalog.filter(s=>s.availability!=='planned').every(s=>s.guide.intro&&s.guide.needs.length&&s.guide.questions.length)).toBe(true);
});
it('status comes from saved connection state and planned sources never look connected',()=>{
 expect(sourceState(by('trends'),{})).toBe('planned');
 expect(sourceState(by('keywords'),{keyword:{configured:true,verifiedAt:'2026-09-01'}})).toBe('connected');
 expect(sourceState(by('keywords'),{keyword:null})).toBe('ready');
 expect(sourceState(by('gsc'),{google:{configured:false,authorized:false,connection:null}})).toBe('needs-admin');
 expect(sourceState(by('gsc'),{google:{configured:true,authorized:true,connection:{gscSiteUrl:'sc-domain:x',ga4PropertyId:null}}})).toBe('connected');
 expect(sourceState(by('ga4'),{google:{configured:true,authorized:true,connection:{gscSiteUrl:'sc-domain:x',ga4PropertyId:null}}})).toBe('partial');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'disconnected'}]})).toBe('ready');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'active',error:'rate limited'}]})).toBe('partial');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'active'}]})).toBe('connected');
});
