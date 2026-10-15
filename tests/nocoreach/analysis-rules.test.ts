import { systemMessageKey } from '../../shared/i18n/messages';
// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/analysis-rules.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RULES, ruleOf, normalize, resolver, AnalysisRules } from '../../server/nocoreach/analysis-rules.js';
import { computeAll } from '../../server/nocoreach/signals.js';
import { withRules, SYSTEM } from '../../server/nocoreach/daily-analysis.js';
const test=__vitest_test;

test('分析规则: every change the rules can make belongs to a rule, and keys carry no dates',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../server/nocoreach/signals.ts'),'utf8');
 const keys=[...src.matchAll(/key:[`']([^`']+)[`']/g)].map(m=>m[1]);assert.ok(keys.length>30);
 for(const k of keys){assert.ok(ruleOf(k.replace(/\$\{k\}/g,'discord').replace(/\$\{[^}]+\}/g,'x')),`no rule for ${k}`);assert.ok(!/\$\{(day|today)\}|slice\(0,10\)|\.at\(-1\)|\.date\}/.test(k),`date in key ${k}`);}
 assert.equal(new Set(RULES.map(r=>r.id)).size,RULES.length);
});

test('settings are made safe: unknown rules dropped, numbers kept in range, focus and watch days bounded',()=>{
 const c=normalize({rules:{'site-thin':{enabled:false,values:{maxWords:5,other:1}},nope:{enabled:false},'gsc-low-ctr':{values:{maxCtr:'3'}}},focus:' 社区优先 '.padEnd(1200,'x'),watchDays:40});
 assert.deepEqual(c.rules,{'site-thin':{enabled:false,values:{maxWords:30}},'gsc-low-ctr':{values:{maxCtr:3}}});assert.equal(c.focus.length,1000);assert.equal(c.watchDays,28);
 const r=resolver(c);assert.equal(r.on('site-thin'),false);assert.equal(r.on('gsc-near-first'),true);assert.equal(r.value('gsc-low-ctr','maxCtr'),3);assert.equal(r.value('gsc-low-ctr','minImpressions'),500);
 assert.equal(normalize({}).watchDays,14);assert.throws(()=>r.value('site-thin','nope'));
});

test('the rules use the project numbers and switches when they look for changes',()=>{
 const input={now:Date.parse('2026-10-08'),queries:[],pages:[{page:'https://e.com/docs/a',views:100,conversions:0}],site:{pages:[{type:'docs',url:'https://e.com/docs/a',title:'A',fetchedAt:'2026-10-01',words:120}]}};
 const found=c=>computeAll(input,c).ranked.filter(s=>s.key.startsWith('site-thin:')).length;
 assert.equal(found(),1);assert.equal(computeAll(input).found['site-thin'],1);
 assert.equal(found({rules:{'site-thin':{values:{maxWords:100}}}}),0,'a page of 120 words is not short when the limit is 100');
 assert.equal(found({rules:{'site-thin':{enabled:false}}}),0,'a rule switched off finds nothing');
});

test('the prompt reads the longest watch and the team focus; settings are saved and shown with the last run',async()=>{
 const p=withRules(SYSTEM,{watchDays:21,focus:'社区问题优先'});assert.ok(p.includes('不超过 21 天'));assert.ok(!p.includes('{watchDays}'));assert.ok(p.endsWith('团队写的侧重点（判断值得做、先观察、不用做和排优先级时参考）：社区问题优先'));
 assert.ok(withRules(SYSTEM,null).includes('不超过 14 天'));
 let stored=null;const repo={findOne:async()=>stored?{id:1,get:()=>stored}:null,create:async({values})=>{stored=values.payload;},update:async({values})=>{stored=values.payload;}};
 const rules=new AnalysisRules({db:{getRepository:()=>repo,sequelize:{transaction:async fn=>fn({}),query:async()=>[]}},signals:{last:async()=>({computedAt:'t',found:{'site-thin':4},total:52,missing:['x']})},strategy:{state:async()=>({insights:{generatedAt:'g',evidence:{signals:{items:new Array(40)}},signalReviews:{a:{verdict:'do'},b:{verdict:'watch'},c:{verdict:'watch'}}}})}});
 await rules.save(1,{rules:{'site-thin':{values:{maxWords:200}}},focus:'社区优先'});await rules.save(1,{watchDays:10});
 assert.deepEqual(stored,{rules:{'site-thin':{values:{maxWords:200}}},focus:'社区优先',watchDays:10},'a later save keeps what it does not change');
 const v=await rules.view(1),thin=v.rules.find(r=>r.id==='site-thin');
 assert.deepEqual([thin.params[0].value,thin.found,thin.enabled],[200,4,true]);assert.deepEqual(v.last,{computedAt:'t',found:52,passed:40,missing:['x'],analyzedAt:'g',verdicts:{do:1,watch:2,skip:0}});
});

test('every rule name, explanation, number label and unit has English',()=>{
 const en=JSON.parse(fs.readFileSync(path.join(__dirname,'../../shared/i18n/en.json'),'utf8'));
 for(const r of RULES)for(const t of [r.label,r.description,...r.params.flatMap(x=>[x.label,x.unit].filter(u=>u&&u!=='%'))])assert.ok(systemMessageKey(t) in en,`no English for ${t}`);
});
