const test=require('node:test'),assert=require('node:assert/strict');
const {Knowledge,readFile,AGENT_BUDGET}=require('../../plugins/connections/server/knowledge');
// A stand-in for the nrSnapshots repository (synthetic data only).
function harness(read){const rows=[];let seq=1;const find=f=>rows.find(r=>r.key===f.key);
 const repo={findOne:async({filter})=>{const r=find(filter);return r?{id:r.id,get:k=>structuredClone(r[k])}:null;},create:async({values})=>{rows.push({id:seq++,...structuredClone(values)});},update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),structuredClone(values));},destroy:async({filter})=>{const i=rows.findIndex(r=>r.key===filter.key);if(i>=0)rows.splice(i,1);}};
 rows.push({id:seq++,key:'project',payload:{id:1,name:'Noco',description:'old field'}});
 const k=new Knowledge({projects:{row:async id=>{const r=find({key:'project'});return r&&String(r.payload?.id)===String(id)?{id:r.id,get:x=>r[x]}:null;}},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}},read);return {k,rows};}
test('知识库: pasted text and files become items with a title, category and summary; text is stored on its own',async()=>{
 const reads=[];const {k,rows}=harness(async(name,buf)=>{reads.push([name,buf.toString()]);return 'Retool 按人数收费\n私有部署要企业版';});
 await assert.rejects(k.add('1',{text:'   '}),/请粘贴/);
 let r=await k.add('1',{text:'9 月访谈\n5 位客户最常提到权限',category:'customer'},'7');assert.equal(r.item.title,'9 月访谈');assert.equal(r.item.category,'customer');assert.equal(r.item.kind,'text');assert.equal(r.item.addedBy,'7');assert.equal(r.item.summary,'9 月访谈 5 位客户最常提到权限');
 r=await k.add('1',{file:{name:'Retool 对比.pdf',data:Buffer.from('%PDF').toString('base64')},category:'nope'});assert.equal(r.item.title,'Retool 对比');assert.equal(r.item.category,'other');assert.equal(r.item.kind,'file');assert.deepEqual(reads,[['Retool 对比.pdf','%PDF']]);
 await assert.rejects(k.add('1',{file:{name:'big.pdf',data:Buffer.alloc(5*1024*1024+1).toString('base64')}}),/5 MB/);
 await assert.rejects(k.add('1',{text:'x'.repeat(200001)}),/拆成几份/);
 const list=await k.list('1');assert.deepEqual(list.items.map(i=>i.title).sort(),['9 月访谈','Retool 对比']);assert.equal(list.revision,2);assert.ok(list.items.every(i=>!('text' in i)),'the list carries no full text');
 const one=await k.get('1',{itemId:r.item.id});assert.match(one.text,/私有部署/);
 await k.update('1',{itemId:r.item.id,title:'Retool 定价',category:'competitor'});assert.equal((await k.get('1',{itemId:r.item.id})).item.category,'competitor');await assert.rejects(k.update('1',{itemId:r.item.id,category:'x'}),/分类不对/);
 await k.remove('1',{itemId:r.item.id});assert.equal((await k.list('1')).items.length,1);assert.ok(!rows.some(x=>x.key.endsWith(r.item.id)),'its text is deleted too');await assert.rejects(k.get('1',{itemId:r.item.id}),e=>e.status===404);
});
test('files: text formats are read directly; other types say what is supported',async()=>{
 assert.equal(await readFile('notes.md',Buffer.from('# 标题')),'# 标题');
 await assert.rejects(readFile('a.exe',Buffer.from('x')),/只支持/);
});
test('记忆 is saved on the project next to its older fields; the Agent gets the knowledge within a budget',async()=>{
 const {k,rows}=harness(async()=>'');
 const saved=await k.saveMemory('1',{name:' NocoBase ',memory:{brand:'开源无代码平台',voice:'不用感叹号'}});assert.equal(saved.name,'NocoBase');
 const p=rows.find(r=>r.key==='project').payload;assert.equal(p.memory.brand,'开源无代码平台');assert.equal(p.memory.rules,'');assert.equal(p.description,'old field','older fields stay');
 await assert.rejects(k.saveMemory('1',{memory:{brand:'x'.repeat(4001)}}),/太长/);await assert.rejects(k.saveMemory('2',{memory:{}}),e=>e.status===404);
 const wait=()=>new Promise(r=>setTimeout(r,5));await k.add('1',{text:'a'.repeat(AGENT_BUDGET/2),title:'旧报告'});await wait();await k.add('1',{text:'c'.repeat(AGENT_BUDGET/2),title:'新报告'});await wait();await k.add('1',{text:'b'.repeat(100),title:'小资料'});
 const out=await k.forAgent('1');assert.deepEqual(out.map(i=>[i.title,Boolean(i.text),Boolean(i.omitted)]),[['小资料',true,false],['新报告',true,false],['旧报告',false,true]],'newest first; what does not fit is listed by title');
});
