const test=require('node:test'),assert=require('node:assert/strict');
const {CommunitySource,topicFields,mergeTopics,overview}=require('../../plugins/connections/server/community-source');
test('topic fields keep content and interaction only, never usernames',()=>{
 const f=topicFields({id:1,title:'Install fails',slug:'install-fails',category_id:5,tags:['bug'],posts_count:4,views:90,like_count:2,has_accepted_answer:true,created_at:'2026-09-01T00:00:00Z',last_poster_username:'alice',posters:[{user_id:3}]});
 assert.deepEqual(Object.keys(f).sort(),['categoryId','createdAt','id','lastPostedAt','likes','replies','slug','solved','tags','title','views']);assert.equal(f.replies,3);assert.ok(!JSON.stringify(f).includes('alice'));
});
test('merge keeps the 90-day window, skips pinned and non-regular topics, updates counts',()=>{
 const since='2026-07-01T00:00:00Z';const old={'1':{id:1,title:'A',views:1,createdAt:'2026-08-01T00:00:00Z'},'9':{id:9,title:'Old',createdAt:'2026-01-01T00:00:00Z'}};
 const m=mergeTopics(old,[{id:1,title:'A',views:50,posts_count:2,created_at:'2026-08-01T00:00:00Z'},{id:2,title:'Pinned',pinned:true,created_at:'2026-09-01T00:00:00Z'},{id:3,title:'PM',archetype:'private_message',created_at:'2026-09-01T00:00:00Z'},{id:4,title:'Too old',created_at:'2026-06-01T00:00:00Z'}],since);
 assert.deepEqual(Object.keys(m),['1']);assert.equal(m['1'].views,50);assert.equal(m['1'].replies,1);
});
test('overview counts unanswered, solved and categories',()=>{
 const recent=new Date().toISOString(),old=new Date(Date.now()-200*86400000).toISOString();const o=overview({'1':{id:1,title:'a',views:10,replies:0,solved:false,categoryId:5,createdAt:recent},'2':{id:2,title:'b',views:5,replies:3,solved:true,categoryId:6,createdAt:recent},'3':{id:3,title:'old',views:99,replies:9,solved:false,categoryId:5,createdAt:old}},{5:'Questions',6:'Bugs'});assert.equal(o.total,2);
 assert.equal(o.unanswered,1);assert.equal(o.solved,1);assert.deepEqual(o.categories.map(c=>c.name).sort(),['Bugs','Questions']);assert.equal(o.top[0].id,2);
});
test('preview refuses non-Discourse sites; connect returns before the slow first sync finishes',async()=>{
 let payload=null;const repo={findOne:async()=>payload?{get:()=>payload}:null,update:async({values})=>{payload=values.payload;},create:async({values})=>{payload=values.payload;}};
 const plugin={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const files={'https://forum.ex.com/about.json':'{"about":{"title":"Ex Forum"}}','https://forum.ex.com/latest.json?order=created&ascending=false':'{"topic_list":{"topics":[{"id":1,"title":"Hi","created_at":"2026-09-30T00:00:00Z"}]}}','https://forum.ex.com/site.json':'{"categories":[{"id":5,"name":"Q"}]}'};
 let release;const gate=new Promise(r=>{release=r;});
 const read=async u=>{if(u.includes('/latest.json?order=created&ascending=false&page='))await gate;if(u.includes('&page='))return {text:JSON.stringify({topic_list:{topics:[{id:2,title:'New',created_at:new Date().toISOString(),posts_count:1}]}})};if(u.includes('/t/'))return {text:'{"post_stream":{"posts":[{"cooked":"<p>Body</p>"}]}}'};if(!(u in files))throw new Error('404');return {text:files[u]};};
 const c=new CommunitySource(plugin,read,async()=>{});
 await assert.rejects(new CommunitySource(plugin,async()=>{throw new Error('404');},async()=>{}).preview('https://blog.ex.com'),e=>e.status===422);
 const st=await c.connect('1','https://forum.ex.com');assert.equal(st.origin,'https://forum.ex.com');assert.equal(st.lastSync,undefined);
 assert.equal((await c.status('1')).syncing,true);release();await c.syncing;const done=await c.status('1');assert.equal(done.total,1);assert.equal(done.syncing,false);assert.equal(payload.topics['2'].excerpt,'Body');
});

test('first sync reads back to the window start and records coverage; later syncs stop after the last week',async()=>{
 let payload={origin:'https://f.ex.com',status:'active',topics:{}};const repo={findOne:async()=>({get:()=>payload}),update:async({values})=>{payload=values.payload;},create:async()=>{}};
 const plugin={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};const DAY=86400000,at=n=>new Date(Date.now()-n*DAY).toISOString();
 const pages=[[{id:1,title:'new',created_at:at(1),posts_count:2}],[{id:2,title:'mid',created_at:at(100),posts_count:1}],[{id:3,title:'older',created_at:at(300),posts_count:1}],[{id:4,title:'too old',created_at:at(600),posts_count:1}]];
 const requested=[];const read=async u=>{if(u.endsWith('/site.json'))return {text:'{"categories":[]}'};if(u.includes('/t/'))return {text:'{"post_stream":{"posts":[]}}'};const page=Number(new URL(u).searchParams.get('page'));requested.push(page);return {text:JSON.stringify({topic_list:{topics:pages[page]||[],more_topics_url:page<3?'/more':null}})};};
 const c=new CommunitySource(plugin,read,async()=>{});
 await c.sync('1');assert.deepEqual(requested,[0,1,2,3]);assert.deepEqual(Object.keys(payload.topics).sort(),['1','2','3']);assert.ok(payload.backfilledAt);assert.equal(payload.retainedFrom,new Date(Date.now()-490*DAY).toISOString().slice(0,10));
 requested.length=0;await c.sync('1');assert.deepEqual(requested,[0,1]);assert.deepEqual(Object.keys(payload.topics).sort(),['1','2','3']);
});
