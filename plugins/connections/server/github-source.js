'use strict';
// GitHub data sources (SPEC §11): daily repository samples, Traffic archive (token), Issues and Discussions frequency.
const {projectId,requireAdmin}=require('./policy');
const {due,record}=require('./sync-policy');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const API='https://api.github.com';
const TOKEN=id=>`NOREACH_GITHUB_TOKEN_${id}`;
const day=d=>new Date(d).toISOString().slice(0,10);
function parseRepo(input){let u;try{u=new URL(String(input||'').trim());}catch{fail('请填写 GitHub 仓库链接，例如 https://github.com/org/repo');}const m=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);if(u.protocol!=='https:'||u.hostname!=='github.com'||!m)fail('请填写 GitHub 仓库链接，例如 https://github.com/org/repo');return `${m[1]}/${m[2]}`;}
// Traffic comes as per-day counts for the last 14 days; archived days are never overwritten by a later, partial window.
function mergeDays(archive,items,today){const out={...(archive||{})};for(const x of items||[]){const d=day(x.timestamp);if(d>=today)continue;if(!out[d]||x.count>=out[d].count)out[d]={count:x.count,uniques:x.uniques};}return out;}
// Stars keep full history (backfill can reach years back); traffic keeps about a year.
function trimDays(obj,keep=400){return Object.fromEntries(Object.entries(obj||{}).sort(([a],[b])=>a.localeCompare(b)).slice(-keep));}
// Frequent questions: issues (not PRs) from the last 90 days ranked by discussion, plus label counts.
function summarizeIssues(items,now){const since=Date.parse(now)-90*86400000;const issues=(items||[]).filter(i=>!i.pull_request&&Date.parse(i.created_at)>=since);const labels={};for(const i of issues)for(const l of i.labels||[]){const n=typeof l==='string'?l:l.name;if(n)labels[n]=(labels[n]||0)+1;}return {capturedAt:now,total:issues.length,open:issues.filter(i=>i.state==='open').length,labels,top:issues.map(i=>({title:String(i.title||'').slice(0,200),url:i.html_url,state:i.state,comments:i.comments||0,reactions:i.reactions?.total_count||0,createdAt:i.created_at,labels:(i.labels||[]).map(l=>typeof l==='string'?l:l.name).filter(Boolean)})).sort((a,b)=>(b.comments+b.reactions)-(a.comments+a.reactions)).slice(0,20)};}
// Discussions from the last 90 days (GraphQL, so only with the token; fine-grained tokens can read public repositories).
const DISCUSSIONS=`query($owner:String!,$name:String!){repository(owner:$owner,name:$name){hasDiscussionsEnabled discussions(first:100,orderBy:{field:CREATED_AT,direction:DESC}){totalCount nodes{title url createdAt upvoteCount isAnswered comments{totalCount} category{name isAnswerable}}}}}`;
function summarizeDiscussions(repo,now){if(!repo?.hasDiscussionsEnabled)return {capturedAt:now,enabled:false,total:0,answered:0,categories:{},top:[]};const since=Date.parse(now)-90*86400000;
 const list=(repo.discussions?.nodes||[]).filter(d=>Date.parse(d.createdAt)>=since).map(d=>({title:String(d.title||'').slice(0,200),url:d.url,createdAt:d.createdAt,comments:d.comments?.totalCount||0,upvotes:d.upvoteCount||0,answered:Boolean(d.isAnswered),answerable:Boolean(d.category?.isAnswerable),category:d.category?.name||''}));
 const categories={};for(const d of list)if(d.category)categories[d.category]=(categories[d.category]||0)+1;
 return {capturedAt:now,enabled:true,total:list.length,answered:list.filter(d=>d.answered).length,categories,top:[...list].sort((a,b)=>(b.comments+b.upvotes)-(a.comments+a.upvotes)).slice(0,20)};}
// Net change between two sampled days only; never inferred when either end is missing.
function sampleDelta(daily,field,days,today){const dates=Object.keys(daily||{}).sort();const end=dates.filter(d=>d<=today).at(-1);if(!end)return null;const target=day(Date.parse(end)-days*86400000);const start=dates.filter(d=>d<=target).at(-1);if(!start||start!==target)return null;return daily[end][field]-daily[start][field];}
class GitHubSource{
 constructor(plugin,request){this.sleep=ms=>new Promise(ok=>setTimeout(ok,ms));this.p=plugin;this.request=request||((url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)}));}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `github:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||null);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 token(id){return this.p.env?this.p.env(TOKEN(id)):'';}
 async gh(path,token,accept='application/vnd.github+json'){const res=await this.request(API+path,{headers:{'Accept':accept,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'NocoReach/0.1',...(token?{Authorization:`Bearer ${token}`}:{})}});if(res.ok)return res.json();
  // GitHub's own words go with the error, so 历史数据 can say what really happened.
  let said='';try{said=String((await res.json())?.message||'').slice(0,160);}catch{said='';}const h=k=>res.headers?.get?.(k),why=said?`（GitHub：${said}）`:'';
  if(res.status===404)fail('仓库不存在，或者是私有仓库'+why,404);if(res.status===401)fail('token 无效或已过期'+why,401);
  if(res.status===429||(res.status===403&&(h('x-ratelimit-remaining')==='0'||/rate limit/i.test(said)))){const wait=Number(h('retry-after'))||Math.max(1,Number(h('x-ratelimit-reset'))-Math.floor(Date.now()/1000))||60;throw Object.assign(new Error('GitHub 请求太频繁，暂时被限制'+why),{status:429,retryAfter:wait});}
  if(res.status===403)fail('GitHub 拒绝了这个 token 的请求'+why,403);fail(`GitHub 返回 ${res.status}${why}`,502);}
 async graphql(query,variables,token){const res=await this.request(API+'/graphql',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'NocoReach/0.1',Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});if(res.status===401)fail('token 无效或已过期',401);if(!res.ok)fail(`GitHub 返回 ${res.status}`,502);const d=await res.json();if(d.errors?.length)fail(String(d.errors[0].message||'GitHub 查询失败').slice(0,120),502);return d.data;}
 async preview(url){const name=parseRepo(url);const r=await this.gh(`/repos/${name}`);if(r.private)fail('目前只支持公开仓库');return {repo:r.full_name,url:r.html_url,description:String(r.description||'').slice(0,300),stars:r.stargazers_count,forks:r.forks_count};}
 async connect(id,url){const p=await this.preview(url);await this.mutate(id,old=>({...(old&&old.repo===p.repo?old:{daily:{},traffic:{views:{},clones:{},referrers:{},paths:{}}}),repo:p.repo,url:p.url,description:p.description,connectedAt:old?.repo===p.repo?old.connectedAt:new Date().toISOString(),status:'active',revision:(old?.revision||0)+1}));return this.sync(id);}
 async setToken(id,token){this.backfillLater=true;const value=String(token||'').trim();if(!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(value))fail('这不像 GitHub token，请复制完整的 github_pat_ 开头的 token');const s=await this.state(id);if(!s?.repo)fail('请先接入仓库',409);await this.gh(`/repos/${s.repo}/traffic/views`,value);await this.p.variable(TOKEN(id),value,true);await this.mutate(id,cur=>({...cur,token:{verifiedAt:new Date().toISOString(),error:null}}));return this.sync(id);}
 async removeToken(id){await this.p.variable(TOKEN(id),null);return this.mutate(id,cur=>cur?{...cur,token:null}:cur);}
 async disconnect(id){await this.p.variable(TOKEN(id),null);return this.mutate(id,cur=>cur?{...cur,status:'disconnected',token:null}:cur);}
 // One sync per day: repository sample, releases, issues; Traffic only with a verified token. Failures keep prior data.
 async sync(id){const s=await this.state(id);if(!s?.repo||s.status==='disconnected')fail('请先接入仓库',409);const now=new Date().toISOString(),today=day(now),token=this.token(id);const errors=[];let repo,releases,issues,traffic;
  try{repo=await this.gh(`/repos/${s.repo}`,token||undefined);}catch(e){errors.push('仓库：'+e.message);}
  try{releases=await this.gh(`/repos/${s.repo}/releases?per_page=100`,token||undefined);}catch(e){errors.push('Release：'+e.message);}
  try{const since=day(Date.parse(now)-90*86400000);const r=await this.gh(`/search/issues?q=${encodeURIComponent(`repo:${s.repo} is:issue created:>=${since}`)}&sort=comments&order=desc&per_page=50`,token||undefined);issues={items:r.items||[],total:r.total_count};}catch(e){errors.push('Issues：'+e.message);}
  let discussions;if(token){try{const [owner,name]=s.repo.split('/');discussions=summarizeDiscussions((await this.graphql(DISCUSSIONS,{owner,name},token)).repository,now);}catch(e){errors.push('Discussions：'+e.message);}}
  if(token){try{const [views,clones,referrers,paths]=await Promise.all(['views','clones','popular/referrers','popular/paths'].map(k=>this.gh(`/repos/${s.repo}/traffic/${k}`,token)));traffic={views,clones,referrers,paths};}catch(e){errors.push('Traffic：'+e.message);}}
  return this.mutate(id,cur=>{if(!cur||cur.repo!==s.repo)return cur;const next={...cur,lastSync:record(cur.lastSync,{at:now,ok:Boolean(repo),errors})};
   if(repo)next.daily=trimDays({...(cur.daily||{}),[today]:{stars:repo.stargazers_count,forks:repo.forks_count,watchers:repo.subscribers_count??null,openIssues:repo.open_issues_count}},6000);
   if(releases)next.releases=releases.map(r=>({tag:r.tag_name,name:String(r.name||r.tag_name).slice(0,200),publishedAt:r.published_at,url:r.html_url}));
   if(issues)next.issues={...summarizeIssues(issues.items,now),total:issues.total??issues.items.length,open:undefined};
   if(discussions)next.discussions=discussions;
   if(traffic){const t=cur.traffic||{};next.traffic={views:trimDays(mergeDays(t.views,traffic.views.views,today)),clones:trimDays(mergeDays(t.clones,traffic.clones.clones,today)),referrers:{...(t.referrers||{}),[today]:(traffic.referrers||[]).slice(0,10)},paths:{...(t.paths||{}),[today]:(traffic.paths||[]).slice(0,10).map(p=>({path:p.path,title:String(p.title||'').slice(0,200),count:p.count,uniques:p.uniques}))},since:t.since||Object.keys(mergeDays({},traffic.views.views,today)).sort()[0]||today};next.traffic.referrers=trimDays(next.traffic.referrers,60);next.traffic.paths=trimDays(next.traffic.paths,60);next.token={...(cur.token||{}),error:null};}
   else if(token&&errors.some(e=>e.startsWith('Traffic')))next.token={...(cur.token||{}),error:errors.find(e=>e.startsWith('Traffic'))};
   return next;});}
 // History GitHub keeps per item: when each star was given and when each fork was made (token required — GitHub has
 // listed stargazers only to signed-in requests since 2026 — 100 per request, at most 400 pages). Days before the first
 // real sample get estimated running totals; withdrawn stars and deleted forks are not listed, so totals can read a
 // little lower than they were.
 async perDay(path,token,accept){const days=new Map();let page=1,total=0,capped=false;
  for(;page<=400;page++){let list;for(let tries=0;;tries++){try{list=await this.gh(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`,token,accept);break;}catch(e){if(e.status!==429||tries>=4||e.retryAfter>300)throw e;await this.sleep(e.retryAfter*1000);}}for(const x of list||[]){const d=String(x.starred_at||x.created_at||'').slice(0,10);if(d){days.set(d,(days.get(d)||0)+1);total++;}}if(!list||list.length<100)break;if(page===400)capped=true;await this.pause?.(300);}
  return {days,total,pages:page,capped};}
 // Daily stars from GitHub's star history endpoint (2026-09; Metadata read, which every token has; no list of who
 // starred, so the 2026-06 restriction of the stargazers list to admins and collaborators does not apply). Weeks come
 // newest first, 30 a page, at most 100 pages: week is the Sunday (UTC) it starts, days the seven daily counts.
 async starHistoryApi(repo,token){const days=new Map(),today=day(Date.now());let total=0,page=1;
  for(;page<=100;page++){let list;for(let tries=0;;tries++){try{list=await this.gh(`/repos/${repo}/stargazers/history?per_page=30&page=${page}`,token);break;}catch(e){if(e.status!==429||tries>=4||e.retryAfter>300)throw e;await this.sleep(e.retryAfter*1000);}}
   for(const w of Array.isArray(list)?list:[]){const start=Number(w.week)*1000;if(!Number.isFinite(start))continue;(w.days||[]).forEach((n,i)=>{const d=day(start+i*86400000);if(n>0&&d<=today){days.set(d,(days.get(d)||0)+n);total+=n;}});}
   if(!Array.isArray(list)||list.length<30)break;await this.pause?.(300);}
  return {days,total,pages:page,capped:false,via:'history'};}
 // The same through GraphQL (cursor pages of 100), for tokens the REST list refuses.
 async perDayGraphql(kind,repo,token){const [owner,name]=repo.split('/'),days=new Map();let after=null,total=0,pages=0;
  const q=kind==='stars'?`query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){stargazers(first:100,after:$after,orderBy:{field:STARRED_AT,direction:ASC}){pageInfo{hasNextPage endCursor} edges{starredAt}}}}`:`query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){forks(first:100,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){pageInfo{hasNextPage endCursor} nodes{createdAt}}}}`;
  for(;pages<1000;){const r=(await this.graphql(q,{owner,name,after},token))?.repository?.[kind==='stars'?'stargazers':'forks'];if(!r)fail('GraphQL 没有返回这个仓库的数据',502);pages++;for(const x of kind==='stars'?(r?.edges||[]):(r?.nodes||[])){const d=String(x.starredAt||x.createdAt||'').slice(0,10);if(d){days.set(d,(days.get(d)||0)+1);total++;}}if(!r?.pageInfo?.hasNextPage)break;after=r.pageInfo.endCursor;await this.pause?.(300);}
  return {days,total,pages,capped:false,via:'graphql'};}
 // REST first; when GitHub refuses the token there (not a rate limit), GraphQL, and both reasons are kept if that fails too.
 async readHistory(kind,s,token){const path=kind==='stars'?`/repos/${s.repo}/stargazers`:`/repos/${s.repo}/forks?sort=oldest`;
  try{return await this.perDay(path,token,kind==='stars'?'application/vnd.github.star+json':undefined);}
  catch(e){if(e.status!==403)throw e;try{return await this.perDayGraphql(kind,s.repo,token);}catch(g){throw Object.assign(new Error(`${e.message}；改用 GraphQL 也没读到：${g.message}`),{status:403});}}}
 firstReal(s){return Object.entries(s.daily||{}).filter(([,v])=>!v.estimated).map(([d])=>d).sort()[0]||day(Date.now());}
 running(days,firstReal,field){let cum=0;const est={},dates=[...days.keys()].sort();for(let d=dates[0];d&&d<firstReal;d=day(Date.parse(d)+86400000)){cum+=days.get(d)||0;est[d]=cum;}return {est,from:dates[0]||null};}
 async backfillStars(id){const s=await this.state(id),token=this.token(id);if(!s?.repo||!token)return null;if(s.starHistory?.complete)return s.starHistory;
  let r;try{r=await this.starHistoryApi(s.repo,token);}catch(e){if(e.status===429)throw e;try{r=await this.readHistory('stars',s,token);}catch(old){throw Object.assign(new Error(`${e.message}；按 Star 列表读也没读到：${old.message}`),{status:old.status});}}
  const firstReal=this.firstReal(s),{est,from}=this.running(r.days,firstReal);
  const history={complete:!r.capped,total:r.total,pages:r.pages,from,firstReal,at:new Date().toISOString(),note:r.capped?'Star 超过 4 万，GitHub 只提供前 4 万个的时间，更早的历史不完整':r.via==='history'?'按 GitHub 提供的每天新增 Star 推算，之后取消的 Star 不在其中':'按每个 Star 的时间推算，之后取消的 Star 不在其中'};
  // Re-reading stars rebuilds the estimated days, so forks are read again after it.
  await this.mutate(id,cur=>cur&&cur.repo===s.repo?{...cur,daily:{...Object.fromEntries(Object.entries(cur.daily||{}).filter(([,v])=>!v.estimated)),...Object.fromEntries(Object.entries(est).map(([d,n])=>[d,{stars:n,forks:null,estimated:true}]))},starHistory:history,forkHistory:null}:cur);return history;}
 async backfillForks(id){const s=await this.state(id),token=this.token(id);if(!s?.repo||!token)return null;if(s.forkHistory?.complete)return s.forkHistory;
  const r=await this.readHistory('forks',s,token),firstReal=this.firstReal(s),{est,from}=this.running(r.days,firstReal);
  const history={complete:!r.capped,total:r.total,pages:r.pages,from,firstReal,at:new Date().toISOString(),note:r.capped?'Fork 超过 4 万，更早的历史不完整':'按每个 Fork 的创建时间推算，删掉的 Fork 不在其中'};
  await this.mutate(id,cur=>{if(!cur||cur.repo!==s.repo)return cur;const daily={...(cur.daily||{})};for(const [d,n] of Object.entries(est)){const o=daily[d];if(o&&!o.estimated)continue;daily[d]={stars:o?.stars??null,...(o||{}),forks:n,estimated:true};}return {...cur,daily,forkHistory:history};});return history;}
 // Stars, then forks; a failure is kept with its reason and tried again after six hours (or at once from 重新补全).
 async backfill(id){if(this.backfilling)return;this.backfilling=id;let step='starHistory';try{await this.backfillStars(id);step='forkHistory';await this.backfillForks(id);}
  catch(e){await this.mutate(id,cur=>cur?{...cur,[step]:{...(cur[step]||{}),complete:false,failedAt:new Date().toISOString(),error:String(e.message).slice(0,200)}}:cur);}finally{this.backfilling=null;}}
 async restartBackfill(id){if(!this.token(id))fail('请先接入 Traffic 的 token，补全历史要用它',409);await this.mutate(id,cur=>cur?{...cur,starHistory:null,forkHistory:null}:cur);this.backfillRun=this.backfill(id).catch(()=>undefined);return this.status(id);}
 history(s,id){const pick=(h,field)=>h?{complete:Boolean(h.complete),total:h.total??null,from:h.from||Object.entries(s.daily||{}).filter(([,v])=>v.estimated&&v[field]!=null).map(([d])=>d).sort()[0]||null,at:h.at||null,error:h.complete?null:h.error||null,failedAt:h.complete?null:h.failedAt||null,note:h.note||''}:null;
  return {running:this.backfilling===String(id),stars:pick(s.starHistory,'stars'),forks:pick(s.forkHistory,'forks')};}
 async status(id){const s=await this.state(id);if(!s)return {connected:false};const today=day(Date.now());return {connected:s.status!=='disconnected',history:this.history(s,id),repo:s.repo,url:s.url,description:s.description,lastSync:s.lastSync||null,discussions:s.discussions?{enabled:s.discussions.enabled,total:s.discussions.total}:null,token:s.token?{verifiedAt:s.token.verifiedAt,error:s.token.error||null,since:s.traffic?.since||null}:null,latest:s.daily?Object.entries(s.daily).sort(([a],[b])=>b.localeCompare(a))[0]?.[1]||null:null,starDelta7:sampleDelta(s.daily,'stars',7,today),views14:Object.entries(s.traffic?.views||{}).filter(([d])=>d>=day(Date.now()-14*86400000)).reduce((n,[,v])=>n+v.count,0),topReferrers:Object.entries(s.traffic?.referrers||{}).sort(([a],[b])=>b.localeCompare(a))[0]?.[1]?.slice(0,5)||[],issues:s.issues?{total:s.issues.total,top:s.issues.top.slice(0,5)}:null,releases:(s.releases||[]).slice(0,3),starHistory:s.starHistory?{complete:s.starHistory.complete,total:s.starHistory.total,note:s.starHistory.note,error:s.starHistory.error||null}:null};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.repo||s.status==='disconnected')continue;const failed=h=>h?.failedAt&&Date.now()-Date.parse(h.failedAt)<6*3600000;if(this.token(String(id))&&(!s.starHistory?.complete||!s.forkHistory?.complete)&&!failed(s.starHistory)&&!failed(s.forkHistory)){await this.backfill(String(id));continue;}if(!due(s.lastSync))continue;await this.sync(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach source tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'GitHub 读取未完成，请稍后重试。');}};
  const view=async id=>this.status(id);
  this.p.app.resourceManager.define({name:'nrGitHub',actions:{status:wrap(view),preview:wrap((id,v)=>this.preview(v.url)),connect:wrap(async(id,v)=>{await this.connect(id,v.url);return view(id);}),sync:wrap(async id=>{await this.sync(id);return view(id);}),backfill:wrap(id=>this.restartBackfill(id)),setToken:wrap(async(id,v,ctx)=>{await this.setToken(id,ctx.request.headers['x-noreach-github-token']);return view(id);}),removeToken:wrap(async id=>{await this.removeToken(id);return view(id);}),disconnect:wrap(async id=>{await this.disconnect(id);return view(id);})}});
  this.p.app.acl.allow('nrGitHub',['status','preview','connect','sync','backfill','setToken','removeToken','disconnect'],'loggedIn');}
}
module.exports={GitHubSource,parseRepo,mergeDays,summarizeIssues,summarizeDiscussions,sampleDelta,TOKEN};
