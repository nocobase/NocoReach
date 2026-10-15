// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { due, record } from './sync-policy.js';
// GitHub data sources (SPEC §11): daily repository samples, Traffic archive (token), Issues and Discussions frequency.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const API='https://api.github.com';
const TOKEN=id=>`NOREACH_GITHUB_TOKEN_${id}`;
const day=d=>new Date(d).toISOString().slice(0,10);
// The next page as GitHub links it in the Link header. Long lists need it: the issues list refuses `page` past 100
// (10,000 items; 2026-10-15 on nocobase/nocobase, GitHub 422) and links on with an `after` cursor. Only the path is
// kept, so the request (and the token) still goes to api.github.com.
const nextPage=link=>{const m=String(link||'').match(/<([^>]+)>\s*;\s*rel="next"/);if(!m)return null;try{const u=new URL(m[1],API);return u.pathname+u.search;}catch{return null;}};
function parseRepo(input){let u;try{u=new URL(String(input||'').trim());}catch{fail(systemMessageText('githubSource.enterGithubRepositoryLinkExample'));}const m=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);if(u.protocol!=='https:'||u.hostname!=='github.com'||!m)fail(systemMessageText('githubSource.enterGithubRepositoryLinkExample'));return `${m[1]}/${m[2]}`;}
// Traffic comes as per-day counts for the last 14 days; archived days are never overwritten by a later, partial window.
function mergeDays(archive,items,today){const out={...(archive||{})};for(const x of items||[]){const d=day(x.timestamp);if(d>=today)continue;if(!out[d]||x.count>=out[d].count)out[d]={count:x.count,uniques:x.uniques};}return out;}
// Stars keep full history (backfill can reach years back); Traffic is kept for good since 2026-10-14 (GitHub keeps only
// 14 days, so the days saved here are the only record of it).
function trimDays(obj,keep=400){return Object.fromEntries(Object.entries(obj||{}).sort(([a],[b])=>a.localeCompare(b)).slice(-keep));}
// Frequent questions: issues (not PRs) from the last 90 days ranked by discussion, plus label counts.
function summarizeIssues(items,now){const since=Date.parse(now)-90*86400000;const issues=(items||[]).filter(i=>!i.pull_request&&Date.parse(i.created_at)>=since);const labels={};for(const i of issues)for(const l of i.labels||[]){const n=typeof l==='string'?l:l.name;if(n)labels[n]=(labels[n]||0)+1;}return {capturedAt:now,total:issues.length,open:issues.filter(i=>i.state==='open').length,labels,top:issues.map(i=>({title:String(i.title||'').slice(0,200),url:i.html_url,state:i.state,comments:i.comments||0,reactions:i.reactions?.total_count||0,createdAt:i.created_at,labels:(i.labels||[]).map(l=>typeof l==='string'?l:l.name).filter(Boolean)})).sort((a,b)=>(b.comments+b.reactions)-(a.comments+a.reactions)).slice(0,20)};}
// Discussions from the last 90 days (GraphQL, so only with the token; fine-grained tokens can read public repositories).
const DISCUSSIONS=`query($owner:String!,$name:String!){repository(owner:$owner,name:$name){hasDiscussionsEnabled discussions(first:100,orderBy:{field:CREATED_AT,direction:DESC}){totalCount nodes{title url createdAt upvoteCount isAnswered comments{totalCount} category{name isAnswerable}}}}}`;
function summarizeDiscussions(repo,now){if(!repo?.hasDiscussionsEnabled)return {capturedAt:now,enabled:false,total:0,answered:0,categories:{},top:[]};const since=Date.parse(now)-90*86400000;
 const list=(repo.discussions?.nodes||[]).filter(d=>Date.parse(d.createdAt)>=since).map(d=>({title:String(d.title||'').slice(0,200),url:d.url,createdAt:d.createdAt,comments:d.comments?.totalCount||0,upvotes:d.upvoteCount||0,answered:Boolean(d.isAnswered),answerable:Boolean(d.category?.isAnswerable),category:d.category?.name||''}));
 const categories={};for(const d of list)if(d.category)categories[d.category]=(categories[d.category]||0)+1;
 return {capturedAt:now,enabled:true,total:list.length,answered:list.filter(d=>d.answered).length,categories,top:[...list].sort((a,b)=>(b.comments+b.upvotes)-(a.comments+a.upvotes)).slice(0,20)};}
// 历史活动 (2026-10-14, after the first NocoReach's GitHub page): every issue and pull request as
// [opened day, closed day, merged day, is PR, external, hours to merge (PR) or close (issue)], commits per day by author,
// and every release. GitHub keeps all of these with their own dates, so they reach back to the repository's first day,
// unlike Traffic. External is an estimate: authors GitHub marks as owner, member or collaborator are the team, as are
// the organization's public members for commits; bots are never external.
const ACTIVITY=id=>`github-activity:${id}`;
// 2 (2026-10-14): issues and pull requests of the last 400 days keep their title, link, comments and author for the
// page's Issues and Pull requests tables; a history of an earlier version is read again in full once.
const ACTIVITY_VERSION=2,DETAIL_DAYS=400;
const currentActivity=(a,repo)=>Boolean(a&&a.repo===repo&&a.complete&&a.version===ACTIVITY_VERSION);
const TEAM=new Set(['OWNER','MEMBER','COLLABORATOR']);
const isBot=login=>/\[bot\]$|-bot$/i.test(String(login||''));
const hoursBetween=(a,b)=>a&&b?Math.max(0,Math.round((Date.parse(b)-Date.parse(a))/360000)/10):null;
// Authors without a GitHub account are kept as a short hash, never their e-mail address.
const anonymous=v=>{let h=5381;for(const ch of String(v||''))h=(h*33+ch.charCodeAt(0))>>>0;return `~${h.toString(36)}`;};
function addIssue(items,team,i,details){if(!i?.number||!i.created_at)return;const pr=i.pull_request?1:0,merged=i.pull_request?.merged_at||null,login=i.user?.login||'',ext=TEAM.has(i.author_association)||isBot(login)?0:1;if(!ext&&login&&!isBot(login))team.add(login);
 items[i.number]=[day(i.created_at),i.closed_at?day(i.closed_at):null,merged?day(merged):null,pr,ext,pr?(merged?hoursBetween(i.created_at,merged):null):(i.closed_at?hoursBetween(i.created_at,i.closed_at):null)];
 if(details)details[i.number]={title:String(i.title||'').slice(0,200),url:i.html_url||null,comments:i.comments||0,author:login.slice(0,60)};}
// Details only for issues and pull requests opened in the last 400 days.
function recentDetails(items,details,today){const from=day(Date.parse(today+'T00:00:00Z')-DETAIL_DAYS*86400000);return Object.fromEntries(Object.entries(details||{}).filter(([n])=>items[n]&&items[n][0]>=from));}
function addCommit(commits,c){const d=String(c?.commit?.author?.date||c?.commit?.committer?.date||'').slice(0,10);if(!d)return;const who=c.author?.login||anonymous(c.commit?.author?.email||c.commit?.author?.name);const o=commits[d]||(commits[d]={});o[who]=(o[who]||0)+1;}
const releaseOf=r=>({tag:String(r.tag_name||'').slice(0,100),name:String(r.name||r.tag_name||'').slice(0,120),date:day(r.published_at||r.created_at),url:r.html_url,prerelease:Boolean(r.prerelease),downloads:(r.assets||[]).reduce((n,a)=>n+(a.download_count||0),0),assets:(r.assets||[]).slice(0,20).map(a=>({name:String(a.name||'').slice(0,160),downloads:a.download_count||0,size:a.size||0}))});
// Per day: issues and pull requests opened, closed and merged (all and external), commits (all and external), the
// authors who committed and the ones committing for the first time, releases published.
function activityDays(a){const days={},at=d=>days[d]||(days[d]={issuesOpened:0,issuesClosed:0,prsOpened:0,prsMerged:0,prsClosed:0,externalPrsOpened:0,externalPrsMerged:0,externalPrsClosed:0,commits:0,externalCommits:0,activeContributors:0,newContributors:0,releases:0});
 for(const [opened,closed,merged,pr,ext] of Object.values(a?.items||{})){if(pr){at(opened).prsOpened++;if(ext)at(opened).externalPrsOpened++;if(closed){at(closed).prsClosed++;if(ext)at(closed).externalPrsClosed++;}if(merged){at(merged).prsMerged++;if(ext)at(merged).externalPrsMerged++;}}else{at(opened).issuesOpened++;if(closed)at(closed).issuesClosed++;}}
 const team=new Set([...(a?.members||[]),...(a?.team||[])]),seen=new Set();
 for(const d of Object.keys(a?.commits||{}).sort()){const o=at(d);for(const [who,n] of Object.entries(a.commits[d])){o.commits+=n;if(isBot(who))continue;if(!team.has(who))o.externalCommits+=n;o.activeContributors++;if(!seen.has(who)){seen.add(who);o.newContributors++;}}}
 for(const r of a?.releases||[])if(r.date)at(r.date).releases++;
 return days;}
// Net change between two sampled days only; never inferred when either end is missing.
function sampleDelta(daily,field,days,today){const dates=Object.keys(daily||{}).sort();const end=dates.filter(d=>d<=today).at(-1);if(!end)return null;const target=day(Date.parse(end)-days*86400000);const start=dates.filter(d=>d<=target).at(-1);if(!start||start!==target)return null;return daily[end][field]-daily[start][field];}
class GitHubSource{
 constructor(plugin,request){this.sleep=ms=>new Promise(ok=>setTimeout(ok,ms));this.p=plugin;this.p.network?.bind(this,['connect', 'setToken', 'sync', 'backfillStars', 'backfillForks', 'backfillActivity', 'refreshActivity', 'backfill', 'restartBackfill'], request ? undefined : 'github');this.request=request||((url,init)=>(this.p.network?this.p.network.fetch('github',url,{...init,signal:AbortSignal.timeout(20000)}):fetch(url,{...init,signal:AbortSignal.timeout(20000)})));}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `github:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn,key=this.key(id)){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key},transaction});const row=await this.repo().findOne({filter:{key},transaction});const state=await fn(row?.get('payload')||null);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key,payload:state},transaction});return state;});}
 async activity(id){return (await this.repo().findOne({filter:{key:ACTIVITY(id)}}))?.get('payload')||null;}
 token(id){return this.p.env?this.p.env(TOKEN(id)):'';}
 async gh(path,token,accept='application/vnd.github+json',withLink=false){const res=await this.request(API+path,{headers:{'Accept':accept,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'NocoReach/0.1',...(token?{Authorization:`Bearer ${token}`}:{})}});if(res.ok){const body=await res.json();return withLink?{body,link:res.headers?.get?.('link')||null}:body;}
  // GitHub's own words go with the error, so 历史数据 can say what really happened.
  let said='';try{said=String((await res.json())?.message||'').slice(0,160);}catch{said='';}const h=k=>res.headers?.get?.(k),why=said?`（GitHub：${said}）`:'';
  if(res.status===404)fail(systemMessageText('githubSource.repositoryNotExistPrivate')+why,404);if(res.status===401)fail(systemMessageText('githubSource.tokenInvalidExpired')+why,401);
  if(res.status===429||(res.status===403&&(h('x-ratelimit-remaining')==='0'||/rate limit/i.test(said)))){const wait=Number(h('retry-after'))||Math.max(1,Number(h('x-ratelimit-reset'))-Math.floor(Date.now()/1000))||60;throw Object.assign(new Error(systemMessageText('githubSource.tooManyGithubRequestsTemporarily')+why),{status:429,retryAfter:wait});}
  if(res.status===403)fail(systemMessageText('githubSource.githubRejectedRequestsToken')+why,403);fail(systemMessageText('messages.githubStatusDetail', { 0: res.status, 1: why }),502);}
 async graphql(query,variables,token){const res=await this.request(API+'/graphql',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'NocoReach/0.1',Authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});if(res.status===401)fail(systemMessageText('githubSource.tokenInvalidExpired'),401);if(!res.ok)fail(systemMessageText('messages.githubStatus', { 0: res.status }),502);const d=await res.json();if(d.errors?.length)fail(String(d.errors[0].message||systemMessageText('githubSource.githubQueryFailed')).slice(0,120),502);return d.data;}
 async preview(url){const name=parseRepo(url);const r=await this.gh(`/repos/${name}`);if(r.private)fail(systemMessageText('githubSource.publicRepositoriesSupportedNow'));return {repo:r.full_name,url:r.html_url,description:String(r.description||'').slice(0,300),stars:r.stargazers_count,forks:r.forks_count};}
 async connect(id,url){const p=await this.preview(url);await this.mutate(id,old=>({...(old&&old.repo===p.repo?old:{daily:{},traffic:{views:{},clones:{},referrers:{},paths:{}}}),repo:p.repo,url:p.url,description:p.description,connectedAt:old?.repo===p.repo?old.connectedAt:new Date().toISOString(),status:'active',revision:(old?.revision||0)+1}));return this.sync(id);}
 async setToken(id,token){this.backfillLater=true;const value=String(token||'').trim();if(!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(value))fail(systemMessageText('githubSource.notLookLikeGithubToken'));const s=await this.state(id);if(!s?.repo)fail(systemMessageText('githubSource.connectRepositoryFirst'),409);await this.gh(`/repos/${s.repo}/traffic/views`,value);await this.p.variable(TOKEN(id),value,true);await this.mutate(id,cur=>({...cur,token:{verifiedAt:new Date().toISOString(),error:null}}));return this.sync(id);}
 async removeToken(id){await this.p.variable(TOKEN(id),null);return this.mutate(id,cur=>cur?{...cur,token:null}:cur);}
 async disconnect(id){await this.p.variable(TOKEN(id),null);return this.mutate(id,cur=>cur?{...cur,status:'disconnected',token:null}:cur);}
 // One sync per day: repository sample, releases, issues; Traffic only with a verified token. Failures keep prior data.
 async sync(id){const s=await this.state(id);if(!s?.repo||s.status==='disconnected')fail(systemMessageText('githubSource.connectRepositoryFirst'),409);const now=new Date(businessNow(this.p,id,'github')).toISOString(),at=new Date().toISOString(),today=day(now),token=this.token(id);const errors=[];let repo,releases,issues,traffic;
  try{repo=await this.gh(`/repos/${s.repo}`,token||undefined);}catch(e){errors.push(systemMessageText('githubSource.repository')+e.message);}
  try{releases=await this.gh(`/repos/${s.repo}/releases?per_page=10`,token||undefined);}catch(e){errors.push('Release：'+e.message);}
  try{const since=day(Date.parse(now)-90*86400000);const r=await this.gh(`/search/issues?q=${encodeURIComponent(`repo:${s.repo} is:issue created:>=${since}`)}&sort=comments&order=desc&per_page=50`,token||undefined);issues={items:r.items||[],total:r.total_count};}catch(e){errors.push('Issues：'+e.message);}
  let discussions;if(token){try{const [owner,name]=s.repo.split('/');discussions=summarizeDiscussions((await this.graphql(DISCUSSIONS,{owner,name},token)).repository,now);}catch(e){errors.push('Discussions：'+e.message);}}
  if(token){try{const [views,clones,referrers,paths]=await Promise.all(['views','clones','popular/referrers','popular/paths'].map(k=>this.gh(`/repos/${s.repo}/traffic/${k}`,token)));traffic={views,clones,referrers,paths};}catch(e){errors.push('Traffic：'+e.message);}}
  // 仓库构成: languages, topics and the top contributors as GitHub has them today.
  let profile;try{const [languages,contributors]=await Promise.all([this.gh(`/repos/${s.repo}/languages`,token||undefined),this.gh(`/repos/${s.repo}/contributors?per_page=30`,token||undefined)]);profile={at,languages:languages&&typeof languages==='object'?languages:{},topics:(repo?.topics||[]).slice(0,30),contributors:(Array.isArray(contributors)?contributors:[]).map(c=>({login:String(c.login||''),contributions:c.contributions||0,url:c.html_url||null}))};}catch(e){errors.push('Languages：'+e.message);}
  let activity=null;if(token){try{activity=await this.refreshActivity(id,s,token);}catch(e){errors.push('History：'+e.message);}}
  return this.mutate(id,cur=>{if(!cur||cur.repo!==s.repo)return cur;const next={...cur,lastSync:record(cur.lastSync,{at,ok:Boolean(repo),errors})};
   if(repo)next.daily=trimDays({...(cur.daily||{}),[today]:{stars:repo.stargazers_count,forks:repo.forks_count,watchers:repo.subscribers_count??null,openIssues:repo.open_issues_count,...(activity?{releaseDownloads:(activity.releases||[]).reduce((n,r)=>n+(r.downloads||0),0)}:{})}},6000);
   if(profile)next.profile=profile;
   if(releases)next.releases=releases.map(r=>({tag:r.tag_name,name:String(r.name||r.tag_name).slice(0,200),publishedAt:r.published_at,url:r.html_url}));
   if(issues)next.issues={...summarizeIssues(issues.items,now),total:issues.total??issues.items.length,open:undefined};
   if(discussions)next.discussions=discussions;
   if(traffic){const t=cur.traffic||{};next.traffic={views:mergeDays(t.views,traffic.views.views,today),clones:mergeDays(t.clones,traffic.clones.clones,today),referrers:{...(t.referrers||{}),[today]:(traffic.referrers||[]).slice(0,10)},paths:{...(t.paths||{}),[today]:(traffic.paths||[]).slice(0,10).map(p=>({path:p.path,title:String(p.title||'').slice(0,200),count:p.count,uniques:p.uniques}))},since:t.since||Object.keys(mergeDays({},traffic.views.views,today)).sort()[0]||today};next.token={...(cur.token||{}),error:null};}
   else if(token&&errors.some(e=>e.startsWith('Traffic')))next.token={...(cur.token||{}),error:errors.find(e=>e.startsWith('Traffic'))};
   return next;});}
 // History GitHub keeps per item: when each star was given and when each fork was made (token required — GitHub has
 // listed stargazers only to signed-in requests since 2026 — 100 per request, at most 400 pages). Days before the first
 // real sample get estimated running totals; withdrawn stars and deleted forks are not listed, so totals can read a
 // little lower than they were.
 async perDay(path,token,accept){const days=new Map();let total=0;
  const r=await this.pages(path,token,400,list=>{for(const x of list){const d=String(x.starred_at||x.created_at||'').slice(0,10);if(d){days.set(d,(days.get(d)||0)+1);total++;}}},accept);
  return {days,total,pages:r.pages,capped:r.capped};}
 // Daily stars from GitHub's star history endpoint (2026-09; Metadata read, which every token has; no list of who
 // starred, so the 2026-06 restriction of the stargazers list to admins and collaborators does not apply). Weeks come
 // newest first, 30 a page, at most 100 pages: week is the Sunday (UTC) it starts, days the seven daily counts.
 async starHistoryApi(repo,token,now=businessNow(this.p)){const days=new Map(),today=day(now);let total=0,page=1;
  for(;page<=100;page++){let list;list=await this.retrying(()=>this.gh(`/repos/${repo}/stargazers/history?per_page=30&page=${page}`,token));
   for(const w of Array.isArray(list)?list:[]){const start=Number(w.week)*1000;if(!Number.isFinite(start))continue;(w.days||[]).forEach((n,i)=>{const d=day(start+i*86400000);if(n>0&&d<=today){days.set(d,(days.get(d)||0)+n);total+=n;}});}
   if(!Array.isArray(list)||list.length<30)break;await this.pause?.(300);}
  return {days,total,pages:page,capped:false,via:'history'};}
 // The same through GraphQL (cursor pages of 100), for tokens the REST list refuses.
 async perDayGraphql(kind,repo,token){const [owner,name]=repo.split('/'),days=new Map();let after=null,total=0,pages=0;
  const q=kind==='stars'?`query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){stargazers(first:100,after:$after,orderBy:{field:STARRED_AT,direction:ASC}){pageInfo{hasNextPage endCursor} edges{starredAt}}}}`:`query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){forks(first:100,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){pageInfo{hasNextPage endCursor} nodes{createdAt}}}}`;
  for(;pages<1000;){const r=(await this.graphql(q,{owner,name,after},token))?.repository?.[kind==='stars'?'stargazers':'forks'];if(!r)fail(systemMessageText('githubSource.graphqlReturnedNoDataRepository'),502);pages++;for(const x of kind==='stars'?(r?.edges||[]):(r?.nodes||[])){const d=String(x.starredAt||x.createdAt||'').slice(0,10);if(d){days.set(d,(days.get(d)||0)+1);total++;}}if(!r?.pageInfo?.hasNextPage)break;after=r.pageInfo.endCursor;await this.pause?.(300);}
  return {days,total,pages,capped:false,via:'graphql'};}
 // REST first; when GitHub refuses the token there (not a rate limit), GraphQL, and both reasons are kept if that fails too.
 async readHistory(kind,s,token){const path=kind==='stars'?`/repos/${s.repo}/stargazers`:`/repos/${s.repo}/forks?sort=oldest`;
  try{return await this.perDay(path,token,kind==='stars'?'application/vnd.github.star+json':undefined);}
  catch(e){if(e.status!==403)throw e;try{return await this.perDayGraphql(kind,s.repo,token);}catch(g){throw Object.assign(new Error(systemMessageText('messages.graphqlNotWorkEither', { 0: e.message, 1: g.message })),{status:403});}}}
 // One page of a long read (hundreds for a large repository): GitHub's rate limit is waited out as GitHub says, and
 // a request that does not complete or a server error is tried four more times, 2 to 30 seconds apart, so one brief
 // network failure does not fail the whole read (2026-10-14: on Studio one did, and the history showed as failed).
 async retrying(read){for(let tries=0;;tries++){try{return await read();}catch(e){if(e?.name==='AbortError')throw e;
   if(e?.status===429){if(tries>=4||e.retryAfter>300)throw e;await this.sleep(e.retryAfter*1000);continue;}
   if((!e?.status||e.status>=500)&&tries<4){await this.sleep([2000,5000,15000,30000][tries]);continue;}throw e;}}}
 // Every page of a list (100 a page, at most `max` pages), each read as `retrying` does. The next page is the one
 // GitHub links (none after the last); the page number only when a response has no Link header.
 async pages(path,token,max,each,accept){const first=`${path}${path.includes('?')?'&':'?'}per_page=100`;let url=`${first}&page=1`;
  for(let page=1;page<=max;page++){const {body:list,link}=await this.retrying(()=>this.gh(url,token,accept,true));
   each(Array.isArray(list)?list:[]);if(!Array.isArray(list)||list.length<100)return {pages:page,capped:false};
   const next=link?nextPage(link):`${first}&page=${page+1}`;if(!next)return {pages:page,capped:false};url=next;await this.pause?.(300);}
  return {pages:max,capped:true};}
 // The organization's public members (the team for commits); a repository owned by a person has just that person.
 async publicMembers(repo,token){const owner=repo.split('/')[0],out=[];try{await this.pages(`/orgs/${owner}/public_members`,token,10,list=>out.push(...list.map(m=>m.login).filter(Boolean)));}catch(e){if(e.status!==404)throw e;out.push(owner);}return out;}
 // 历史活动, read once in full when the token is connected: every issue and pull request (oldest first), every commit and
 // every release. About 300 requests for a repository with 18,000 commits and 12,000 issues and pull requests; a list
 // longer than 600 pages (60,000 items) is cut and said so.
 async backfillActivity(id){const s=await this.state(id),token=this.token(id);if(!s?.repo||!token)return null;const old=await this.activity(id);if(currentActivity(old,s.repo))return old;
  const started=new Date().toISOString(),items={},commits={},team=new Set(),releases=[],details={};
  const issues=await this.pages(`/repos/${s.repo}/issues?state=all&sort=created&direction=asc`,token,600,list=>{for(const i of list)addIssue(items,team,i,details);});
  const log=await this.pages(`/repos/${s.repo}/commits`,token,600,list=>{for(const c of list)addCommit(commits,c);});
  await this.pages(`/repos/${s.repo}/releases`,token,20,list=>releases.push(...list.map(releaseOf)));
  const members=await this.publicMembers(s.repo,token),capped=issues.capped||log.capped;
  const value={repo:s.repo,version:ACTIVITY_VERSION,complete:true,capped,at:started,issuesSince:started,commitsSince:started,membersAt:started,items,details:recentDetails(items,details,day(businessNow(this.p,id,'github'))),commits,team:[...team],members,releases,error:null,failedAt:null};
  return this.mutate(id,()=>value,ACTIVITY(id));}
 // Then once a day: issues and pull requests updated since the last read, commits since then, the newest releases (their
 // download counts change) and, weekly, the public members. Nothing is read again from the start.
 async refreshActivity(id,s,token){const a=await this.activity(id);if(!currentActivity(a,s.repo))return null;const started=new Date().toISOString(),items={...a.items},details={...(a.details||{})},commits=JSON.parse(JSON.stringify(a.commits||{})),team=new Set(a.team||[]),fresh=[];
  await this.pages(`/repos/${s.repo}/issues?state=all&sort=updated&direction=asc&since=${encodeURIComponent(a.issuesSince)}`,token,50,list=>{for(const i of list)addIssue(items,team,i,details);});
  await this.pages(`/repos/${s.repo}/commits?since=${encodeURIComponent(a.commitsSince)}`,token,50,list=>{for(const c of list)addCommit(commits,c);});
  await this.pages(`/repos/${s.repo}/releases`,token,1,list=>fresh.push(...list.map(releaseOf)));
  const members=Date.now()-Date.parse(a.membersAt||0)>7*86400000?await this.publicMembers(s.repo,token):a.members;
  const byTag=new Map((a.releases||[]).map(r=>[r.tag,r]));for(const r of fresh)byTag.set(r.tag,r);
  return this.mutate(id,cur=>cur&&cur.repo===s.repo?{...cur,items,details:recentDetails(items,details,day(businessNow(this.p,id,'github'))),commits,team:[...team],members,membersAt:members===a.members?a.membersAt:started,releases:[...byTag.values()].sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,2000),issuesSince:started,commitsSince:started}:cur,ACTIVITY(id));}
 firstReal(s,now=businessNow(this.p)){return Object.entries(s.daily||{}).filter(([,v])=>!v.estimated).map(([d])=>d).sort()[0]||day(now);}
 running(days,firstReal,field){let cum=0;const est={},dates=[...days.keys()].sort();for(let d=dates[0];d&&d<firstReal;d=day(Date.parse(d)+86400000)){cum+=days.get(d)||0;est[d]=cum;}return {est,from:dates[0]||null};}
 async backfillStars(id){const s=await this.state(id),token=this.token(id);if(!s?.repo||!token)return null;if(s.starHistory?.complete)return s.starHistory;
  let r;try{r=await this.starHistoryApi(s.repo,token,businessNow(this.p,id,'github'));}catch(e){if(e.status===429)throw e;try{r=await this.readHistory('stars',s,token);}catch(old){throw Object.assign(new Error(systemMessageText('messages.readingStarListNotWork', { 0: e.message, 1: old.message })),{status:old.status});}}
  const firstReal=this.firstReal(s,businessNow(this.p,id,'github')),{est,from}=this.running(r.days,firstReal);
  const history={complete:!r.capped,total:r.total,pages:r.pages,from,firstReal,at:new Date().toISOString(),note:r.capped?systemMessageText('githubSource.over40000StarsGithub'):r.via==='history'?systemMessageText('githubSource.estimatedGithubDailyNewStars'):systemMessageText('githubSource.estimatedTimeStarStarsRemoved')};
  // Re-reading stars rebuilds the estimated days, so forks are read again after it.
  await this.mutate(id,cur=>cur&&cur.repo===s.repo?{...cur,daily:{...Object.fromEntries(Object.entries(cur.daily||{}).filter(([,v])=>!v.estimated)),...Object.fromEntries(Object.entries(est).map(([d,n])=>[d,{stars:n,forks:null,estimated:true}]))},starHistory:history,forkHistory:null}:cur);return history;}
 async backfillForks(id){const s=await this.state(id),token=this.token(id);if(!s?.repo||!token)return null;if(s.forkHistory?.complete)return s.forkHistory;
  const r=await this.readHistory('forks',s,token),firstReal=this.firstReal(s,businessNow(this.p,id,'github')),{est,from}=this.running(r.days,firstReal);
  const history={complete:!r.capped,total:r.total,pages:r.pages,from,firstReal,at:new Date().toISOString(),note:r.capped?systemMessageText('githubSource.over40000ForksEarlier'):systemMessageText('githubSource.estimatedForkCreationTimeDeleted')};
  await this.mutate(id,cur=>{if(!cur||cur.repo!==s.repo)return cur;const daily={...(cur.daily||{})};for(const [d,n] of Object.entries(est)){const o=daily[d];if(o&&!o.estimated)continue;daily[d]={stars:o?.stars??null,...(o||{}),forks:n,estimated:true};}return {...cur,daily,forkHistory:history};});return history;}
 // Stars, then forks; a failure is kept with its reason and tried again after six hours (or at once from 重新补全).
 async backfill(id){if(this.backfilling)return;this.backfilling=id;let step='starHistory';try{await this.backfillStars(id);step='forkHistory';await this.backfillForks(id);step='activity';await this.backfillActivity(id);}
  catch(e){const failure={complete:false,failedAt:new Date().toISOString(),error:String(e.message).slice(0,200)};
   // A history read in full before stays shown when reading it again fails (as for the 2026-10-14 re-read that added
   // titles); it is tried again after six hours like a first read.
   if(step==='activity'){const repo=(await this.state(id))?.repo;await this.mutate(id,cur=>(cur?.repo===repo&&(cur.complete||cur.at)?{...cur,complete:true,failedAt:failure.failedAt,error:failure.error}:{...(cur?.repo===repo?cur:{repo}),...failure}),ACTIVITY(id));}
   else await this.mutate(id,cur=>cur?{...cur,[step]:{...(cur[step]||{}),...failure}}:cur);}finally{this.backfilling=null;}}
 async restartBackfill(id){if(!this.token(id))fail(systemMessageText('githubSource.connectTrafficTokenFirstFilling'),409);await this.mutate(id,cur=>cur?{...cur,starHistory:null,forkHistory:null}:cur);await this.mutate(id,()=>null,ACTIVITY(id));this.backfillRun=this.backfill(id).catch(()=>undefined);return this.status(id);}
 history(s,id,a=null){const pick=(h,field)=>h?{complete:Boolean(h.complete),total:h.total??null,from:h.from||Object.entries(s.daily||{}).filter(([,v])=>v.estimated&&v[field]!=null).map(([d])=>d).sort()[0]||null,at:h.at||null,error:h.complete?null:h.error||null,failedAt:h.complete?null:h.failedAt||null,note:h.note||''}:null;
  const activity=a&&a.repo===s.repo?{complete:currentActivity(a,s.repo),capped:Boolean(a.capped),from:Object.values(a.items||{}).map(x=>x[0]).concat(Object.keys(a.commits||{})).sort()[0]||null,at:a.at||null,items:Object.keys(a.items||{}).length,error:currentActivity(a,s.repo)?null:a.error||null,failedAt:currentActivity(a,s.repo)?null:a.failedAt||null}:null;
  return {running:this.backfilling===String(id),stars:pick(s.starHistory,'stars'),forks:pick(s.forkHistory,'forks'),activity};}
 async status(id){const s=await this.state(id);if(!s)return {connected:false};const clock=businessNow(this.p,id,'github'),today=day(clock);return {connected:s.status!=='disconnected',history:this.history(s,id,await this.activity(id)),repo:s.repo,url:s.url,description:s.description,lastSync:s.lastSync||null,discussions:s.discussions?{enabled:s.discussions.enabled,total:s.discussions.total}:null,token:s.token?{verifiedAt:s.token.verifiedAt,error:s.token.error||null,since:s.traffic?.since||null}:null,latest:s.daily?Object.entries(s.daily).sort(([a],[b])=>b.localeCompare(a))[0]?.[1]||null:null,starDelta7:sampleDelta(s.daily,'stars',7,today),views14:Object.entries(s.traffic?.views||{}).filter(([d])=>d>=day(clock-14*86400000)).reduce((n,[,v])=>n+v.count,0),topReferrers:Object.entries(s.traffic?.referrers||{}).sort(([a],[b])=>b.localeCompare(a))[0]?.[1]?.slice(0,5)||[],issues:s.issues?{total:s.issues.total,top:s.issues.top.slice(0,5)}:null,releases:(s.releases||[]).slice(0,3),starHistory:s.starHistory?{complete:s.starHistory.complete,total:s.starHistory.total,note:s.starHistory.note,error:s.starHistory.error||null}:null};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.repo||s.status==='disconnected')continue;const failed=h=>h?.failedAt&&Date.now()-Date.parse(h.failedAt)<6*3600000,a=await this.activity(String(id)),act=a?.repo===s.repo?a:null;if(this.token(String(id))&&(!s.starHistory?.complete||!s.forkHistory?.complete||!currentActivity(act,s.repo))&&!failed(s.starHistory)&&!failed(s.forkHistory)&&!failed(act)){await this.backfill(String(id));continue;}if(!due(s.lastSync))continue;await this.sync(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach source tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('githubSource.readingGithubNotCompleteTry'));}};
  const view=async id=>this.status(id);
  this.p.app.resourceManager.define({name:'nrGitHub',actions:{status:wrap(view),preview:wrap((id,v)=>this.preview(v.url)),connect:wrap(async(id,v)=>{await this.connect(id,v.url);return view(id);}),sync:wrap(async id=>{await this.sync(id);return view(id);}),backfill:wrap(id=>this.restartBackfill(id)),setToken:wrap(async(id,v,ctx)=>{await this.setToken(id,ctx.request.headers['x-noreach-github-token']);return view(id);}),removeToken:wrap(async id=>{await this.removeToken(id);return view(id);}),disconnect:wrap(async id=>{await this.disconnect(id);return view(id);})}});
  this.p.app.acl.allow('nrGitHub',['status','preview','connect','sync','backfill','setToken','removeToken','disconnect'],'loggedIn');}
}
export { GitHubSource, parseRepo, mergeDays, summarizeIssues, summarizeDiscussions, sampleDelta, TOKEN, ACTIVITY, ACTIVITY_VERSION, currentActivity, activityDays, addIssue, addCommit, releaseOf };