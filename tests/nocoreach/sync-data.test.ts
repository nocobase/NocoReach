// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/sync-data.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { compact, buildSnapshots, shift } from '../../server/nocoreach/sync-data.js';
const test=__vitest_test;
test('source dimensions fold into source/medium and preserve totals',()=>{assert.deepEqual(compact([{source:'google',medium:'organic',views:10,sessions:2,keyEvents:1},{source:'google',medium:'organic',views:20,sessions:3,keyEvents:2}],'source'),[{source:'google',medium:'organic',views:30,sessions:5,conversions:3}]);});
test('query positions are weighted by impressions, not summed',()=>{const r=compact([{queryFull:'q',page:'/a',clicks:2,impressions:10,avgPosition:2},{queryFull:'q',page:'/a',clicks:3,impressions:30,avgPosition:6}],'query_page')[0];assert.equal(r.position,5);assert.equal(r.clicks,5);assert.equal(r.impressions,40);});
test('live snapshots use shared available end and do not fabricate missing days',()=>{const rows=[{source:'ga4',grain:'overview',date:'2026-09-20',payload:[{date:'2026-09-20',uv:3,views:10}]},{source:'gsc',grain:'overview',date:'2026-09-19',payload:[{date:'2026-09-19',clicks:2,impressions:30}]}];const s=buildSnapshots(rows,{id:1,end:'2026-09-01'});assert.equal(s.find(s=>s.key==='project').payload.end,'2026-09-19');assert.equal(s.find(s=>s.key==='history-web').payload.length,1);assert.equal(s.find(s=>s.key==='project').payload.mode,'google-live');assert.equal(buildSnapshots(rows.slice(0,1),{}).find(s=>s.key==='project').payload.end,'2026-09-20');assert.deepEqual(buildSnapshots([],{}),[]);});
test('date cursor crosses months safely',()=>{assert.equal(shift('2024-02-28',2),'2024-03-01');});
