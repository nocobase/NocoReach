const test=require('node:test'),assert=require('node:assert/strict');
const {GitHubSource,parseRepo,mergeDays,summarizeIssues,sampleDelta,TOKEN}=require('../../plugins/connections/server/github-source');
test('repository links are normalized and anything else is refused',()=>{
 assert.equal(parseRepo('https://github.com/nocobase/nocobase'),'nocobase/nocobase');assert.equal(parseRepo('https://github.com/a/b.git/'),'a/b');
 for(const bad of ['http://github.com/a/b','https://gitlab.com/a/b','https://github.com/a','not a url'])assert.throws(()=>parseRepo(bad),e=>e.status===400);
});
test('traffic archive keeps completed days, never lets a smaller later window overwrite, and skips today',()=>{
 const a=mergeDays({},[{timestamp:'2026-09-28T00:00:00Z',count:10,uniques:4},{timestamp:'2026-10-01T00:00:00Z',count:3,uniques:1}],'2026-10-01');
 assert.deepEqual(a,{'2026-09-28':{count:10,uniques:4}});
 assert.deepEqual(mergeDays(a,[{timestamp:'2026-09-28T00:00:00Z',count:6,uniques:2}],'2026-10-02')['2026-09-28'],{count:10,uniques:4});
});
test('issue summary excludes pull requests and old items and ranks by discussion',()=>{
 const now='2026-10-01T00:00:00Z';const s=summarizeIssues([{title:'Install fails',html_url:'u1',state:'open',comments:8,reactions:{total_count:2},created_at:'2026-09-20T00:00:00Z',labels:[{name:'bug'}]},{title:'PR',pull_request:{},created_at:'2026-09-21T00:00:00Z',comments:50},{title:'Old',created_at:'2026-01-01T00:00:00Z',comments:90},{title:'Docs?',html_url:'u2',state:'closed',comments:1,created_at:'2026-09-25T00:00:00Z',labels:['docs']}],now);
 assert.equal(s.total,2);assert.equal(s.open,1);assert.deepEqual(s.labels,{bug:1,docs:1});assert.deepEqual(s.top.map(t=>t.title),['Install fails','Docs?']);
});
test('star change needs both sampled ends',()=>{
 const daily={'2026-09-23':{stars:100},'2026-09-30':{stars:130}};assert.equal(sampleDelta(daily,'stars',7,'2026-09-30'),30);
 assert.equal(sampleDelta({'2026-09-30':{stars:130}},'stars',7,'2026-09-30'),null);assert.equal(sampleDelta({},'stars',7,'2026-09-30'),null);
});
function harness(responses,envToken=''){let payload=null;const vars={};const repo={findOne:async()=>payload?{id:1,get:()=>payload}:null,update:async({values})=>{payload=values.payload;},create:async({values})=>{payload=values.payload;}};
 const plugin={env:k=>vars[k]||envToken,variable:async(k,v,secret)=>{if(v===null)delete vars[k];else vars[k]=v;plugin.secret=secret;},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const calls=[];const request=async(url,init)=>{calls.push({url,auth:init.headers.Authorization});const path=url.replace('https://api.github.com','');const r=responses(path,init.headers.Authorization);return {status:r.status||200,ok:(r.status||200)<400,headers:{get:()=>null},json:async()=>r.body};};
 return {gh:new GitHubSource(plugin,request),vars,calls,get payload(){return payload;},plugin};}
test('connect syncs public data without a token; token is verified against Traffic before it is stored as a secret',async()=>{
 const h=harness((path,auth)=>{if(path==='/repos/org/repo')return {body:{full_name:'org/repo',html_url:'https://github.com/org/repo',stargazers_count:120,forks_count:9,open_issues_count:3}};if(path.startsWith('/repos/org/repo/releases'))return {body:[{tag_name:'v1.0',name:'v1.0',published_at:'2026-09-01T00:00:00Z',html_url:'r'}]};if(path.startsWith('/search/issues'))return {body:{total_count:0,items:[]}};if(path.includes('/traffic/'))return auth==='Bearer github_pat_'+'x'.repeat(30)?{body:path.endsWith('views')?{views:[{timestamp:'2026-09-29T00:00:00Z',count:40,uniques:12}]}:path.endsWith('clones')?{clones:[]}:[]}:{status:403,body:{}};return {status:404,body:{}};});
 await h.gh.connect('1','https://github.com/org/repo');assert.equal(h.calls.some(c=>c.url.includes('/traffic/')),false);assert.equal(h.calls.every(c=>!c.auth),true);
 const st=await h.gh.status('1');assert.equal(st.repo,'org/repo');assert.equal(st.latest.stars,120);assert.equal(st.token,null);
 await assert.rejects(h.gh.setToken('1','not-a-token'),e=>e.status===400);assert.equal(h.vars[TOKEN('1')],undefined);
 await assert.rejects(h.gh.setToken('1','github_pat_'+'y'.repeat(30)),e=>e.status===403);assert.equal(h.vars[TOKEN('1')],undefined);
 await h.gh.setToken('1','github_pat_'+'x'.repeat(30));assert.equal(h.vars[TOKEN('1')],'github_pat_'+'x'.repeat(30));assert.equal(h.plugin.secret,true);
 assert.ok(!JSON.stringify(h.payload).includes('github_pat_'),'token never stored in the snapshot');
 await h.gh.removeToken('1');assert.equal(h.vars[TOKEN('1')],undefined);
});
