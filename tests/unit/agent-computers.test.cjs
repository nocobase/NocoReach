const test=require('node:test'),assert=require('node:assert/strict');
const {AgentStore}=require('../../apps/nocoreach/server/providers/reach/domain/execution/agent.ts');
// In-memory snapshot store with the same lock/put contract as the task service.
const store=()=>{const data={};return new AgentStore({snapshot:async k=>data[k]&&JSON.parse(JSON.stringify(data[k])),put:async(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));},lock:async(_p,_t,fn)=>fn({})});};
test('clicking 连接 again for the same computer replaces the unused key instead of leaving a 未连上 record',async()=>{
 const a=store();const first=await a.connect('1',{name:'工作室 Mac'});const second=await a.connect('1',{name:'工作室 Mac'});await a.connect('1',{name:'家里'});
 const list=(await a.status('1')).computers;assert.deepEqual(list.map(c=>c.name),['工作室 Mac','家里']);assert.equal(list[0].id,second.computerId);
 await assert.rejects(a.authenticate('1',first.key),/无效/);assert.equal((await a.authenticate('1',second.key)).computer.id,second.computerId);
});
test('a computer logging in with a new key retires its older offline record of the same name, not other computers',async()=>{
 const a=store();const old=await a.connect('1',{name:'Mac'});await a.authenticate('1',old.key);const other=await a.connect('1',{name:'PC'});await a.authenticate('1',other.key);
 const again=await a.connect('1',{name:'Mac'});
 // The old Mac record was seen, so a new key does not retire it until the new key is used and the old one is offline.
 assert.equal((await a.status('1')).computers.length,3);
 const realNow=Date.now;Date.now=()=>realNow()+120000;const RealDate=Date;try{global.Date=class extends RealDate{constructor(...x){super(...(x.length?x:[realNow()+120000]));}static now(){return realNow()+120000;}};await a.authenticate('1',again.key);}finally{global.Date=RealDate;Date.now=realNow;}
 assert.deepEqual((await a.status('1')).computers.map(c=>c.name).sort(),['Mac','PC']);await assert.rejects(a.authenticate('1',old.key),/无效/);
});
test('how the Agent program runs (background service or terminal) is kept from start; calls without it keep the last value',async()=>{
 const a=store();const c=await a.connect('1',{name:'Mac'});const mode=async()=>(await a.status('1')).computers[0].mode;
 await a.authenticate('1',c.key,{version:'0.1.0'});assert.equal(await mode(),undefined,'an older program does not say');
 await a.authenticate('1',c.key,{version:'0.2.0',mode:'service'});assert.equal(await mode(),'service');
 await a.authenticate('1',c.key,{version:'0.2.0'});assert.equal(await mode(),'service','status or login from a terminal');
 await a.authenticate('1',c.key,{mode:'terminal'});assert.equal(await mode(),'terminal');await a.authenticate('1',c.key,{mode:'daemon'});assert.equal(await mode(),'terminal');
});
