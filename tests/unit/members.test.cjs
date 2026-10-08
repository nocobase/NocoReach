const {test}=require('node:test'),assert=require('node:assert/strict');
const {Members}=require('../../plugins/connections/server/members');
const {roleOf}=require('../../plugins/connections/server/policy');
// 设置 · 成员 (2026-10-08): NocoBase users with their NocoReach role; 管理员 pick 管理员, 成员 or 未加入.
function fixture(){
 const state={users:[{id:1,nickname:'Esther',username:'esther',roles:[{name:'root'}]},{id:2,nickname:'Lin',username:'lin',roles:[{name:'member'}]},{id:3,username:'mia',roles:[{name:'member'}]}],nrSnapshots:[]};
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):r.key===filter.key)),find:async({offset=0,limit=100})=>state[name].slice(offset,offset+limit).map(row),
  create:async({values})=>{state[name].push({id:state[name].length+100,...values});},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>r.id===filterByTk),values);}});
 const db={getRepository:repo,sequelize:{query:async()=>{},transaction:fn=>fn({})}};
 return {m:new Members({db}),state,db};
}
test('members: everyone in NocoBase is listed; NocoBase admins are fixed 管理员, others start as 未加入',async()=>{
 const {m}=fixture();
 assert.deepEqual(await m.list(),[{id:'1',name:'Esther',account:'esther',role:'admin',locked:true},{id:'2',name:'Lin',account:'lin',role:null,locked:false},{id:'3',name:'mia',account:'mia',role:null,locked:false}]);
 assert.deepEqual((await m.joined()).map(u=>u.id),['1']);
});
test('members: a role is saved for all projects, can be taken back, and nobody changes their own or a NocoBase admin',async()=>{
 const {m,db}=fixture();
 let list=await m.setRole(1,{userId:'2',role:'member'});assert.equal(list.find(u=>u.id==='2').role,'member');assert.equal(await roleOf(db,2),'member');
 list=await m.setRole(1,{userId:'3',role:'admin'});assert.deepEqual(list.map(u=>u.id),['1','3','2'],'管理员 first, then 成员');assert.equal(await roleOf(db,3),'admin');
 list=await m.setRole(1,{userId:'2',role:null});assert.equal(list.find(u=>u.id==='2').role,null);assert.equal(await roleOf(db,2),null);
 await assert.rejects(m.setRole(3,{userId:'3',role:'member'}),e=>e.status===409&&/自己/.test(e.message));
 await assert.rejects(m.setRole(3,{userId:'1',role:'member'}),e=>e.status===409&&/NocoBase 管理员/.test(e.message));
 await assert.rejects(m.setRole(1,{userId:'2',role:'owner'}),e=>e.status===400);
 await assert.rejects(m.setRole(1,{userId:'404',role:'member'}),e=>e.status===404);
});
