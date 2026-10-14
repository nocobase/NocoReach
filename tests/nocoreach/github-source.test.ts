// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/github-source.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { GitHubSource, parseRepo, mergeDays, summarizeIssues, sampleDelta, TOKEN } from '../../server/nocoreach/github-source.js';
import * as __data_views from '../../server/nocoreach/data-views.js';
import * as __github_source from '../../server/nocoreach/github-source.js';
const test=__vitest_test;
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
function harness(responses,envToken=''){let payload=null;const vars={};const other={},repo={findOne:async({filter})=>filter.key==='github:1'?(payload?{id:1,get:()=>payload}:null):other[filter.key]!=null?{id:filter.key,get:()=>other[filter.key]}:null,update:async({filterByTk,values})=>{if(filterByTk===1)payload=values.payload;else other[filterByTk]=values.payload;},create:async({values})=>{if(values.key==='github:1')payload=values.payload;else other[values.key]=values.payload;}};
 const plugin={env:k=>vars[k]||envToken,variable:async(k,v,secret)=>{if(v===null)delete vars[k];else vars[k]=v;plugin.secret=secret;},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const calls=[];const request=async(url,init)=>{calls.push({url,auth:init.headers.Authorization});const path=url.replace('https://api.github.com','');const r=responses(path,init.headers.Authorization);return {status:r.status||200,ok:(r.status||200)<400,headers:{get:()=>null},json:async()=>r.body};};
 return {gh:new GitHubSource(plugin,request),vars,calls,get payload(){return payload;},other,plugin};}
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
test('star backfill needs a token, fills every day before the first real sample, and keeps real samples',async()=>{
 let payload={repo:'o/r',status:'active',daily:{'2026-09-30':{stars:5,forks:1}}};const vars={};
 // Rows by key, as nrSnapshots keeps them: the GitHub state and, since 2026-10-14, its history beside it.
 const other={},repo={findOne:async({filter})=>filter.key==='github:1'?{id:1,get:()=>payload}:other[filter.key]!=null?{id:filter.key,get:()=>other[filter.key]}:null,update:async({filterByTk,values})=>{if(filterByTk===1)payload=values.payload;else other[filterByTk]=values.payload;},create:async({values})=>{other[values.key]=values.payload;}};
 const plugin={env:k=>vars[k]||'',variable:async()=>{},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const pages={1:[{starred_at:'2026-09-25T10:00:00Z'},{starred_at:'2026-09-25T11:00:00Z'},{starred_at:'2026-09-27T01:00:00Z'},{starred_at:'2026-09-30T01:00:00Z'}]};
 const accepts=[];const gh=new GitHubSource(plugin,async(url,init)=>{if(new URL(url).pathname.endsWith('/history'))return {status:404,ok:false,headers:{get:()=>null},json:async()=>({message:'Not Found'})};accepts.push(init.headers.Accept);const page=Number(new URL(url).searchParams.get('page'));return {status:200,ok:true,headers:{get:()=>null},json:async()=>pages[page]||[]};});
 assert.equal(await gh.backfillStars('1'),null);vars[TOKEN('1')]='github_pat_x';
 const h=await gh.backfillStars('1');assert.equal(h.complete,true);assert.equal(h.total,4);assert.equal(accepts[0],'application/vnd.github.star+json');
 assert.deepEqual(Object.keys(payload.daily).sort(),['2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30']);
 assert.equal(payload.daily['2026-09-26'].stars,2);assert.equal(payload.daily['2026-09-29'].stars,3);assert.equal(payload.daily['2026-09-30'].estimated,undefined);assert.equal(payload.daily['2026-09-30'].stars,5);
 const {netChange}=__data_views;assert.equal(netChange(payload.daily,'stars','2026-09-27','2026-09-29'),1);assert.equal(netChange(payload.daily,'forks','2026-09-27','2026-09-29'),null);
});
test('Discussions: read with the token through GraphQL, last 90 days ranked by discussion; off when the repo has none',async()=>{
 const {summarizeDiscussions}=__github_source;const now='2026-10-02T00:00:00Z';
 const repo={hasDiscussionsEnabled:true,discussions:{nodes:[{title:'How to deploy?',url:'u1',createdAt:'2026-09-20T00:00:00Z',upvoteCount:2,isAnswered:false,comments:{totalCount:9},category:{name:'Q&A',isAnswerable:true}},{title:'Show and tell',url:'u2',createdAt:'2026-09-25T00:00:00Z',upvoteCount:0,isAnswered:false,comments:{totalCount:1},category:{name:'Show',isAnswerable:false}},{title:'Old',url:'u3',createdAt:'2026-05-01T00:00:00Z',upvoteCount:9,isAnswered:true,comments:{totalCount:30},category:{name:'Q&A',isAnswerable:true}}]}};
 const s=summarizeDiscussions(repo,now);assert.equal(s.total,2);assert.equal(s.answered,0);assert.deepEqual(s.categories,{'Q&A':1,Show:1});assert.deepEqual(s.top.map(d=>d.title),['How to deploy?','Show and tell']);
 assert.equal(summarizeDiscussions({hasDiscussionsEnabled:false},now).enabled,false);
 const token='github_pat_'+'x'.repeat(30);const h=harness((path,auth)=>{if(path==='/graphql')return {body:{data:{repository:repo}}};if(path==='/repos/org/repo')return {body:{full_name:'org/repo',html_url:'h',stargazers_count:1,forks_count:0}};if(path.startsWith('/search/issues'))return {body:{items:[]}};if(path.includes('/traffic/'))return {body:path.endsWith('views')?{views:[]}:path.endsWith('clones')?{clones:[]}:[]};return {body:[]};},token);
 await h.gh.connect('1','https://github.com/org/repo');assert.equal(h.payload.discussions.total,2);assert.ok(h.calls.some(c=>c.url.endsWith('/graphql')&&c.auth===`Bearer ${token}`));
 const noToken=harness(path=>path==='/repos/org/repo'?{body:{full_name:'org/repo',html_url:'h',stargazers_count:1,forks_count:0}}:{body:path.startsWith('/search')?{items:[]}:[]});await noToken.gh.connect('1','https://github.com/org/repo');assert.equal(noToken.payload.discussions,undefined);assert.ok(!noToken.calls.some(c=>c.url.endsWith('/graphql')));
});

test('history: stars then forks filled before the first real sample; GitHub\'s own words kept; GraphQL when REST refuses; rate limits waited out',async()=>{
 let payload={repo:'o/r',status:'active',daily:{'2026-09-30':{stars:5,forks:3}}};const vars={[TOKEN('1')]:'github_pat_x'};
 // Rows by key, as nrSnapshots keeps them: the GitHub state and, since 2026-10-14, its history beside it.
 const other={},repo={findOne:async({filter})=>filter.key==='github:1'?{id:1,get:()=>payload}:other[filter.key]!=null?{id:filter.key,get:()=>other[filter.key]}:null,update:async({filterByTk,values})=>{if(filterByTk===1)payload=values.payload;else other[filterByTk]=values.payload;},create:async({values})=>{other[values.key]=values.payload;}};
 const plugin={env:k=>vars[k]||'',variable:async()=>{},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 let graphqlWorks=false,limited=1;const asked=[],slept=[];const ok=body=>({status:200,ok:true,headers:{get:()=>null},json:async()=>body});
 const gh=new GitHubSource(plugin,async(url,init)=>{const u=new URL(url);asked.push(u.pathname+u.search);const page=Number(u.searchParams.get('page'));
  if(u.pathname.endsWith('/stargazers/history'))return {status:404,ok:false,headers:{get:()=>null},json:async()=>({message:'Not Found'})};
  if(u.pathname.endsWith('/stargazers')){if(page===1&&limited-->0)return {status:403,ok:false,headers:{get:k=>({'x-ratelimit-remaining':'4321','retry-after':'7'})[k]||null},json:async()=>({message:'You have exceeded a secondary rate limit'})};return ok(page===1?[{starred_at:'2026-09-26T00:00:00Z'},{starred_at:'2026-09-28T00:00:00Z'}]:[]);}
  if(u.pathname.endsWith('/forks'))return {status:403,ok:false,headers:{get:()=>'4000'},json:async()=>({message:'Resource not accessible by personal access token'})};
  if(u.pathname==='/graphql'){if(!graphqlWorks)return ok({errors:[{message:'Resource not accessible by personal access token'}]});const after=JSON.parse(init.body).variables.after;return ok({data:{repository:{forks:after?{pageInfo:{hasNextPage:false},nodes:[{createdAt:'2026-09-27T00:00:00Z'}]}:{pageInfo:{hasNextPage:true,endCursor:'c1'},nodes:[{createdAt:'2026-09-25T00:00:00Z'}]}}}});}
  return ok({});});
 gh.sleep=async ms=>{slept.push(ms);};
 await gh.backfill('1');
 let st=await gh.status('1');assert.deepEqual(slept,[7000],'a secondary rate limit is waited out, then the same page is read again');
 assert.equal(st.history.stars.complete,true);assert.equal(st.history.stars.total,2);assert.equal(st.history.stars.from,'2026-09-26');
 assert.equal(st.history.forks.complete,false);assert.match(st.history.forks.error,/GitHub：Resource not accessible by personal access token/,'GitHub\'s own words');assert.match(st.history.forks.error,/改用 GraphQL 也没读到/);
 assert.ok(asked.some(a=>a.startsWith('/repos/o/r/forks?sort=oldest&per_page=100&page=1')));
 graphqlWorks=true;await gh.restartBackfill('1');await gh.backfillRun;st=await gh.status('1');
 assert.equal(st.history.forks.complete,true,'read through GraphQL when REST refuses');assert.equal(st.history.forks.from,'2026-09-25');assert.equal(st.history.running,false);
 assert.deepEqual([payload.daily['2026-09-25'].forks,payload.daily['2026-09-27'].forks,payload.daily['2026-09-29'].forks],[1,2,2]);assert.equal(payload.daily['2026-09-25'].stars,null);assert.equal(payload.daily['2026-09-28'].stars,2);
 assert.deepEqual(payload.daily['2026-09-30'],{stars:5,forks:3},'real samples untouched');
 const {netChange}=__data_views;assert.equal(netChange(payload.daily,'forks','2026-09-27','2026-09-29'),1);
 delete vars[TOKEN('1')];await assert.rejects(gh.restartBackfill('1'),/请先接入 Traffic 的 token/);
});

test('star history endpoint: daily counts from weekly rows (newest first, 30 a page), no list of who starred; today and empty days skipped',async()=>{
 let payload={repo:'o/r',status:'active',daily:{'2026-09-30':{stars:9,forks:1}}};const vars={[TOKEN('1')]:'github_pat_x'};
 // Rows by key, as nrSnapshots keeps them: the GitHub state and, since 2026-10-14, its history beside it.
 const other={},repo={findOne:async({filter})=>filter.key==='github:1'?{id:1,get:()=>payload}:other[filter.key]!=null?{id:filter.key,get:()=>other[filter.key]}:null,update:async({filterByTk,values})=>{if(filterByTk===1)payload=values.payload;else other[filterByTk]=values.payload;},create:async({values})=>{other[values.key]=values.payload;}};
 const plugin={env:k=>vars[k]||'',variable:async()=>{},db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const sun=d=>Date.parse(d+'T00:00:00Z')/1000,asked=[];
 const pages={1:[{week:sun('2026-09-20'),total:3,days:[0,1,0,2,0,0,0]},...Array.from({length:29},(_,i)=>({week:sun('2026-09-13')-i*7*86400,total:0,days:[0,0,0,0,0,0,0]}))],2:[{week:sun('2026-09-13')-29*7*86400,total:4,days:[4,0,0,0,0,0,0]}]};
 const gh=new GitHubSource(plugin,async url=>{const u=new URL(url);asked.push(u.pathname+u.search);if(u.pathname.endsWith('/stargazers/history'))return {status:200,ok:true,headers:{get:()=>null},json:async()=>pages[Number(u.searchParams.get('page'))]||[]};
  if(u.pathname.endsWith('/forks'))return {status:200,ok:true,headers:{get:()=>null},json:async()=>[]};throw new Error('unexpected '+url);});
 const h=await gh.backfillStars('1');assert.equal(h.complete,true);assert.equal(h.total,7);assert.match(h.note,/每天新增 Star/);
 assert.ok(asked.every(a=>!a.endsWith('/stargazers')&&!a.includes('/stargazers?')),'the restricted list is not asked');assert.deepEqual(asked.filter(a=>a.includes('/history')).map(a=>new URL('https://x'+a).searchParams.get('page')),['1','2']);
 const first=Object.keys(payload.daily).sort()[0];assert.equal(payload.daily[first].stars,4);assert.equal(payload.daily['2026-09-21'].stars,5);assert.equal(payload.daily['2026-09-23'].stars,7);assert.equal(payload.daily['2026-09-30'].stars,9,'real samples kept');
});
