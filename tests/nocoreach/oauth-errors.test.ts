// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/oauth-errors.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { googleJson } from '../../server/nocoreach/google-client.js';
import { callbackReason } from '../../server/nocoreach/oauth-errors.js';
const test=__vitest_test;
test('network timeout classified without exposing cause',async()=>{await assert.rejects(googleJson('unused',{},async()=>{throw Object.assign(new Error('private detail'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});}),e=>e.code==='network_timeout'&&!e.message.includes('private'));});
test('Google invalid_grant gets a stable safe code',async()=>{await assert.rejects(googleJson('unused',{},async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:'secret detail'})})),e=>callbackReason(e,'exchange')==='invalid_grant');});
test('unknown failures never echo raw input in the redirect',()=>{assert.equal(callbackReason({code:'secret',message:'sensitive'},'exchange'),'callback_failed');assert.equal(callbackReason(new Error('sensitive'),'save'),'save_failed');assert.equal(callbackReason({code:'missing_permissions'},'exchange'),'missing_permissions');});
