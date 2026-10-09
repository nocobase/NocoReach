// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/keyword-policy.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { specification, result } from '../../server/nocoreach/keyword-policy.js';
const test=__vitest_test;
const input={target:'low code',view:'related',locationCode:2840,language:'en',limit:50};
test('research only exposes approved queries and current estimate',()=>{const s=specification(input);assert.equal(s.estimatedUsd,0.018);assert.equal(s.request.include_clickstream_data,false);assert.equal(s.path,'dataforseo_labs/google/related_keywords/live');assert.throws(()=>specification({...input,view:'domain'}));assert.throws(()=>specification({...input,limit:1000}));});
test('rejects cost multipliers and invalid markets',()=>{for(const target of ['site:example.com','site%3Aexample.com','a\nb'])assert.throws(()=>specification({...input,view:'serp',target}));assert.throws(()=>specification({...input,locationCode:0}));const s=specification({...input,view:'serp'});assert.equal(s.request.depth,10);assert.equal(s.estimatedUsd,0.002);});
test('parses vendor metrics without converting missing data to zero',()=>{const p=result({status_code:20000,cost:0.01212,tasks:[{id:'test',status_code:20000,result:[{items:[{keyword_data:{keyword:'low code',keyword_info:{search_volume:100,cpc:null},keyword_properties:{keyword_difficulty:12}}}],total_count:1}]}]},specification(input));assert.equal(p.status,'completed');assert.equal(p.result.items[0].volume,100);assert.equal(p.result.items[0].cpc,null);assert.equal(p.result.items[0].raw,undefined);});
test('SERP excludes non-organic elements and preserves safe plain fields',()=>{const p=result({status_code:20000,tasks:[{status_code:20000,result:[{items:[{type:'paid',title:'ad'},{type:'organic',title:'result',url:'https://example.com',rank_group:1}]}]}]},specification({...input,view:'serp'}));assert.equal(p.result.items.length,1);assert.equal(p.result.items[0].position,1);});
