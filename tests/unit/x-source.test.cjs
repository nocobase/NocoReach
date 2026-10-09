const test=require('node:test'),assert=require('node:assert/strict');
const {XSource,termsOf,handleOf,query}=require('../../apps/nocoreach/server/providers/reach/domain/x-source.cjs');
const {xSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
const {windowFor}=require('../../apps/nocoreach/server/providers/reach/domain/data-views.cjs');
const DAY=86400000,day=n=>new Date(Date.now()-n*DAY).toISOString().slice(0,10),TOKEN='AAAAAAAAAAAAAAAAAAAAA'+'x'.repeat(60);
const post=(id,likes,ago=1)=>({id,text:`post ${id} about NocoBase`,created_at:new Date(Date.now()-ago*DAY).toISOString(),lang:'en',public_metrics:{like_count:likes,retweet_count:1,reply_count:2,quote_count:0,impression_count:500}});
function setup(replies){const rows=[],env={},calls=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={store:{repository:()=>repo,transaction:fn=>fn({}),query:async()=>{}},env:k=>env[k]||'',variable:async(k,v)=>{if(v===null)delete env[k];else env[k]=v;},projectIds:async()=>['1']};
 const x=new XSource(p,async(url,init)=>{calls.push({url:decodeURIComponent(url),auth:init.headers.Authorization});const r=replies.shift();if(!r)throw new Error('no reply');return {ok:r.status===200,status:r.status,json:async()=>r.body};});
 return {x,rows,env,calls};}
const counts={status:200,body:{data:Array.from({length:8},(_,i)=>({start:`${day(7-i)}T00:00:00.000Z`,end:`${day(6-i)}T00:00:00.000Z`,tweet_count:i===7?0:10+i}))}};

test('X: product names quoted, retweets and the own account left out; the token checked with one counts request',async()=>{
 assert.deepEqual(termsOf('NocoBase, nocobase.com'),['NocoBase','nocobase.com']);assert.equal(handleOf('https://x.com/NocoBase'),'NocoBase');assert.throws(()=>handleOf('a b'),/@NocoBase/);
 assert.equal(query(['NocoBase','nocobase.com'],'NocoBase'),'("NocoBase" OR "nocobase.com") -is:retweet -from:NocoBase');
 const bad=setup([{status:401,body:{title:'Unauthorized'}}]);await assert.rejects(bad.x.connect('1',{terms:'NocoBase',token:TOKEN}),/Bearer Token 无效/);assert.equal(bad.env.NOREACH_X_TOKEN_1,undefined,'a refused token is not saved');
 await assert.rejects(setup([]).x.connect('1',{terms:'NocoBase',token:'short'}),/不像 X 的 Bearer Token/);await assert.rejects(setup([]).x.connect('1',{terms:'NocoBase'}),/请粘贴/);
 const {x,env,calls}=setup([counts,{status:200,body:{data:[post('1',5),post('2',150)],meta:{newest_id:'2',result_count:2}}}]);
 let st=await x.connect('1',{terms:'NocoBase',handle:'@NocoBase',token:TOKEN});await x.checking;
 assert.equal(env.NOREACH_X_TOKEN_1,TOKEN);assert.match(calls[0].url,/counts\/recent\?query=\("NocoBase"\) -is:retweet -from:NocoBase&granularity=day/);assert.equal(calls[0].auth,`Bearer ${TOKEN}`);
 assert.match(calls[1].url,/search\/recent\?query=.*max_results=100.*start_time=/);assert.ok(!/expansions/.test(calls[1].url),'authors are not requested');
 st=await x.status('1');assert.equal(st.total,2);assert.deepEqual(st.spend,{usd:0.015,posts:2,requests:2});assert.equal(st.cap,5);
});

test('X: daily reads continue from the newest post, stop at the monthly cap, and the page sums the counts',async()=>{
 const {x,rows,calls}=setup([counts,{status:200,body:{data:[post('1',5),post('2',150)],meta:{newest_id:'2',result_count:2}}},counts,{status:200,body:{data:[post('3',3,0)],meta:{newest_id:'3',result_count:1}}}]);
 await x.connect('1',{terms:'NocoBase',token:TOKEN,cap:1});await x.checking;
 assert.deepEqual(await x.check('1'),{skipped:true},'once a day');
 const r=await x.check('1',{force:true});assert.equal(r.added,1);assert.match(calls.at(-1).url,/since_id=2/);assert.ok(!/start_time/.test(calls.at(-1).url));
 // near the cap: no request that could pass it
 rows[0].payload.spend[new Date().toISOString().slice(0,7)].usd=0.996;const n=calls.length;const c=await x.check('1',{force:true});assert.equal(c.capped,true);assert.equal(calls.length,n,'nothing read past the cap');
 const v=await x.view('1',{range:'7'},windowFor);assert.equal(v.kpis[0].value,10+11+12+13+14+15+16);assert.equal(v.top[0].id,'2');assert.ok(v.notes.some(t=>/本月已到上限/.test(t)));assert.ok(v.notes.some(t=>/实际账单以 X 开发者后台为准/.test(t)));
 const sig=xSignals({xs:rows[0].payload,now:Date.now()});assert.deepEqual(sig.map(s=>s.key.split(':')[0]),['x-hot']);assert.match(sig[0].title,/150 个赞/);
 // out of credits on X's side: said plainly, not retried until the next day
 const broke=setup([{status:402,body:{title:'CreditsDepleted',detail:'Your enrolled account does not have any credits'}}]);broke.env.NOREACH_X_TOKEN_1=TOKEN;broke.rows.push({id:1,key:'x:1',payload:{terms:['NocoBase'],cap:5,status:'active',posts:{},counts:{},spend:{}}});
 const e=await broke.x.check('1',{force:true});assert.match(e.errors[0],/额度用完/);assert.equal((await broke.x.status('1')).lastRun.ok,false);assert.deepEqual(await broke.x.check('1'),{skipped:true});
 await x.disconnect('1');assert.equal((await x.status('1')).connected,false);
});
