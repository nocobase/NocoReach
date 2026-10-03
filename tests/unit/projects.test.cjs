const test=require('node:test'),assert=require('node:assert/strict');
const {Projects,host}=require('../../plugins/connections/server/projects');
function harness(){const rows=[{id:1,key:'project',payload:{id:1,name:'NocoBase',domains:['www.nocobase.com']}},{id:2,key:'project-icon:1',payload:{}}];let seq=10;
 const like=(k,v)=>new RegExp('^'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*')+'$').test(k);
 const match=(r,f)=>typeof f.key==='string'?r.key===f.key:like(r.key,f.key.$like);const wrap=r=>r&&{id:r.id,get:k=>structuredClone(r[k])};
 const repo={findOne:async({filter})=>wrap(rows.find(r=>match(r,filter))),find:async({filter})=>rows.filter(r=>match(r,filter)).map(wrap),create:async({values})=>{rows.push({id:seq++,...structuredClone(values)});},update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),structuredClone(values));}};
 return {p:new Projects({db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}}),rows};}
test('project 1 stays in its original record; new projects get the next id under project:<id>',async()=>{
 const {p,rows}=harness();assert.deepEqual((await p.list()).map(x=>x.name),['NocoBase']);
 const made=await p.create({name:'  Acme  Docs ',domain:'https://www.acme.dev/docs'});assert.equal(made.id,2);assert.equal(made.name,'Acme Docs');assert.deepEqual(made.domains,['acme.dev']);
 assert.ok(rows.some(r=>r.key==='project:2'));assert.deepEqual(await p.ids(),['1','2']);assert.equal((await p.get('2')).name,'Acme Docs');assert.equal((await p.get('1')).name,'NocoBase');
 await assert.rejects(p.create({name:'X',domain:'nocobase.com'}),/已有项目/);await assert.rejects(p.create({name:'',domain:'a.dev'}),/名称/);await assert.rejects(p.create({name:'Y',domain:'not a site'}),/官网/);
 await assert.rejects(p.get('9'),/不存在/);
 await p.update('2',cur=>({...cur,analyticsPropertyId:'123'}));assert.equal((await p.get('2')).analyticsPropertyId,'123');
 assert.equal(host('HTTPS://WWW.Example.com/a?b'),'example.com');
});
