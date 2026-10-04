import {it,expect} from 'vitest';
import {catalog,sourceState,categories} from '../src/pages/data-sources';
const by=(id:string)=>catalog.find(s=>s.id===id)!;
it('catalog covers every category and all P0 sources are not planned',()=>{
 expect(new Set(catalog.map(s=>s.category))).toEqual(new Set(categories));
 expect(catalog.filter(s=>s.priority==='P0').every(s=>s.availability!=='planned')).toBe(true);
 expect(catalog.filter(s=>s.availability!=='planned').every(s=>s.guide.intro&&s.guide.needs.length&&s.guide.questions.length)).toBe(true);
});
it('status comes from saved connection state and planned sources never look connected',()=>{
 expect(sourceState({...by('trends'),availability:'planned'},{trends:{connected:true}})).toBe('planned');
 expect(catalog.some(s=>s.id==='cms')).toBe(false);
 for(const [id,key] of [['trends','trends'],['competitors','competitors'],['social','x']] as const){expect(sourceState(by(id),{})).toBe('ready');expect(sourceState(by(id),{[key]:{connected:true}})).toBe('connected');}
 expect(sourceState(by('discord'),{chat:{discord:{connected:true},slack:{connected:false}}})).toBe('connected');expect(sourceState(by('slack'),{chat:{discord:{connected:true},slack:{connected:false}}})).toBe('ready');
 expect(sourceState(by('discourse'),{community:{connected:true,lastSync:{ok:false}}})).toBe('partial');
 expect(sourceState(by('discourse'),{community:{connected:false}})).toBe('ready');
 expect(sourceState(by('keywords'),{keyword:{configured:true,verifiedAt:'2026-09-01'}})).toBe('connected');
 expect(sourceState(by('keywords'),{keyword:null})).toBe('ready');
 expect(sourceState(by('gsc'),{google:{configured:false,authorized:false,connection:null}})).toBe('needs-admin');
 expect(sourceState(by('gsc'),{google:{configured:true,authorized:true,connection:{gscSiteUrl:'sc-domain:x',ga4PropertyId:null}}})).toBe('connected');
 expect(sourceState(by('ga4'),{google:{configured:true,authorized:true,connection:{gscSiteUrl:'sc-domain:x',ga4PropertyId:null}}})).toBe('partial');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'disconnected'}]})).toBe('ready');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'active',error:'rate limited'}]})).toBe('partial');
 expect(sourceState(by('github'),{publicSources:[{kind:'github',status:'active'}]})).toBe('partial');
 expect(sourceState(by('github'),{github:{connected:true}})).toBe('connected');
 expect(sourceState(by('github-traffic'),{github:{connected:true,token:null}})).toBe('ready');
 expect(sourceState(by('github-traffic'),{github:{connected:true,token:{error:'token 无效或已过期'}}})).toBe('partial');
 expect(sourceState(by('github-traffic'),{github:{connected:true,token:{error:null}}})).toBe('connected');
});
it('every source says what it is used for; only the source-code repository can be modified',()=>{
 expect(catalog.every(s=>s.uses.length>0&&s.uses.includes('analyze'))).toBe(true);
 expect(catalog.filter(s=>s.uses.includes('modify')).map(s=>s.id).sort()).toEqual(['repo']);
 expect(by('repo').category).toBe('网站与产品');
 expect(categories).toEqual(['网站与产品','搜索与市场','社区']);expect(by('gsc').category).toBe('搜索与市场');expect(by('github-discussions').category).toBe('网站与产品');expect(by('social').category).toBe('社区');
 expect(sourceState(by('repo'),{repo:{repo:'estheryo/website-test'}})).toBe('connected');
 expect(sourceState(by('repo'),{repo:null})).toBe('ready');
});
