// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/policy.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { projectId, secretKey, requireAccess, roleOf, adminOnly, callbackUri } from '../../server/nocoreach/policy.js';
import * as g from '../../server/nocoreach/google-client.js';
import * as __policy from '../../server/nocoreach/policy.js';
const test=__vitest_test;
test('connection secrets are project scoped and reject path/SQL-like identifiers',()=>{assert.notEqual(secretKey('1'),secretKey('2'));for(const id of ['../1','1 OR 1=1','0','abc','1.0'])assert.throws(()=>projectId(id));});
test('callback origins reject remote plaintext, credentials, paths and query injection',()=>{assert.equal(callbackUri('http://127.0.0.1:13004'),'http://127.0.0.1:13004/main/api/nocoreach/nrGoogle/callback');for(const url of ['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com?x=1'])assert.throws(()=>callbackUri(url));});
// Roles (2026-10-08): NocoBase admins are always 管理员; others need a role picked in 设置 · 成员; settings are 管理员 only.
const rolesDb=(users,assigned={})=>({getRepository:n=>n==='users'?{findOne:async({filterByTk})=>{const user=users.find(u=>String(u.id)===String(filterByTk));return user?{...user,roles:[...(user.roles||[]),...(assigned[String(user.id)]?[{name:`nr.${assigned[String(user.id)]}`}]:[])]}:null;}}:null});
const ctxOf=(id,db,action=['nrDataViews','overview'],roles=['member'])=>({auth:{user:id?{id}:null},state:{currentRoles:roles},db,action:{resourceName:action[0],actionName:action[1]},throw:(status,message)=>{throw Object.assign(new Error(message),{status});}});
test('roles: anonymous and not-joined users are refused, members cannot change settings, 管理员 can',async()=>{
 const db=rolesDb([{id:1,roles:[{name:'root'}]},{id:2,roles:[{name:'member'}]},{id:3,roles:[{name:'member'}]},{id:4,roles:[{name:'member'}]}],{'2':'member','4':'admin'});
 assert.equal(await roleOf(db,1),'admin');assert.equal(await roleOf(db,2),'member');assert.equal(await roleOf(db,3),null);assert.equal(await roleOf(db,4),'admin');assert.equal(await roleOf(db,404),null);
 await assert.rejects(requireAccess(ctxOf(null,db)),e=>e.status===401);
 await assert.rejects(requireAccess(ctxOf(3,db)),e=>e.status===403&&/还没有加入/.test(e.message));
 assert.equal(await requireAccess(ctxOf(2,db)),'member');
 for(const a of [['nrGoogle','disconnect'],['nrAnalysisRules','save'],['nrAnalysisRules','propose'],['nrAnalysisRules','apply'],...['create','rename','activate','draft','addRule','updateRule'].map(a=>['nrAnalysisRules',a]),['nrMembers','setRole'],['nrPlaybooks','save'],['nrProjects','create'],['nrAgent','saveRepo'],['nrAgent','removeRepo']])await assert.rejects(requireAccess(ctxOf(2,db,a)),e=>e.status===403&&/只有管理员/.test(e.message));
 for(const a of [['nrAnalysisRules','view'],['nrStrategy','confirmDirection'],['nrStrategy','decideSignal'],['nrTaskWork','advance'],['nrKeywords','run'],['nrReddit','check']])assert.equal(await requireAccess(ctxOf(2,db,a)),'member');
 assert.equal(await requireAccess(ctxOf(4,db,['nrAnalysisRules','save'])),'admin');assert.equal(await requireAccess(ctxOf(1,null,['nrMembers','setRole'],['root'])),'admin');
 assert.equal(adminOnly('nrGoogle','status'),false);assert.equal(adminOnly('nrGoogle','configure'),true);
 // Refreshing discovery statuses is part of discovery, which only 管理员 run.
 assert.equal(adminOnly('nrDiscovery','discover'),true);assert.equal(adminOnly('nrDiscovery','connections'),true);
});
test('reused connector requests read-only scopes, explicit consent and unpredictable state',()=>{assert.notEqual(g.createOAuthState(),g.createOAuthState());const url=new URL(g.buildAuthorizationUrl({clientId:'test',redirectUri:'http://localhost/cb',state:'abc'}));assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('state'),'abc');assert.ok(g.GOOGLE_SCOPES.filter(s=>s.startsWith('https:')).every(s=>s.endsWith('.readonly')));});

test('an AI suggestion that fails says so plainly when online AI is not connected yet',()=>{
 const {aiFail}=__policy;
 assert.throws(()=>aiFail(Object.assign(new Error('在线 AI 员工未启用'),{status:409}),'在线 AI 这次没有回答'),e=>e.status===409&&/还没有接入在线 AI/.test(e.message));
 assert.throws(()=>aiFail(new Error('timeout'),'在线 AI 这次没有回答'),e=>e.status===502&&e.message==='在线 AI 这次没有回答');
});
