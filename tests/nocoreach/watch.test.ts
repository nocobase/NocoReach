// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/watch.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import * as watch from '../../server/nocoreach/watch.js';
import { choose } from '../../server/nocoreach/signals.js';
import { buildInput } from '../../server/nocoreach/daily-analysis.js';
import * as __strategy_service from '../../server/nocoreach/strategy-service.js';
const test=__vitest_test;
const D=n=>`2026-10-${String(n).padStart(2,'0')}T09:00:00.000Z`;
const sig=(key,facts=['近 7 天 6 个帖子'],source='reddit')=>({key,source,title:key,facts,actionable:true,chip:{tone:'green',text:'↑ 2 倍'}});

test('观察中: a watch starts with the numbers then, what it waits for and a deadline within 14 days, and is followed',()=>{
 const state={};
 watch.applyVerdicts(state,{signals:[sig('a')],reviews:{a:{verdict:'watch',reason:'量还小',waitingFor:'连续两周涨就整理',decideBy:'2026-12-01'}},now:D(1)});
 const w=state.watch.a;assert.deepEqual([w.since,w.startFacts,w.waitingFor,w.decideBy,w.startChip.text],[D(1),['近 7 天 6 个帖子'],'连续两周涨就整理','2026-10-14','↑ 2 倍']);
 assert.equal(watch.deadline('bad',D(1)),'2026-10-14');assert.equal(watch.deadline('2026-10-05',D(1)),'2026-10-05');
 // the next day: same start, newer condition; the deadline cannot move past the limit
 watch.applyVerdicts(state,{signals:[sig('a',['近 7 天 9 个帖子'])],reviews:{a:{verdict:'watch',reason:'还在涨',waitingFor:'出现具体问题就整理',decideBy:'2026-10-30'}},now:D(2)});
 assert.deepEqual([w.since,w.startFacts[0],w.waitingFor,w.decideBy,w.lastSeen],[D(1),'近 7 天 6 个帖子','出现具体问题就整理','2026-10-14',D(2)]);
 const input=watch.watchInput(state,'a',D(3));assert.deepEqual([input.since,input.days,input.mustDecide],['2026-10-01',3,false]);assert.equal(watch.watchInput(state,'a',D(14)).mustDecide,true);
 assert.deepEqual(watch.activeKeys(state),['a']);
});

test('a watch ends with its outcome: opportunity, nothing to do, deadline, back to normal (not while the source has no data), ignored',()=>{
 const state={watch:{}},start=k=>watch.applyVerdicts(state,{signals:[sig(k)],reviews:{[k]:{verdict:'watch',reason:'r',waitingFor:'w'}},now:D(1)});
 for(const k of ['do','skip','late','gone','nodata','ign'])start(k);
 watch.applyVerdicts(state,{signals:[sig('do'),sig('skip')],reviews:{do:{verdict:'do',reason:'点击率还低'},skip:{verdict:'skip',reason:'回落了'}},cards:[{id:'card-9',signalIds:['do']}],now:D(5)});
 assert.deepEqual(state.watch.do.ended,{at:D(5),outcome:'opportunity',reason:'点击率还低',opportunityId:'card-9'});assert.equal(state.watch.skip.ended.outcome,'skip');
 // at the deadline a 先观察 reads as 不用做 and the watch ends as expired
 const reviews=watch.enforceDeadlines(state,{late:{verdict:'watch',reason:'还看不出'}},D(14));assert.deepEqual(reviews.late,{verdict:'skip',reason:'到期仍没有结论：还看不出'});
 watch.applyVerdicts(state,{signals:[sig('late')],reviews,now:D(14)});assert.equal(state.watch.late.ended.outcome,'expired');
 state.watch.nodata.source='ga4';watch.endMissing(state,{signals:[sig('ign')],missing:['ga4'],now:D(6)});
 assert.equal(state.watch.gone.ended.outcome,'normal');assert.equal(state.watch.nodata.ended,undefined,'kept while its source has no data');
 watch.ignore(state,'ign',D(6));assert.equal(state.watch.ign.ended.outcome,'ignored');watch.restore(state,'ign');assert.equal(state.watch.ign.ended,undefined);
 watch.endMissing(state,{signals:[sig('ign'),sig('nodata')],now:'2026-11-20T09:00:00.000Z'});assert.equal(state.watch.gone,undefined,'ended watches are forgotten after 30 days');
});

test('watched changes are always passed to the AI, with their record and today',()=>{
 const ranked=Array.from({length:45},(_,i)=>({key:`s${i}`}));
 const picked=choose(ranked,new Set(['s44']));assert.equal(picked.length,40);assert.ok(picked.some(s=>s.key==='s44'));assert.ok(!picked.some(s=>s.key==='s39'));
 const state={watch:{a:{key:'a',source:'reddit',since:D(1),startFacts:['3 个'],waitingFor:'连续两周涨',decideBy:'2026-10-14'}}};
 const input=JSON.parse(buildInput({project:{},evidence:{signals:{items:[sig('a'),sig('b')]}}},state,D(3)));
 assert.equal(input.today,'2026-10-03');assert.deepEqual(input.evidence.signals.items[0].watch,{since:'2026-10-01',days:3,startFacts:['3 个'],waitingFor:'连续两周涨',decideBy:'2026-10-14',mustDecide:false});assert.equal(input.evidence.signals.items[1].watch,undefined);
});

test('saving an analysis updates the watches; the deadline turns a 先观察 into 不用做',async()=>{
 const {StrategyService}=__strategy_service;
 const service=new StrategyService({db:{}});const today=new Date().toISOString().slice(0,10);
 const state={proposals:[],watch:{late:{key:'late',source:'reddit',since:'2026-09-01T00:00:00.000Z',startFacts:[],waitingFor:'w',decideBy:today},gone:{key:'gone',source:'gsc',since:'2026-09-30T00:00:00.000Z',startFacts:[],decideBy:'2099-01-01'}}};
 service.context=async()=>({evidence:{signals:{items:[sig('late'),sig('new')],missing:[]}}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 await service.saveInsights(1,{insights:[],signalReviews:[{key:'late',verdict:'watch',reason:'还看不出'},{key:'new',verdict:'watch',reason:'刚出现',waitingFor:'再看一周'}]});
 assert.equal(state.insights.signalReviews.late.verdict,'skip');assert.equal(state.watch.late.ended.outcome,'expired');assert.equal(state.watch.gone.ended.outcome,'normal');
 assert.equal(state.watch.new.waitingFor,'再看一周');assert.equal(state.insights.signalReviews.new.waitingFor,'再看一周');
});
