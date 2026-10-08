import {describe,expect,it} from 'vitest';
import {statusOf} from '../src/pages/strategy/insights-view';
import type {StrategyState,Signal,InsightBatch} from '../src/pages/strategy/model';
// 最新变化 statuses (synthetic): only an open task counts as 处理中; a finished or closed one is noted and today's verdict decides.
const sig:Signal={key:'audit-dupTitle',type:'page',source:'site',title:'278 个页面标题重复',facts:['f'],strength:9,actionable:true,action:'optimize'};
const batch=(items:unknown[]):InsightBatch=>({generatedAt:'t',evidence:{signals:{computedAt:'',coverage:{},missing:[],items:[sig]}},items} as unknown as InsightBatch);
const card={id:'o1',title:'改标题',signalIds:['audit-dupTitle']};
const state=(over:Partial<StrategyState>):StrategyState=>({revision:1,goal:null,proposals:[],...over} as StrategyState);
describe('statusOf',()=>{
 it('an open task is 处理中',()=>{
  const st=state({insights:batch([]),insightHistory:[batch([card])],proposals:[{id:'p',title:'t',brief:'b',status:'approved',goalVersion:null,insight:card as never,taskId:7,evidence:{}}]});
  expect(statusOf(sig,st,[{id:7,status:'进行中',evidence:{no:3,work:{stage:'flow'} as never}}]).label).toBe('处理中');
 });
 it('a closed task no longer counts: today’s verdict, with the earlier task noted',()=>{
  const st=state({insights:{...batch([]),signalReviews:{'audit-dupTitle':{verdict:'do',reason:'标题重复影响搜索'}}},insightHistory:[batch([card])],proposals:[{id:'p',title:'t',brief:'b',status:'approved',goalVersion:null,insight:card as never,taskId:7,evidence:{}}]});
  const x=statusOf(sig,st,[{id:7,status:'进行中',evidence:{no:3,work:{archivedAt:'2026-10-02'} as never}}]);
  expect([x.label,x.next,x.earlier?.state,x.earlier?.no]).toEqual(['建议处理','hand','closed',3]);
 });
 it('a change handed off straight from the list, and one without a verdict',()=>{
  const st=state({insights:batch([]),proposals:[{id:'p',title:'t',brief:'b',signalKey:'audit-dupTitle',status:'approved',goalVersion:null,taskId:9,evidence:{}}]});
  expect(statusOf(sig,st,[{id:9,status:'待处理',evidence:{work:{} as never}}]).label).toBe('处理中');
  expect(statusOf(sig,state({insights:batch([])}),[]).label).toBe('等判断');
 });
});
