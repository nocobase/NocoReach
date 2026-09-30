import {describe,it,expect} from 'vitest';
import {taskStage,type Work} from '../src/pages/task-execution-types';
describe('task board review signal',()=>{
 it('a rejected artifact returns to work while an unsaved AI reply cannot create review status',()=>{
  const work={stage:'work',step:0,results:[]} as unknown as Work;
  expect(taskStage(work)).toBe('work');
  work.results=[{id:'v1',content:'saved'} as never];expect(taskStage(work)).toBe('review');
  work.results[0]!.rejectedAt='today';expect(taskStage(work)).toBe('work');
  work.stage='execution';expect(taskStage(work)).toBe('execution');
 });
});

import {workState} from '../src/pages/task-execution-types';
describe('optimization work compatibility',()=>{
 it('keeps completed legacy tasks and separates observation from delivery',()=>{
  expect(workState(undefined,'已完成')).toBe('done');
  expect(workState({stage:'verification'})).toBe('review');
  expect(workState({stage:'verification',receipt:{note:'Published',url:''}})).toBe('done');
  expect(workState({stage:'plan',boardState:'doing'})).toBe('doing');
 });
 it('shows saved results for confirmation and rejected results as ongoing',()=>{
  const w={stage:'work',step:0,results:[{content:'Report'}]} as Work;
  expect(workState(w)).toBe('review');w.results[0]!.rejectedAt='now';expect(workState(w)).toBe('doing');
 });
});
