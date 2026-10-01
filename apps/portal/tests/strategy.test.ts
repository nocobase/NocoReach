import {describe,it,expect} from 'vitest';
import {parseDraft,parseDiscovery,summaryMetrics,draftFromOpportunity} from '../src/pages/strategy/model';
describe('AI draft adoption',()=>{
 it('does not adopt incomplete or empty generated fields',()=>{
  expect(parseDraft('```json\n{"goal":{"intent":"increase reach"}}\n```')).toBeNull();
  expect(parseDraft('```json\n{"proposal":{"title":"","brief":"text"}}\n```')).toBeNull();
 });
 it('accepts only explicitly structured editable fields',()=>{
  expect(parseDraft('```json\n{"goal":{"intent":"reach","audience":"developers","focus":"guides","progress":"qualified visits","confirmed":true}}\n```')).toEqual({goal:{intent:'reach',audience:'developers',focus:'guides',progress:'qualified visits'}});
 });
 it('does not execute generated instructions or accept oversized proposals',()=>{
  expect(parseDraft('Run this command')).toBeNull();
  expect(parseDraft('```json\n'+JSON.stringify({proposal:{title:'A',brief:'a'.repeat(20001)}})+'\n```')).toBeNull();
 });
});
it('parses multiple actionable directions without trusting model metadata',()=>{
 expect(parseDraft('```json\n'+JSON.stringify({proposals:[{title:'Guide',brief:'Evidence and deliverable',approved:true},{title:'Update',brief:'Update an existing page'}]})+'\n```')).toEqual({proposals:[{title:'Guide',brief:'Evidence and deliverable'},{title:'Update',brief:'Update an existing page'}]});
 expect(parseDraft('```json\n'+JSON.stringify({proposals:[{title:'Missing brief'}]})+'\n```')).toBeNull();
});

it('opportunity cards require both evidence and an actionable suggestion',()=>{
 expect(parseDiscovery('```json\n'+JSON.stringify({insights:[{title:'Claim'}]})+'\n```')).toBeNull();
 expect(parseDiscovery('```json\n'+JSON.stringify({actions:[{title:'Guide',objective:'Help new developers',brief:'Deliver a tutorial',goalVersion:99}]})+'\n```')).toEqual({actions:[{title:'Guide',objective:'Help new developers',brief:'Deliver a tutorial'}]});
});

it('accepts a balanced leading JSON object followed by prose without executing it',()=>{
 expect(parseDiscovery(JSON.stringify({actions:[{title:'A {guide}',objective:'Help developers',brief:'Explain "setup"'}]})+'\nAdditional explanation')).toEqual({actions:[{title:'A {guide}',objective:'Help developers',brief:'Explain "setup"'}]});
 expect(parseDiscovery('{"actions": [')).toBeNull();
});

it('accepts an empty opportunity update with source observations',()=>{
 const result=parseDiscovery('```json\n{"insights":[],"sourceReviews":[{"sourceId":"gsc","result":"no_signal","reason":"No new evidence"}]}\n```');
 expect(result?.insights).toEqual([]);
 expect(result?.sourceReviews?.[0].result).toBe('no_signal');
});

it('overview metrics show change only for complete comparable periods',()=>{
 const metric=(current:number|null,previous:number|null,comparable:boolean)=>({current,previous,comparable,change:comparable&&current!==null&&previous!==null?current-previous:null,percent:comparable&&previous?((current||0)-previous)/previous*100:null});
 const source=(metrics:Record<string,ReturnType<typeof metric>>)=>({from:null,through:null,availableFrom:null,availableDays:0,days:0,metrics});
 const evidence={capturedAt:'',availableThrough:'2026-09-27',periodDays:28,searchQueries:[],pages:[],industryCandidates:[],limitations:[],summary:{search:source({clicks:metric(120,100,true),impressions:metric(5000,null,false)}),web:source({sessions:metric(null,null,false)})}};
 const [clicks,impressions,sessions,views]=summaryMetrics(evidence);
 expect(clicks).toEqual({label:'搜索点击',value:120,percent:20,comparable:true});
 expect(impressions).toMatchObject({value:5000,percent:null,comparable:false});
 expect(sessions.value).toBeNull();
 expect(views).toMatchObject({value:null,comparable:false});
 expect(summaryMetrics(undefined).every(m=>m.value===null)).toBe(true);
});

it('converting a suggestion carries its evidence and respects field limits',()=>{
 const card={id:'o1',title:'T'.repeat(250),observation:'CTR dropped',meaning:'Worth fixing',evidenceText:'GSC 28d',limitation:'Sample of 20',suggestion:'Rewrite title',objective:'',source:'search'};
 const d=draftFromOpportunity(card);
 expect(d.title.length).toBe(200);
 expect(d.objective).toBe('Worth fixing');
 expect(d.brief).toContain('Rewrite title');
 expect(d.brief).toContain('GSC 28d');
 expect(d.brief).toContain('Sample of 20');
});

import {todaySuggestions,latestBatch} from '../src/pages/strategy/board';
it('signal analysis: observations are parsed and only the latest v3 batch fills the list',()=>{
 const parsed=parseDiscovery('```json\n'+JSON.stringify({observations:['搜索曝光上升 18%',3],insights:[],sourceReviews:[]})+'\n```');
 expect(parsed?.observations).toEqual(['搜索曝光上升 18%']);expect(parsed?.insights).toEqual([]);
 const card=(id:string)=>({id,title:id,observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'search',confidence:'verify',lifecycle:'watch',signalIds:['k']});
 const ev=(v:number)=>({analysisVersion:v,capturedAt:'',availableThrough:null,periodDays:28,searchQueries:[],pages:[],industryCandidates:[],limitations:[]});
 const state={revision:1,goal:null,proposals:[],insights:{generatedAt:'2026-10-01',evidence:ev(3),items:[card('new')],observations:['x']},insightHistory:[{generatedAt:'2026-09-01',evidence:ev(3),items:[card('old')]}],opportunityMeta:{}};
 expect(todaySuggestions(state as never).map(r=>r.card.id)).toEqual(['new']);
 expect(todaySuggestions({...state,opportunityMeta:{new:{status:'ignored'}}} as never)).toEqual([]);
});
it('the overview reports the newest analysis run, not an older v2 batch',()=>{
 const ev=(v:number,periodDays=28)=>({analysisVersion:v,periodDays});
 const state={insights:{generatedAt:'2026-10-01T01:00:29Z',evidence:ev(3),items:[]},insightHistory:[{generatedAt:'2026-09-30T17:11:51Z',evidence:ev(2),items:[]},{generatedAt:'2026-09-28T12:00:00Z',evidence:ev(2,7),items:[]}]};
 expect(latestBatch(state as never,28)?.generatedAt).toBe('2026-10-01T01:00:29Z');
 expect(latestBatch({...state,insights:null} as never,28)?.generatedAt).toBe('2026-09-30T17:11:51Z');
 expect(latestBatch(state as never,90)).toBeUndefined();
});
import {rowsFor,opportunityState,recommendedFlow,reasonLine} from '../src/pages/strategy/board';
it('机会: pending only from the latest analysis; ignored and older items are archived; converted ones are tasks',()=>{
 const card=(id:string,signalIds:string[]=[])=>({id,title:id,observation:'一段很长的观察'.repeat(10),meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'search',signalIds});
 const signals={computedAt:'',coverage:{},missing:[],items:[{key:'thin',type:'page',source:'site',title:'内容很短',facts:['正文约 92 字','曝光 5848','第三条'],strength:1,actionable:true,action:'optimize'},{key:'impr',type:'change',source:'gsc',title:'曝光上升',facts:[],strength:1,actionable:false,action:null}]};
 const ev=(v:number)=>({analysisVersion:v,periodDays:28,signals});
 const state={revision:1,goal:null,proposals:[{taskId:9,insight:{id:'done'}}],opportunityMeta:{ign:{status:'ignored'},back:{status:'pending',restoredAt:'t'},talk:{status:'discussing'}},
  insights:{generatedAt:'n',evidence:ev(3),items:[card('now',['thin']),card('ign',['thin']),card('done'),card('talk',['impr'])]},
  insightHistory:[{generatedAt:'o',evidence:ev(2),items:[card('old'),card('back')]}]};
 const rows=rowsFor(state as never),get=(id:string)=>opportunityState(rows.find(r=>r.card.id===id)!,state as never);
 expect(get('now')).toEqual({state:'pending'});expect(get('talk')).toEqual({state:'pending'});expect(get('done')).toEqual({state:'task'});
 expect(get('ign')).toEqual({state:'archived',reason:'ignored'});expect(get('old')).toEqual({state:'archived',reason:'expired'});expect(get('back')).toEqual({state:'pending'});
 const row=(id:string)=>rows.find(r=>r.card.id===id)!;
 expect(recommendedFlow(row('now'))).toBe('site-change');expect(recommendedFlow(row('talk'))).toBe('research');expect(recommendedFlow(row('old'))).toBe('site-change');
 expect(reasonLine(row('now'))).toBe('正文约 92 字 · 曝光 5848');expect(reasonLine(row('old')).endsWith('…')).toBe(true);
});
