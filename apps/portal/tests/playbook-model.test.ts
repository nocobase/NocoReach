import {describe,it,expect} from 'vitest';
import {stagesFor,recommendedPlaybookId,eventText} from '../src/pages/playbook-model';
import {workState,type Work} from '../src/pages/task-execution-types';
import {workTypeLabel,executorLabel} from '../src/pages/work-board';
import {isPlaybookTask} from '../src/pages/task-detail';
describe('playbooks on the page mirror the server',()=>{
 it('one executor per playbook; plan-first adds a plan step',()=>{
  expect(stagesFor({kind:'plan'}).map(s=>s.kind)).toEqual(['ai','review']);
  expect(stagesFor({kind:'build',planFirst:true}).map(s=>s.key)).toEqual(['plan','approve-plan','build','review','publish','observe']);
  expect(stagesFor({kind:'build',planFirst:false}).map(s=>s.key)).toEqual(['build','review','publish','observe']);
 });
 it('recommendation follows signal actions',()=>{
  expect(recommendedPlaybookId(['create','optimize'])).toBe('optimize-page');expect(recommendedPlaybookId(['create'])).toBe('content-outline');
  expect(recommendedPlaybookId(['distribute'])).toBe('release-notes');expect(recommendedPlaybookId([null])).toBe('change-research');expect(recommendedPlaybookId([])).toBe('optimize-page');
 });
 it('timeline wording names the stage and the hand-over',()=>{
  const name=(k?:string)=>k==='accept'?'审核':'这一步';
  expect(eventText({action:'approveStage',stageKey:'accept',note:'新建文档页'},name,'在线 AI')).toEqual({who:'你',text:'通过了“审核”，交给“新建文档页”接着做'});
  expect(eventText({action:'runQueued',note:'撰写'},name,'在线 AI')).toEqual({who:'在线 AI',text:'开始撰写'});
  expect(eventText({action:'takeOwnership'},name,'在线 AI')).toBeNull();
 });
});
describe('task pages and board',()=>{
 const stages=stagesFor({kind:'build',planFirst:true}) as Work['flow'] extends infer F?F extends {stages:infer S}?S:never:never;
 const w=(stageIndex:number,stage='flow')=>({schemaVersion:2,revision:1,stage,plan:null,planVersion:0,step:0,results:[],history:[],playbook:{id:'optimize-page',name:'优化现有页面',kind:'build',version:1,next:[]},flow:{id:'optimize-page',name:'优化现有页面',version:1,stages},stageIndex}) as unknown as Work;
 it('Agent steps are in progress, your steps wait for confirmation',()=>{
  expect(workState(w(0))).toBe('doing');expect(workState(w(1))).toBe('review');expect(workState(w(2))).toBe('doing');expect(workState(w(4))).toBe('review');expect(workState(w(5,'done'))).toBe('done');
 });
 it('cards and table show playbook, step and executor',()=>{
  expect(workTypeLabel(w(1))).toBe('优化现有页面 · 看方案');expect(executorLabel(w(1))).toBe('本机 Agent');expect(workTypeLabel(w(5,'done'))).toBe('优化现有页面 · 已完成');
  expect(workTypeLabel({stage:'plan',plan:null} as unknown as Work)).toBe('未开始');expect(executorLabel({stage:'plan'} as unknown as Work)).toBe('—');
 });
 it('new tasks use the task detail page; step-plan tasks keep the old one',()=>{
  const data=(work:object)=>({task:{id:1,title:'t',brief:''},work,runs:[],artifacts:[],reviews:[]}) as never;
  expect(isPlaybookTask(data({stage:'plan',plan:null}))).toBe(true);expect(isPlaybookTask(data(w(1)))).toBe(true);
  expect(isPlaybookTask(data({stage:'work',plan:{steps:[]}}))).toBe(false);expect(isPlaybookTask(data({stage:'plan',plan:null,simple:true}))).toBe(false);
 });
});
