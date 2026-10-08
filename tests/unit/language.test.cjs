const test=require('node:test'),assert=require('node:assert/strict');
const {languageOf,forLanguage}=require('../../plugins/connections/server/language');
const {styleIssues,promptFor,DailyAnalysis}=require('../../plugins/connections/server/daily-analysis');
const {Projects}=require('../../plugins/connections/server/projects');

test('a project writes in Chinese unless set to English; an English project gets the English note on every prompt',()=>{
 assert.equal(languageOf({}),'zh-CN');assert.equal(languageOf(null),'zh-CN');assert.equal(languageOf({language:'en-US'}),'en-US');assert.equal(languageOf({language:'fr'}),'zh-CN');
 assert.equal(forLanguage('写摘要。','zh-CN'),'写摘要。');
 const en=forLanguage('写摘要，使用中文。','en-US');assert.match(en,/^写摘要，使用中文。/);assert.match(en,/in English/);assert.match(en,/overrides any instruction above to write in Chinese/);
 // The analysis adds the English writing rules too; the other prompts only the language.
 assert.match(promptFor('x','en-US',true),/at most 60 characters/);assert.doesNotMatch(promptFor('x','en-US'),/60 characters/);assert.equal(promptFor('x','zh-CN',true),'x');
});

test('the 机会 writing rules in English: 60 characters, no vague verbs, a reason with a number, two sentences',()=>{
 const good={title:'Add a trial CTA to the pricing page',reason:'5,848 impressions but only 0.4% CTR',suggestion:'Add a button under the plans. Link it to the trial form.'};
 assert.deepEqual(styleIssues(good,'en-US'),[]);
 assert.deepEqual(styleIssues({...good,title:'Optimize the click-through rate and ranking of the AI agent docs pages for non-English readers'},'en-US'),['title over 60 characters','title uses "Optimize"']);
 assert.deepEqual(styleIssues({...good,reason:'CTR is low'},'en-US'),['reason has no number']);
 assert.deepEqual(styleIssues({...good,suggestion:'One. Two. Three.'},'en-US'),['suggestion over two sentences']);
 // Chinese rules unchanged for Chinese projects.
 assert.deepEqual(styleIssues({...good,title:'给商业页加试用入口',reason:'曝光 5,848，点击率只有 0.4%'}),[]);
});

test('the daily analysis asks in the project language',async()=>{
 const calls=[];const rows={};const repo={findOne:async({filter})=>rows[filter.key]?{id:filter.key,get:()=>rows[filter.key]}:null,update:async({filterByTk,values})=>{rows[filterByTk]=values.payload;},create:async({values})=>{rows[values.key]=values.payload;}};
 const strategy={context:async()=>({project:{name:'p'},evidence:{signals:{items:[{key:'k'}]},publicSources:[]}}),state:async()=>({revision:1,proposals:[]}),saveInsights:async(id,v)=>({insights:{items:v.insights,observations:v.observations}})};
 const plugin={strategy,project:async()=>({id:1,language:'en-US'}),db:{getRepository:()=>repo},app:{on:()=>{},logger:{warn:()=>{}}}};
 const a=new DailyAnalysis(plugin,async(system)=>{calls.push(system);return {text:'{"observations":["Search clicks fell 12%."],"insights":[]}',model:'m'};});
 const r=await a.run('1','manual');assert.equal(r.ok,true);assert.match(calls[0],/in English/);assert.match(calls[0],/at most 60 characters/);
});

test('a project is created with its language and the language can be changed later',async()=>{
 const rows=[];let seq=1;const wrap=r=>r&&{id:r.id,get:k=>structuredClone(r[k])};const match=(r,f)=>typeof f.key==='string'?r.key===f.key:r.key.startsWith('project:');
 const repo={findOne:async({filter})=>wrap(rows.find(r=>match(r,filter))),find:async({filter})=>rows.filter(r=>match(r,filter)).map(wrap),create:async({values})=>{rows.push({id:seq++,...structuredClone(values)});},update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),structuredClone(values));}};
 const p=new Projects({db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}});
 assert.equal((await p.create({name:'Acme',domain:'acme.dev',language:'en-US'})).language,'en-US');
 assert.equal((await p.create({name:'Beta',domain:'beta.dev',language:'xx'})).language,'zh-CN');
 assert.equal((await p.edit('2',{language:'en-US'})).language,'en-US');assert.equal((await p.get('2')).language,'en-US');
 await assert.rejects(p.edit('2',{language:'de'}),/中文或英文/);
});
