// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/task-data.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { TaskData, effectLines, taskState } from '../../server/nocoreach/task-data.js';
const test=__vitest_test;
// Sharing between the local Agent and the online AI (2026-10-08): the Agent's data summary, the analysis's recent tasks.
const row=r=>({...r,toJSON:()=>r});
function fixture(){
 const work=(extra)=>({schemaVersion:2,stage:'flow',flow:{stages:[{key:'b',name:'修改',kind:'agent'},{key:'o',name:'观察效果',kind:'observe'}]},stageIndex:1,page:{url:'https://example.com/docs/install'},...extra});
 const tasks=[{id:3,title:'当前任务',evidence:{no:3,work:work({page:{url:'https://example.com/docs/install'}})},updatedAt:new Date().toISOString()},
  {id:2,title:'改安装页标题',evidence:{no:2,work:work({observeFrom:'2026-09-20',observation:{results:[{day:7,conclusion:'up',primary:'clicks',change:0.3,gsc:{clicks:[40,52]}}]}})},updatedAt:new Date().toISOString()},
  {id:1,title:'很久以前的任务',evidence:{no:1,work:{schemaVersion:2,stage:'done',flow:{stages:[]}}},updatedAt:'2020-01-01T00:00:00Z'}];
 const snaps=[{key:'history-search',payload:[{date:'2026-10-05'}]},{key:'queries-28',payload:[{keyword:'nocobase install',page:'https://example.com/docs/install/',clicks:30,impressions:1000,position:6},{keyword:'docker compose nocobase',page:'https://example.com/docs/install',clicks:10,impressions:500,position:9},{keyword:'other',page:'https://example.com/',clicks:99,impressions:999,position:1}]},{key:'pages-28',payload:[{page:'/docs/install',views:3200,conversions:12}]}];
 const p={db:{getRepository:()=>({find:async({offset=0})=>offset?[]:tasks.map(row)})},sync:{snapshots:async()=>snaps},
  audit:{report:async()=>({issues:[{title:'标题重复',severity:'warning',pages:[{url:'https://example.com/docs/install'}]},{title:'页面打不开',severity:'critical',pages:[{url:'https://example.com/x'}]}]})},
  rankTracking:{status:async()=>({keywords:[{keyword:'nocobase install',latest:{position:5,url:'https://example.com/docs/install'},previous:{position:7}}]})},
  dataViews:{search:async()=>({totals:{clicks:3214,impressions:956147},previous:{clicks:3100,impressions:810000}})}};
 return new TaskData(p);
}
test('the Agent\'s data summary of the page: search, top queries, visits, audit, tracked keywords, earlier tasks with effect',async()=>{
 const text=await fixture().forRun('1',{url:'https://example.com/docs/install',taskId:3});
 assert.deepEqual(text.split('\n'),['数据截至 2026-10-05，来自 NocoReach 已同步的数据，只用于参考。','搜索（近 28 天）：点击 40，曝光 1,500，点击率 2.7%，平均排名 7.0','主要搜索词：nocobase install（曝光 1,000，点击 30，第 6.0 位）；docker compose nocobase（曝光 500，点击 10，第 9.0 位）','访问（近 28 天）：浏览 3,200，关键事件 12','网站审计里这页的问题：标题重复（警告）','排名跟踪：nocobase install 第 5 位（上次 7）','这页以前的任务：T-2 改安装页标题（已上线，正在观察效果；第 7 天：上升，搜索点击 40 → 52（+30%））']);
 const site=await fixture().forRun('1',{});assert.match(site,/全站搜索（近 28 天）：点击 3,214，曝光 956,147（前 28 天点击 3,100/);assert.match(site,/访问最多的页面：\/docs\/install（浏览 3,200）/);
});
test('the daily analysis\'s recent tasks: the last 30 days, where each stands and its effect',async()=>{
 const r=await fixture().recent('1');assert.deepEqual(r.map(t=>t.no),['T-3','T-2']);assert.equal(r[1].state,'已上线，正在观察效果');assert.deepEqual(r[1].effects,['第 7 天：上升，搜索点击 40 → 52（+30%）']);
 assert.equal(taskState({},{cancelledAt:'x'}),'已关闭');assert.equal(taskState({},{stage:'flow',flow:{stages:[{name:'看方案',kind:'review'}]},stageIndex:0}),'进行中：看方案');assert.deepEqual(effectLines({observation:{results:[{day:28,conclusion:'insufficient'}]}}),['第 28 天：数据不足']);
});
