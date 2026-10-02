const test=require('node:test'),assert=require('node:assert/strict');
const {Skills,parseSkillMd,cleanPath,AGENT_BUDGET}=require('../../plugins/connections/server/skills');
// A stand-in for the nrSnapshots repository (synthetic data only).
function harness(){const rows=[];let seq=1;const find=f=>rows.find(r=>r.key===f.key);
 const repo={findOne:async({filter})=>{const r=find(filter);return r?{id:r.id,get:k=>structuredClone(r[k])}:null;},create:async({values})=>{rows.push({id:seq++,...structuredClone(values)});},update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),structuredClone(values));},
  destroy:async({filter})=>{const i=rows.findIndex(r=>r.key===filter.key);if(i>=0)rows.splice(i,1);}};
 return {s:new Skills({db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}}),rows};}
test('the library starts with three built-in Skills, off in every project, and is shared by all projects',async()=>{
 const {s,rows}=harness();let l=await s.list('1');
 assert.deepEqual(l.skills.map(x=>[x.name,x.enabled,x.builtIn]),[['docs-page-writing',false,true],['research-report',false,true],['seo-title-description',false,true]]);
 assert.deepEqual(l.skills.find(x=>x.name==='research-report').files.map(f=>f.path),['templates/report.md']);assert.ok(l.skills.every(x=>!('body' in x)),'the list carries no body');
 await s.list('2');assert.equal(rows.filter(r=>r.key==='nr-skills').length,1,'seeded once');
 await s.setEnabled('1',{skillId:'research-report',enabled:true});assert.equal((await s.list('1')).skills.find(x=>x.name==='research-report').enabled,true);assert.equal((await s.list('2')).skills.find(x=>x.name==='research-report').enabled,false,'turned on per project');
 await s.remove({skillId:'research-report'});l=await s.list('1');assert.equal(l.skills.length,2,'built-in Skills can be deleted and do not come back');assert.ok(!rows.some(r=>r.key==='nr-skill:research-report'));
});
test('creating and editing: SKILL.md rules for the name, one name per Skill, text files only within limits',async()=>{
 const {s}=harness();
 await assert.rejects(s.create({name:'SEO Title',description:'x',body:'y'}),/英文小写/);await assert.rejects(s.create({name:'seo-title',description:' ',body:'y'}),/什么时候用/);await assert.rejects(s.create({name:'seo-title',description:'x',body:''}),/怎么做/);
 const {skill}=await s.create({name:' Seo-Title ',description:'改标题时用',body:'## 标题\n- 30–60 字符'},'7');assert.equal(skill.name,'seo-title');assert.match(skill.id,/^sk-/);assert.equal(skill.createdBy,'7');
 await assert.rejects(s.create({name:'seo-title',description:'x',body:'y'}),e=>e.status===409);
 await s.update({skillId:skill.id,description:'写或改标题时用',body:'新的正文'});let g=await s.get('1',{skillId:skill.id});assert.equal(g.body,'新的正文');assert.equal(g.skill.description,'写或改标题时用');
 await assert.rejects(s.update({skillId:skill.id,name:'docs-page-writing'}),/已经有/);
 await s.addFiles({skillId:skill.id,files:[{path:'examples/good.md',text:'好例子'},{path:'./templates\\t.md',text:'模板'}]});g=await s.get('1',{skillId:skill.id});assert.deepEqual(g.files.map(f=>f.path),['examples/good.md','templates/t.md']);assert.equal(g.skill.chars,'新的正文'.length+'好例子'.length+'模板'.length);
 await s.addFiles({skillId:skill.id,files:[{path:'examples/good.md',text:'更好的例子'}]});g=await s.get('1',{skillId:skill.id});assert.equal(g.files.length,2,'same path replaces');assert.equal(g.files[0].text,'更好的例子');
 await assert.rejects(s.addFiles({skillId:skill.id,files:[{path:'bin.png',text:'\u0000PNG'}]}),/不是文字/);await assert.rejects(s.addFiles({skillId:skill.id,files:[{path:'x.md',text:'a'.repeat(200001)}]}),/太长/);
 await s.removeFile({skillId:skill.id,path:'templates/t.md'});assert.equal((await s.get('1',{skillId:skill.id})).files.length,1);await assert.rejects(s.removeFile({skillId:skill.id,path:'nope.md'}),e=>e.status===404);
 for(const bad of ['../x.md','a/../../b','.git/config','SKILL.md','a/b/c/d/e.md'])assert.throws(()=>cleanPath(bad),/./,bad);assert.equal(cleanPath('/scripts/run.py'),'scripts/run.py');
});
test('importing a folder: SKILL.md frontmatter gives the name and description; other fields are not kept',async()=>{
 const md='---\nname: brand-voice\ndescription: >\n  写任何对外文字时用：\n  语气和禁用词\nallowed-tools: Bash\nlicense: MIT\n---\n\n# 品牌语气\n不用感叹号';
 assert.deepEqual(parseSkillMd(md),{name:'brand-voice',description:'写任何对外文字时用： 语气和禁用词',body:'# 品牌语气\n不用感叹号'});
 assert.deepEqual(parseSkillMd('---\nname: "a-b"\ndescription: \'It\'\'s for X\'\n---\nbody'),{name:'a-b',description:"It's for X",body:'body'});
 assert.equal(parseSkillMd('---\nname: x\ndescription: |\n  line one\n  line two\n---\n').description,'line one\nline two');
 assert.deepEqual(parseSkillMd('no frontmatter'),{name:'',description:'',body:'no frontmatter'});
 const {s}=harness();
 const {skill}=await s.importFolder({files:[{path:'SKILL.md',text:md},{path:'references/words.md',text:'禁用词：赋能'},{path:'scripts/check.sh',text:'echo hi'}]});
 assert.equal(skill.name,'brand-voice');assert.deepEqual(skill.files.map(f=>f.path),['references/words.md','scripts/check.sh']);assert.equal((await s.get('1',{skillId:skill.id})).body,'# 品牌语气\n不用感叹号');
 // A folder one level up (the browser kept the folder name) works too; several Skills at once do not.
 const r=await s.importFolder({files:[{path:'tone/SKILL.md',text:md.replace('brand-voice','tone')},{path:'tone/a.md',text:'a'},{path:'other.txt',text:'ignored'}]});assert.equal(r.skill.name,'tone');assert.deepEqual(r.skill.files.map(f=>f.path),['a.md']);
 await assert.rejects(s.importFolder({files:[{path:'a/SKILL.md',text:md},{path:'b/SKILL.md',text:md}]}),/好几个/);
 await assert.rejects(s.importFolder({files:[{path:'README.md',text:'x'}]}),/没有 SKILL\.md/);
 await assert.rejects(s.importFolder({files:[{path:'SKILL.md',text:'---\ndescription: x\n---\nbody'}]}),/没有写 name/);
 await assert.rejects(s.importFolder({files:[{path:'SKILL.md',text:md}]}),e=>e.status===409,'same name');
});
test('what goes with a task: the step\'s Skills first, then the ones turned on; deleted ones skipped; within a budget',async()=>{
 const {s}=harness();assert.deepEqual(await s.forAgent('1',['x']),[],'nothing before the library exists');await s.list('1');
 await s.setEnabled('1',{skillId:'docs-page-writing',enabled:true});
 let out=await s.forAgent('1',['research-report','gone']);assert.deepEqual(out.map(x=>[x.name,x.required]),[['research-report',true],['docs-page-writing',false]]);
 assert.equal(out[0].files[0].path,'templates/report.md');assert.ok(out[0].body.includes('先写结论'));
 assert.deepEqual((await s.forAgent('2',[])),[],'another project has nothing turned on');
 const big=await s.create({name:'big',description:'x',body:'b'.repeat(50000),files:[]});await s.addFiles({skillId:big.skill.id,files:Array.from({length:3},(_,j)=>({path:`f${j}.md`,text:'c'.repeat(150000)}))});
 const big2=await s.create({name:'big-two',description:'x',body:'b'.repeat(50000)});await s.addFiles({skillId:big2.skill.id,files:Array.from({length:3},(_,j)=>({path:`g${j}.md`,text:'d'.repeat(150000)}))});
 await assert.rejects(s.addFiles({skillId:big.skill.id,files:[{path:'more.md',text:'e'.repeat(100000)}]}),/最多 500,000 字/);
 await s.setEnabled('1',{skillId:big.skill.id,enabled:true});await s.setEnabled('1',{skillId:big2.skill.id,enabled:true});
 out=await s.forAgent('1',[]);assert.ok(out.reduce((n,x)=>n+(x.body||'').length+(x.files||[]).reduce((m,f)=>m+f.text.length,0),0)<=AGENT_BUDGET);assert.deepEqual(out.filter(x=>x.omitted).map(x=>x.name),['big-two'],'what does not fit is listed by name');
});
