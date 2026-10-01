import {describe,it,expect} from 'vitest';
import {flowProblems,nextLabel,type Stage} from '../src/pages/flow-model';
import {workState,type Work} from '../src/pages/task-execution-types';
import {workTypeLabel} from '../src/pages/work-board';
const ai:Stage={key:'a',name:'写',kind:'ai',instruction:'x'},agent:Stage={key:'g',name:'改',kind:'agent',instruction:'x'},review:Stage={key:'r',name:'审',kind:'review',checklist:[]},publish:Stage={key:'p',name:'发',kind:'publish'},observe:Stage={key:'o',name:'看',kind:'observe'};
describe('flow editor rules (mirror of the server check)',()=>{
 it('accepts the built-in shapes and explains each broken rule',()=>{
  expect(flowProblems([ai,review])).toEqual([]);
  expect(flowProblems([ai,review,agent,review,publish,observe])).toEqual([]);
  expect(flowProblems([review,ai,review])[0]).toMatch(/第一个阶段/);
  expect(flowProblems([ai,review,ai])).toContain('最后一个产出内容的阶段之后需要有人审核');
  expect(flowProblems([ai,review,agent,review])).toContain('修改仓库的流程必须以“发布”“观察”两个系统阶段结束');
  expect(flowProblems([ai,review,publish,observe])).toContain('发布和观察只用于包含本机 Agent 修改仓库的流程');
  expect(flowProblems([ai,review,agent,{...agent,key:'g2'},publish,observe])).toContain('最后一个产出内容的阶段之后需要有人审核');
  expect(flowProblems([{...ai,instruction:''},review])[0]).toMatch(/需要写给 AI 的指令/);
 });
 it('approve buttons name who takes over',()=>{
  const stages=[ai,review,agent,review,publish,observe];
  expect(nextLabel(stages,1)).toBe('通过，交给本机 Agent');expect(nextLabel(stages,3)).toBe('通过，交给你确认 · 系统执行');expect(nextLabel([ai,review],1)).toBe('通过并完成');
 });
});
describe('flow tasks on the board',()=>{
 const flow={id:'site-change',name:'官网修改',version:1,stages:[ai,review,agent,review,publish,observe]};
 const w=(stageIndex:number,stage='flow')=>({schemaVersion:2,revision:1,stage,plan:null,planVersion:0,step:0,results:[],history:[],flow,stageIndex}) as unknown as Work;
 it('AI and Agent stages are in progress, review and publish wait for confirmation',()=>{
  expect(workState(w(0))).toBe('doing');expect(workState(w(1))).toBe('review');expect(workState(w(2))).toBe('doing');expect(workState(w(4))).toBe('review');expect(workState(w(5,'done'))).toBe('done');
 });
 it('cards show the flow and current stage; unstarted tasks show no type',()=>{
  expect(workTypeLabel(w(1))).toBe('官网修改 · 审');expect(workTypeLabel(w(5,'done'))).toBe('官网修改 · 已完成');
  expect(workTypeLabel({stage:'plan',plan:null} as unknown as Work)).toBe('');expect(workTypeLabel({kind:'research'} as unknown as Work)).toBe('调研分析');
 });
});
