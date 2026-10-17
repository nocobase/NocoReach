// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/knowledge-suggest.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { KnowledgeSuggest, json } from '../../server/nocoreach/knowledge-suggest.js';
const test=__vitest_test;
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$startsWith' in v?String(r[k]).startsWith(v.$startsWith):false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k]};
 return {rows,findOne:async o=>wrap(rows.find(r=>match(r,o.filter))),find:async o=>rows.filter(r=>match(r,o.filter)).slice(o.offset||0,(o.offset||0)+(o.limit||100)).map(wrap),create:async o=>{const r={id:++id,...o.values};rows.push(r);return wrap(r);},destroy:async o=>{const i=rows.findIndex(r=>r.id===o.filterByTk);if(i>=0)rows.splice(i,1);}};}
function service({reply,fail:aiFails}={}){const snaps=memory(),calls={added:[],memory:null,skills:[]};
 const project={id:1,name:'NocoBase',memory:{brand:'NocoBase 是开源无代码平台',wording:'写“无代码”，不写“低代码”'}};
 const p={db:{getRepository:()=>snaps,access:{requireFor:async()=>{}}},projects:{row:async()=>({get:()=>project})},
  knowledge:{read:async(name)=>`读出的 ${name} 文字`,add:async(id,v)=>{calls.added.push(v);return {item:{id:'k1',title:v.title}};},saveMemory:async(id,v)=>{calls.memory=v.memory;project.memory=v.memory;return v;}},
  skills:{readLink:async({url})=>{if(url.includes('/skills/seo'))return {source:url,name:'seo-check',description:'检查 SEO',files:[{path:'SKILL.md',text:'---\nname: seo-check\n---'}],skipped:[]};if(url.includes('github.com/org/skills'))return {source:url,choices:[{path:'a',name:'a',description:'A'}]};throw Object.assign(new Error('不是 Skill'),{status:422});},importFolder:async v=>{calls.skills.push(v);return {skill:{name:'seo-check'}};},importLink:async v=>{calls.skills.push(v);return {imported:['a'],skipped:[]};}},
  taskExecution:{provider:{complete:async(system,user)=>{calls.lastPrompt={system,user:JSON.parse(user)};if(aiFails)throw Object.assign(new Error('x'),{status:409});return reply;}}}};
 const s=new KnowledgeSuggest(p,async url=>({text:'<html><body><h1>Appsmith 定价</h1><p>Business 每人每月 15 美元</p></body></html>',type:'text/html',url}));
 return {s,calls,snaps,project};}
const reply='```json\n{"title":"Appsmith 定价","category":"competitor","summary":"竞品定价","memory":[{"section":"competitors","text":"Appsmith 按人收费，Business 每人每月 15 美元","reason":"竞品定价是长期事实"},{"section":"wording","text":"写“无代码”，不写“低代码”","reason":"重复"},{"section":"nope","text":"x"}]}\n```';

test('添加: the online AI suggests the 知识库 title and category and new 记忆 lines; nothing is kept until confirmed',async()=>{
 assert.deepEqual(json('前言 {"a":1} 尾巴'),{a:1});assert.equal(json('no json'),null);
 const {s,calls,snaps}=service({reply});
 const r=await s.suggest('1',{url:'https://appsmith.com/pricing'});
 assert.equal(r.kind,'knowledge');assert.equal(r.aiUsed,true);assert.deepEqual([r.title,r.category],['Appsmith 定价','competitor']);
 assert.deepEqual(r.memory.map(m=>[m.section,m.label]),[['competitors','竞品']],'unknown sections and lines already in 记忆 are dropped');
 assert.match(calls.lastPrompt.user.material,/Business 每人每月 15 美元/);assert.ok(!/<p>/.test(calls.lastPrompt.user.material),'pages are read as text');assert.equal(calls.lastPrompt.user.memory.brand,'NocoBase 是开源无代码平台');
 assert.equal(calls.added.length,0,'not saved before confirming');assert.equal(snaps.rows.filter(x=>x.key.startsWith('knowledge-draft:1:')).length,1);
 const c=await s.confirm('1',{draftId:r.draftId,title:'Appsmith 定价',category:'competitor',memory:[{section:'competitors',text:r.memory[0].text}]},'u1');
 assert.equal(calls.added[0].source,'https://appsmith.com/pricing');assert.match(calls.added[0].text,/Appsmith 定价/);assert.deepEqual(c.memory,['竞品']);
 assert.equal(calls.memory.competitors,'Appsmith 按人收费，Business 每人每月 15 美元');assert.equal(calls.memory.brand,'NocoBase 是开源无代码平台','other sections kept');
 assert.equal(snaps.rows.filter(x=>x.key.startsWith('knowledge-draft:')).length,0,'the draft is used up');await assert.rejects(s.confirm('1',{draftId:r.draftId}),e=>e.status===410);
 // keep only the 记忆 lines
 const r2=await s.suggest('1',{text:'一些资料'});await s.confirm('1',{draftId:r2.draftId,saveKnowledge:false,memory:[]});assert.equal(calls.added.length,1);
});

test('添加: without an online AI the material still goes to the 知识库 with defaults; a SKILL.md or a Skill link goes to Skills',async()=>{
 const {s,calls}=service({fail:true});
 const r=await s.suggest('1',{file:{name:'访谈纪要.docx',data:Buffer.from('x').toString('base64')}});
 assert.equal(r.aiUsed,false);assert.match(r.aiError,/还没有接入在线 AI/);assert.deepEqual([r.title,r.category,r.memory.length],['访谈纪要','other',0]);
 await s.confirm('1',{draftId:r.draftId,title:r.title,category:'customer'},'u1');assert.equal(calls.added[0].fileName,'访谈纪要.docx');assert.equal(calls.added[0].category,'customer');
 const md=await s.suggest('1',{text:'---\nname: release-notes\ndescription: 写发布说明\n---\n正文'});assert.equal(md.kind,'skill');assert.equal(md.skill.name,'release-notes');
 await s.confirm('1',{draftId:md.draftId},'u1');assert.equal(calls.skills[0].files[0].path,'SKILL.md');
 const link=await s.suggest('1',{url:'https://github.com/org/repo/tree/main/skills/seo'});assert.deepEqual([link.kind,link.skill.name],['skill','seo-check']);
 await s.confirm('1',{kind:'skill',link:'https://github.com/org/repo/tree/main/skills/seo'},'u1');assert.equal(calls.skills[1].source,'https://github.com/org/repo/tree/main/skills/seo');
 const many=await s.suggest('1',{url:'https://github.com/org/skills'});assert.equal(many.kind,'skills');await s.confirm('1',{kind:'skills',link:'https://github.com/org/skills',paths:['a']},'u1');assert.deepEqual(calls.skills[2].paths,['a']);
});
