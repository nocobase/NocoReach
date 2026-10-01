import {describe,expect,it} from 'vitest';
import {stepOf,executorOf,initials,ago,effectChip} from '../src/pages/task-list-model';
import type {Work} from '../src/pages/task-execution-types';
// The task list's "当前一步", executor, avatar letters and update time (synthetic tasks).
const build=[{key:'build',name:'修改',kind:'agent'},{key:'review',name:'看效果并发布',kind:'review'},{key:'release',name:'上线',kind:'release'},{key:'observe',name:'观察',kind:'observe'}];
const w=(stageIndex:number,extra:object={})=>({schemaVersion:2,revision:1,stage:'flow',plan:null,planVersion:0,step:0,results:[],history:[],playbook:{id:'optimize-page',name:'优化现有页面',kind:'build',version:1,next:[]},flow:{id:'optimize-page',name:'优化现有页面',version:1,stages:build},stageIndex,...extra}) as unknown as Work;
const result=(conclusion:string,change:number|null,primary='clicks')=>({day:7,baseline:{start:'',end:''},after:{start:'',end:''},pages:[],primary,change,conclusion,notes:[],computedAt:''});
describe('task list rows',()=>{
 it('says who works, what waits for you, and what went wrong',()=>{
  expect(stepOf(w(0))).toEqual({text:'Agent 正在修改'});expect(stepOf(w(0,{latestRun:{id:'r',status:'queued'}}))).toEqual({text:'等本机 Agent 接手'});expect(stepOf(w(0,{latestRun:{id:'r',status:'failed'}}))).toEqual({text:'Agent 执行失败',tone:'red'});
  expect(stepOf(w(1))).toEqual({text:'看效果并发布',tone:'amber'});
  expect(stepOf(w(2,{release:{state:'merging',note:'',pages:[]}}))?.text).toBe('正在合并');expect(stepOf(w(2,{release:{state:'merge_failed',note:'',pages:[]}}))).toEqual({text:'合并失败',tone:'red'});expect(stepOf(w(2,{release:{state:'not_seen',note:'',pages:[]}}))?.tone).toBe('amber');
  expect(stepOf({stage:'plan',plan:null} as unknown as Work)).toBeNull();expect(stepOf(w(1,{cancelledAt:'2026-10-01'}))).toEqual({text:'已取消',tone:'slate'});
 });
 it('shows the effect once live, or when it is expected',()=>{
  expect(stepOf(w(3,{observeFrom:'2026-10-01T00:00:00Z',page:{url:'https://example.com/a',title:''}}))?.text).toMatch(/^观察中 · 约 \d+\/\d+ 出结果$/);
  expect(stepOf(w(3,{observeFrom:'2026-10-01T00:00:00Z'}))?.text).toBe('观察中 · 没有关联页面');
  expect(stepOf(w(3,{observeFrom:'2026-10-01T00:00:00Z',observation:{results:[result('up',0.263)]}}))).toEqual({text:'第 7 天：点击 ↑ 26%',tone:'green'});
  expect(effectChip(result('down',-0.4,'views') as never)).toEqual({text:'第 7 天：浏览 ↓ 40%',tone:'red'});expect(effectChip(result('flat',0.02) as never).text).toBe('第 7 天：无明显变化');expect(effectChip(result('insufficient',null) as never).text).toBe('第 7 天：数据不足');
 });
 it('names the executor by 做法 and draws NocoProject-style initials and times',()=>{
  expect(executorOf(w(0))).toBe('agent');expect(executorOf({...w(0),playbook:{id:'x',name:'x',kind:'plan',version:1,next:[]}} as Work)).toBe('ai');expect(executorOf({stage:'plan'} as unknown as Work)).toBeNull();
  expect(initials('Super Admin')).toBe('SA');expect(initials('zeke')).toBe('ZE');expect(initials('张三')).toBe('张');expect(initials('')).toBe('');
  const now=Date.parse('2026-10-02T12:00:00Z');expect(ago('2026-10-02T11:50:00Z',now)).toBe('10 分钟前');expect(ago('2026-10-02T05:00:00Z',now)).toBe('7 小时前');expect(ago('2026-10-01T06:00:00Z',now)).toBe('昨天');expect(ago('2026-09-24T06:00:00Z',now)).toBe('9/24');
 });
});
