const test=require('node:test'),assert=require('node:assert/strict');
const {MemoryUpdate,KEY_PATH}=require('../../plugins/connections/server/memory-update');
const DAY=86400000,ago=n=>new Date(Date.now()-n*DAY).toISOString();
function store(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?String(r[k]).startsWith(v.$startsWith):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k]};
 return {rows,findOne:async o=>wrap(rows.find(r=>match(r,o.filter))),find:async o=>rows.filter(r=>match(r,o.filter)).sort((a,b)=>o.sort==='-id'?b.id-a.id:0).slice(o.offset||0,(o.offset||0)+(o.limit||100)).map(wrap),
  create:async o=>{const r={id:++id,...o.values};rows.push(r);return wrap(r);},update:async o=>{Object.assign(rows.find(r=>r.id===o.filterByTk),o.values);}};}
const HOME='<html><head><title>NocoBase</title></head><body><a href="/pricing">定价</a><a href="https://www.nocobase.com/en/about">关于</a><a href="/blog/2026/post">博客</a><a href="https://other.com/pricing">外站</a><p>NocoBase 是开源、可自托管的无代码平台，用数据模型搭建业务系统，插件扩展一切功能，适合企业 IT 团队。</p></body></html>';
const PAGE=t=>`<html><head><title>${t}</title></head><body><p>${t}：${'这是一段足够长的正文，说明产品的价值和用法。'.repeat(4)}</p></body></html>`;
function service({replies=[],noAi=false,site=null}={}){const snaps=store(),calls={prompts:[],downloads:[],saved:[]};
 const project={id:1,name:'NocoBase',domains:['nocobase.com'],memory:{brand:'',product:'',audience:'',markets:'',voice:'',wording:'写“无代码”，不写“低代码”',messages:'',competitors:'Retool',rules:''}};
 const p={db:{getRepository:()=>snaps},projects:{row:async()=>({get:()=>project})},projectIds:async()=>['1'],
  knowledge:{list:async()=>({items:[{id:'k1',title:'2026 竞品对比'}]}),get:async()=>({text:'Appsmith 和 ToolJet 是主要竞品'}),saveMemory:async(id,v)=>{calls.saved.push(v.memory);project.memory=v.memory;return v;}},
  siteContent:{state:async()=>site},
  ...(noAi?{}:{taskExecution:{provider:{complete:async(system,user)=>{calls.prompts.push({system,user:JSON.parse(user)});const r=replies.shift();if(r instanceof Error)throw r;return r;}}}})};
 const s=new MemoryUpdate(p,async url=>{calls.downloads.push(url);if(url==='https://nocobase.com/')return {text:HOME,type:'text/html'};if(/pricing|about/.test(url))return {text:PAGE(/pricing/.test(url)?'定价':'关于我们'),type:'text/html'};throw new Error('no');});
 return {s,calls,snaps,project};}

test('first draft of 记忆: reads the home page, its main pages and the 知识库; fills empty sections, suggests for written ones',async()=>{
 const {s,calls,project}=service({replies:['```json\n{"memory":{"brand":"NocoBase：开源、可自托管的无代码平台","product":"数据模型驱动；插件架构","audience":"企业 IT 团队","wording":"写“无代码”，不写“低代码”","competitors":"Retool、Appsmith、ToolJet","rules":""}}\n```']});
 await s.draft('1');
 assert.deepEqual(calls.downloads,['https://nocobase.com/','https://nocobase.com/pricing','https://www.nocobase.com/en/about'],'home first, then key pages of the same site only');
 const user=calls.prompts[0].user;assert.equal(user.website.length,3);assert.match(user.website[1].text,/定价/);assert.equal(user.material[0].title,'2026 竞品对比');
 assert.equal(project.memory.brand,'NocoBase：开源、可自托管的无代码平台');assert.equal(project.memory.audience,'企业 IT 团队');
 assert.equal(project.memory.competitors,'Retool','a written section is not overwritten');assert.equal(project.memory.rules,'');
 const st=await s.status('1');assert.equal(st.draft.status,'done');assert.deepEqual(st.draft.filled,['品牌基础','产品','受众']);assert.deepEqual(st.draft.items,['2026 竞品对比']);assert.equal(st.draft.pages.length,3);
 assert.deepEqual(st.suggestions.map(x=>[x.section,x.text,x.replace,x.source]),[['competitors','Retool、Appsmith、ToolJet','Retool','draft']],'the same wording as now is not suggested again');
 // without an online AI the draft says so and waits for the person
 const none=service({noAi:true});await assert.rejects(none.s.draft('1'));const f=await none.s.status('1');assert.equal(f.draft.status,'failed');assert.equal(f.draft.error,'还没有接入在线 AI');assert.equal(f.aiReady,false);
});

test('weekly check: change requests, approved results and new pages since the last check become suggestions to accept or ignore',async()=>{
 const reply=JSON.stringify({memory:[
  {section:'wording',text:'产品名写 NocoBase，不写 Nocobase',reason:'修改意见出现了 2 次',source:'reviews',examples:['Nocobase 拼错了']},
  {section:'wording',text:'写“无代码”，不写“低代码”',source:'reviews'},
  {section:'competitors',text:'Retool（按人收费）',replace:'Retool',reason:'成果里确认了定价',source:'results'},
  {section:'product',text:'新增 AI 员工',replace:'不存在的旧行',reason:'官网新页面',source:'site'},
  {section:'nope',text:'x'}]});
 const site={pages:[{url:'https://nocobase.com/ai-employees',title:'AI 员工',firstSeenAt:ago(1)},{url:'https://nocobase.com/old',title:'旧页面'}]};
 const {s,calls,snaps,project}=service({replies:[reply,reply],site});
 snaps.rows.push({id:90,key:'nr-task-review:1:5:a',payload:{decision:'requestChanges',comment:'Nocobase 拼错了',at:ago(20)}},{id:91,key:'nr-task-review:1:6:b',payload:{decision:'requestChanges',comment:'又写成 Nocobase 了',at:ago(2)}},
  {id:92,key:'nr-task-review:1:7:c',payload:{decision:'approve',artifactVersionId:'v1',at:ago(1)}},{id:93,key:'nr-task-artifact:1:7:v1',payload:{content:'Retool 按人收费，我们按服务器收费'}},{id:94,key:'nr-task-review:2:1:d',payload:{decision:'requestChanges',comment:'别的项目',at:ago(1)}});
 snaps.rows.push({id:95,key:'memory-updates:1',payload:{suggestions:[],dismissed:[],lastCheck:{at:ago(8),ok:true}}});
 await s.check('1');
 const user=calls.prompts[0].user;assert.deepEqual(user.comments.map(c=>[c.text,c.isNew]),[['又写成 Nocobase 了',true],['Nocobase 拼错了',false]],'all comments of 90 days, the new ones marked');
 assert.deepEqual(user.results,[{text:'Retool 按人收费，我们按服务器收费'}]);assert.deepEqual(user.newPages.map(p=>p.title),['AI 员工']);assert.equal(user.website.length,3,'website text the first time it is seen');
 let st=await s.status('1');
 assert.deepEqual(st.suggestions.map(x=>[x.label,x.text,x.replace||'',x.source]),[['用词','产品名写 NocoBase，不写 Nocobase','','reviews'],['竞品','Retool（按人收费）','Retool','results'],['产品','新增 AI 员工','','site']],'unknown sections, lines already in 记忆 and replacements of lines that are not there are cleaned');
 assert.equal(st.lastCheck.added,3);assert.deepEqual(st.lastCheck.counts,{comments:1,results:1,pages:1,siteChanged:true});
 // nothing new since: no AI call
 await s.check('1');assert.equal(calls.prompts.length,1);
 // accept two, ignore one; ignored lines are not suggested again
 const [w,c,pr]=st.suggestions;st=await s.accept('1',{ids:[w.id,c.id]});assert.deepEqual(st.memory,['用词','竞品']);
 assert.equal(project.memory.wording,'写“无代码”，不写“低代码”\n产品名写 NocoBase，不写 Nocobase');assert.equal(project.memory.competitors,'Retool（按人收费）');
 st=await s.dismiss('1',{ids:[pr.id]});assert.equal(st.suggestions.length,0);
 snaps.rows.push({id:96,key:'nr-task-review:1:8:e',payload:{decision:'requestChanges',comment:'Nocobase 又错了',at:new Date().toISOString()}});await s.check('1');
 assert.deepEqual((await s.status('1')).suggestions.map(x=>x.text),[],'accepted lines are in 记忆 now and the ignored one stays ignored');
 await assert.rejects(s.accept('1',{ids:[w.id]}),/已经处理过/);
});

test('hourly tick checks projects a week after the last check or first draft; never without an online AI',async()=>{
 const {s,snaps}=service({replies:['{"memory":[]}']});let checked=0;s.check=async()=>{checked++;};
 snaps.rows.push({id:1,key:'memory-updates:1',payload:{suggestions:[],draft:{status:'done',at:ago(3)}}});await s.tick();assert.equal(checked,0);
 snaps.rows[0].payload={suggestions:[],draft:{status:'done',at:ago(3)},lastCheck:{at:ago(8),ok:false,error:'x'}};await s.tick();assert.equal(checked,1,'a failed check waits a week too');
 const none=service({noAi:true});none.s.check=async()=>{checked++;};await none.s.tick();assert.equal(checked,1);
 for(const path of ['/pricing','/en/about','/products/crm','/zh-cn/features/']) assert.ok(KEY_PATH.test(path),path);
 for(const path of ['/blog/2026/post','/docs/a/b','/pricing/a/b','/']) assert.ok(!KEY_PATH.test(path),path);
});
