const test=require('node:test'),assert=require('node:assert/strict');
const {Lighthouse,specification,result}=require('../../apps/nocoreach/server/providers/reach/domain/lighthouse.cjs');
const report={status_code:20000,cost:0.00425,tasks:[{status_code:20000,cost:0.00425,result:[{finalUrl:'https://www.example.com/',lighthouseVersion:'12.6.0',
 categories:{performance:{score:0.42,auditRefs:[{id:'largest-contentful-paint'},{id:'render-blocking-resources'},{id:'unused-javascript'},{id:'diagnostics'},{id:'uses-http2'}]},accessibility:{score:0.88,auditRefs:[{id:'color-contrast'},{id:'image-alt'}]},'best-practices':{score:1,auditRefs:[]},seo:{score:0.92,auditRefs:[{id:'meta-description'}]}},
 audits:{'largest-contentful-paint':{score:0.1,scoreDisplayMode:'numeric',displayValue:'6.2 s'},'cumulative-layout-shift':{score:0.95,displayValue:'0.02'},'total-blocking-time':{score:0.3,displayValue:'890 ms'},
  'render-blocking-resources':{title:'Eliminate render-blocking resources',description:'Resources are blocking the first paint. [Learn more](https://x).',score:0.2,scoreDisplayMode:'metricSavings',displayValue:'Potential savings of 1,200 ms',details:{overallSavingsMs:1200}},
  'unused-javascript':{title:'Reduce unused JavaScript',score:0.6,scoreDisplayMode:'metricSavings',details:{overallSavingsMs:300,overallSavingsBytes:250000}},
  diagnostics:{score:0,scoreDisplayMode:'informative'},'uses-http2':{score:0.5,scoreDisplayMode:'notApplicable'},
  'color-contrast':{title:'Background and foreground colors do not have a sufficient contrast ratio.',score:0,scoreDisplayMode:'binary'},'image-alt':{score:1,scoreDisplayMode:'binary'},'meta-description':{score:1,scoreDisplayMode:'binary'}}}]}]};

test('性能检查: one page per run, mobile by default, a longer wait; scores, metrics and the failing checks worst first',()=>{
 const spec=specification({url:'https://www.example.com/#top'});assert.deepEqual([spec.url,spec.strategy,spec.request.for_mobile,spec.timeoutMs],['https://www.example.com/','mobile',true,90000]);
 assert.equal(specification({url:'https://x.io/a',strategy:'desktop'}).request.for_mobile,false);
 assert.throws(()=>specification({url:'http://x.io'}),/https/);assert.throws(()=>specification({url:'not a url'}),/完整的网址/);
 const r=result(report,spec);assert.equal(r.status,'completed');assert.equal(r.costUsd,0.00425);
 assert.deepEqual(r.result.scores,{performance:42,accessibility:88,'best-practices':100,seo:92});
 assert.deepEqual(r.result.metrics.map(m=>[m.label,m.value]),[['LCP','6.2 s'],['CLS','0.02'],['TBT','890 ms']]);
 assert.deepEqual(r.result.issues.map(i=>[i.key,i.severity]),[['render-blocking-resources','high'],['color-contrast','high'],['unused-javascript','medium']],'numeric metrics, diagnostics, not applicable and passing checks are left out');
 assert.equal(r.result.issues[0].description,'Resources are blocking the first paint. Learn more.');
 assert.equal(result({status_code:20000,tasks:[{status_code:40501}]},spec).status,'failed');
 assert.equal(result({status_code:20000,tasks:[{status_code:20000,result:[{categories:{}}]}]},spec).errorCode,'lighthouse_no_scores');
});

test('a check runs only when asked and the same page and device within 30 days is the saved one',async()=>{
 const rows=[];let id=0,calls=0;const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const repo={findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)};
 const env={NOREACH_DATAFORSEO_1:JSON.stringify({login:'a',password:'b',budget:5,verifiedAt:'t'})};
 const p={env:k=>env[k],project:async()=>({domains:['www.example.com']}),siteContent:{state:async()=>null},app:{logger:{warn(){}}},store:{repository:()=>repo,transaction:fn=>fn({}),query:async()=>{}}};
 global.fetch=async(url,init)=>{calls++;assert.ok(String(url).endsWith('on_page/lighthouse/live/json'));assert.equal(JSON.parse(init.body)[0].url,'https://www.example.com/');return {ok:true,json:async()=>report};};
 const l=new Lighthouse(p);assert.deepEqual(await l.status('1'),{connected:true,suggested:'https://www.example.com/'});
 const a=await l.run('1',{url:'https://www.example.com/',requestKey:'lh-aaaaaaaa'});assert.equal(a.status,'completed');assert.equal(a.result.scores.performance,42);
 const b=await l.run('1',{url:'https://www.example.com/',requestKey:'lh-bbbbbbbb'});assert.equal(b.id,a.id);assert.equal(calls,1);
 assert.deepEqual((await l.list('1')).map(x=>[x.url,x.strategy,x.scores.performance]),[['https://www.example.com/','mobile',42]]);
});
