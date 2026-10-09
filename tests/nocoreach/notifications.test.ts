// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/notifications.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { Notifications, IN_APP } from '../../server/nocoreach/notifications.js';
const test=__vitest_test;
// 通知 (2026-10-08): NocoBase's own notifications — an in-app message, and email when an email channel is set up.
function fixture({email=false,manager=true}={}){
 const channels=email?[{id:1,name:'smtp',notificationType:'email'}]:[],sent=[];
 const row=r=>r?{...r,get:k=>r[k],toJSON:()=>r}:null;
 const repos={notificationChannels:{findOne:async({filter})=>row(channels.find(c=>Object.entries(filter).every(([k,v])=>c[k]===v))),create:async({values})=>{channels.push({id:channels.length+10,...values});}},
  users:{findOne:async({filterByTk})=>row({id:filterByTk,nickname:{1:'Esther',2:'Lin',3:'Mia'}[filterByTk]})}};
 const p={db:{getRepository:n=>repos[n]},app:{logger:{warn:()=>{}},pm:{get:n=>manager&&n==='notification-manager'?{send:async m=>{sent.push(m);}}:null}},
  members:{list:async()=>[{id:'1',role:'admin'},{id:'2',role:'member'},{id:'4',role:'admin'}]},project:async()=>({name:'NocoBase'})};
 return {n:new Notifications(p),sent,channels};
}
test('notifications: an in-app message on NocoReach\'s own channel (made once), and email only when an email channel exists',async()=>{
 const f=fixture();assert.equal(await f.n.send(['2','2',null],{title:'T-12 等你看方案',content:'补写文档',url:'/actions/12'}),1);
 assert.deepEqual(f.channels.map(c=>[c.name,c.notificationType]),[[IN_APP,'in-app-message']]);
 assert.deepEqual(f.sent,[{channelName:IN_APP,triggerFrom:'nocoreach',message:{title:'T-12 等你看方案',content:'补写文档',options:{url:'/x/main/actions/12'}},receivers:{type:'userId',value:['2']}}]);
 await f.n.send(['3'],{title:'x',content:'y'});assert.equal(f.channels.length,1,'the channel is made once');
 const e=fixture({email:true});await e.n.send(['2'],{title:'T-12 等你看方案',content:'补写文档',url:'/actions/12'});
 assert.deepEqual(e.sent.map(m=>m.channelName),[IN_APP,'smtp']);assert.equal(e.sent[1].message.subject,'NocoReach：T-12 等你看方案');assert.match(e.sent[1].message.text,/\/x\/main\/actions\/12/);
 assert.equal(await fixture({manager:false}).n.send(['2'],{title:'x',content:'y'}),0,'no notification plugin: nothing, no error');
});
test('notifications: task events read as one line each; the admins hear about a failed analysis',async()=>{
 const f=fixture(),task={id:12,title:'补写 Block 显隐文档',evidence:{no:12}};
 await f.n.taskEvents(task,{humanOwnerId:'2'},[{kind:'waiting',step:'看方案'},{kind:'owner',by:'1'},{kind:'comment',by:'3',comment:'第二段再短一点'}]);
 assert.deepEqual(f.sent.map(m=>[m.message.title,m.message.content,m.receivers.value]),[['T-12 等你看方案','补写 Block 显隐文档',['2']],['你是 T-12 的负责人了','补写 Block 显隐文档（Esther 指定）',['2']],['Mia 在 T-12 留言','第二段再短一点',['2']]]);
 f.sent.length=0;await f.n.analysisFailed('1','连不上在线 AI');
 assert.deepEqual(f.sent.map(m=>[m.message.title,m.message.content,m.receivers.value,m.message.options.url]),[['今天的每日分析没有完成','NocoBase：连不上在线 AI。可以在洞察页点“重新分析”。',['1','4'],'/x/main/home']]);
});
