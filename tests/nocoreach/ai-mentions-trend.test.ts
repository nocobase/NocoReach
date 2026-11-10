// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { brandInput, trendSpec, trendResult } from '../../server/nocoreach/ai-search.js';

test('mention history uses only one on-demand provider request per platform and a completed calendar-month window', () => {
  const input=brandInput({target:'NocoBase',platform:'chat_gpt',locationCode:2250,language:'fr'}, {domains:['https://www.nocobase.com']});
  const spec=trendSpec(input);
  assert.equal(spec.kind,'ai-mentions-trend');
  assert.equal(spec.path,'ai_optimization/llm_mentions/timeseries_new_lost/live');
  assert.equal(spec.request.platform,'chat_gpt');
  assert.deepEqual([spec.request.location_code,spec.request.language_code],[2840,'en']);
  assert.equal(spec.request.group_range,'month');
  assert.equal(spec.request.target.length,1);
  assert.equal(spec.request.target[0].keyword,'NocoBase');
  assert.match(spec.request.date_from,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(spec.request.date_from>='2025-08-01');
  assert.ok(spec.request.date_to<new Date().toISOString().slice(0,7)+'-01');
  assert.ok(spec.reservationUsd>spec.estimatedUsd);
  assert.equal(spec.timeoutMs,120000);
});

test('mention history parses only the relevant months and keeps unknown metrics unknown', () => {
  const raw={status_code:20000,cost:0.101,tasks:[{status_code:20000,result:[{items:[
    {date:'2026-10-01',new_mentions:14,lost_mentions:4,new_ai_search_volume:170,lost_ai_search_volume:60},
    {date:'invalid',new_mentions:99,lost_mentions:0},
    {date:'2026-09-01',new_mentions:3,lost_mentions:null,new_ai_search_volume:null,lost_ai_search_volume:12},
  ]}]}]};
  const r=trendResult(raw);
  assert.deepEqual([r.status,r.costUsd,r.result.months.map(m=>m.date)],['completed',0.101,['2026-09-01','2026-10-01']]);
  assert.equal(r.result.months[0].lostMentions,null);
  assert.equal(r.result.months[0].newAiSearchVolume,null);
  assert.equal(r.result.months[1].newMentions,14);
  assert.equal(r.result.months[1].lostMentions,4);
  assert.equal(r.result.months[1].newAiSearchVolume,170);
});

test('provider failures and unparseable responses are not reported as successful history', () => {
  assert.equal(trendResult({status_code:50000,tasks:[]}).status,'failed');
  assert.equal(trendResult({status_code:20000,tasks:[{status_code:20000,result:[{}]}]}).status,'failed');
});
