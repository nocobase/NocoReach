// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/chat-source.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { ChatSource, isQuestion, snowTime, snowAt } from '../../server/nocoreach/chat-source.js';
import { chatSignals } from '../../server/nocoreach/signals.js';
import { windowFor } from '../../server/nocoreach/data-views.js';
const test=__vitest_test;
const DAY=86400000,DISCORD='MTA'+'x'.repeat(23)+'.GaBcDe.'+'y'.repeat(30),SLACK='xoxb-1234-5678-'+'z'.repeat(24);
function setup(routes){const rows=[],env={},calls=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:k=>env[k]||'',variable:async(k,v)=>{if(v===null)delete env[k];else env[k]=v;},projectIds:async()=>['1']};
 const c=new ChatSource(p,async(url,init)=>{calls.push({url:decodeURIComponent(url),auth:init.headers.Authorization});for(const [re,fn] of routes)if(re.test(url)){const r=fn(url);return {ok:(r.status||200)<300,status:r.status||200,json:async()=>r.body};}throw new Error('unexpected '+url);});c.wait=async()=>{};
 return {c,rows,env,calls};}
const ago=d=>snowAt(Date.now()-d*DAY);

test('questions and Discord ids: question marks and question words in English and Chinese; snowflakes from and to time',()=>{
 for(const t of ['How do I set up SSO?','怎么配置 SSO','Docker 升级后插件丢了吗','Can someone help','请问有中文文档']) assert.ok(isQuestion(t),t);
 for(const t of ['Thanks, it works now','发布了 2.2 版本','showing my dashboard']) assert.ok(!isQuestion(t),t);
 const t=Date.UTC(2026,9,1);assert.ok(Math.abs(snowTime(snowAt(t))-t)<2);
});

test('Discord: token checked, servers and channels listed before saving; daily read with replies and forum posts',async()=>{
 const m1=ago(3),m2=ago(2.5),m3=ago(2);let after=[];
 const {c,env,calls,rows}=setup([[/users\/@me\/guilds/,()=>({body:[{id:'g1',name:'NocoBase'}]})],[/users\/@me$/,()=>({body:{id:'app1',username:'nocoreach'}})],[/guilds\/g1\/channels/,()=>({body:[{id:'c1',name:'help',type:0,position:1},{id:'v1',name:'voice',type:2},{id:'f1',name:'questions',type:15,position:2}]})],
  [/channels\/c1\/messages/,u=>{after.push(new URL(u).searchParams.get('after'));return {body:after.length>1?[]:[{id:m3,type:19,content:'Use the SSO plugin',message_reference:{message_id:m1}},{id:m2,type:0,content:'What about LDAP?'},{id:m1,type:0,content:'How do I set up SSO?'},{id:ago(2.9),type:7,content:''}]};}],
  [/guilds\/g1\/threads\/active/,()=>({body:{threads:[{id:ago(4),parent_id:'f1',name:'插件安装失败怎么办？',message_count:0},{id:ago(1),parent_id:'other',name:'x',message_count:3}]}})],[/channels\/f1\/threads\/archived/,()=>({body:{threads:[{id:ago(40),parent_id:'f1',name:'old',message_count:1}]}})]]);
 await assert.rejects(c.inspect('1',{platform:'discord',token:'nope'}),/不像 Discord 机器人 token/);
 const info=await c.inspect('1',{platform:'discord',token:DISCORD});assert.equal(info.invite,'https://discord.com/oauth2/authorize?client_id=app1&scope=bot&permissions=66560');assert.equal(info.guildId,'g1');assert.deepEqual(info.channels.map(x=>[x.name,x.kind]),[['help','text'],['questions','forum']]);
 assert.equal(calls[0].auth,`Bot ${DISCORD}`);assert.equal(env.NOREACH_DISCORD_TOKEN_1,undefined,'nothing saved by checking');
 await assert.rejects(c.connect('1',{platform:'discord',token:DISCORD,channels:[]}),/至少选一个频道/);
 await c.connect('1',{platform:'discord',token:DISCORD,guildId:'g1',channels:['c1','f1']});await c.runs.wait('1');assert.equal(env.NOREACH_DISCORD_TOKEN_1,DISCORD);
 assert.ok(BigInt(after[0])<=BigInt(ago(13.9)),'the first read goes 14 days back');
 const v=await c.view('1',{range:'7'},windowFor);assert.equal(v.kpis[0].value,4,'joins and empty messages are not counted');assert.equal(v.kpis[1].value,3);
 const all=await c.view('1',{platform:'discord',range:'all'},windowFor);assert.equal(all.window.all,true);assert.ok(all.kpis.every(k=>k.previous===null&&k.change===null));
 assert.deepEqual(v.open.map(m=>m.text).sort(),['What about LDAP?','插件安装失败怎么办？'],'the replied question is answered; the 40-day-old forum post is gone');
 assert.equal(v.open.find(m=>m.text==='What about LDAP?').url,`https://discord.com/channels/g1/c1/${m2}`);assert.equal(v.channels.find(x=>x.channel==='help').questions,2);
 assert.ok(Object.values(rows[0].payload.messages).every(m=>!('author' in m)),'authors are not kept');
 const sig=chatSignals({ch:rows[0].payload,now:Date.now()});assert.equal(sig.length,0,'two open questions are not yet a signal');
 assert.deepEqual(await c.sync('1'),{skipped:true},'once a day');
});

test('Slack: internal app token, public channels joined when needed; threads count as replies; a revoked token says so',async()=>{
 const ts=d=>((Date.now()-d*DAY)/1000).toFixed(6);let joined=[];
 const {c,env}=setup([[/auth\.test/,()=>({body:{ok:true,user:'nocoreach',team:'NocoBase',url:'https://nocobase.slack.com/'}})],[/conversations\.list/,()=>({body:{ok:true,channels:[{id:'C1',name:'general',is_member:true,num_members:300},{id:'C2',name:'help',is_member:false,num_members:120}]}})],
  [/conversations\.join/,u=>{joined.push(new URL(u).searchParams.get('channel'));return {body:{ok:true}};}],
  [/conversations\.history/,u=>{const ch=new URL(u).searchParams.get('channel');return {body:{ok:true,has_more:false,messages:ch==='C2'?[{ts:ts(2),text:'怎么导入 Excel？',reply_count:0},{ts:ts(3),text:'How to upgrade?',reply_count:4},{ts:ts(2.1),subtype:'channel_join',text:'joined'}]:[{ts:ts(1),text:'Release 2.2 is out',reply_count:0}]}};}]]);
 await assert.rejects(c.inspect('1',{platform:'slack',token:'xoxp-user-token-123456789012345'}),/xoxb- 开头/);
 const info=await c.inspect('1',{platform:'slack',token:SLACK});assert.equal(info.team,'NocoBase');assert.deepEqual(info.channels.map(x=>[x.name,x.member]),[['general',true],['help',false]]);
 await c.connect('1',{platform:'slack',token:SLACK,channels:['C1','C2']});await c.runs.wait('1');assert.deepEqual(joined,['C2']);assert.equal(env.NOREACH_SLACK_TOKEN_1,SLACK);
 const v=await c.view('1',{range:'7',platform:'slack'},windowFor);assert.equal(v.kpis[0].value,3);assert.equal((await c.view('1',{range:'7'},windowFor)).connected,false,'the Discord page has its own connection');assert.deepEqual(v.open.map(m=>[m.text,m.channel]),[['怎么导入 Excel？','help']]);assert.match(v.open[0].url,/^https:\/\/nocobase\.slack\.com\/archives\/C2\/p\d+$/);
 assert.deepEqual(v.busiest.map(m=>m.text),['How to upgrade?']);
 const bad=setup([[/auth\.test/,()=>({body:{ok:false,error:'token_revoked'}})]]);await assert.rejects(bad.c.inspect('1',{platform:'slack',token:SLACK}),/Slack token 无效/);
 await c.disconnect('1',{platform:'slack'});assert.equal(env.NOREACH_SLACK_TOKEN_1,undefined);assert.equal((await c.status('1')).connected,false);
});
