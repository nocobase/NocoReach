// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
// GitHub 热点 (2026-10-14, user request): what developers across GitHub are looking at, beside the project's own
// repository. Read once a day:
// - 关注的话题 (topics the project follows; by default its repository's own topics with the most repositories): each
//   topic's repositories in all, the ones created in the last 7 days, and per week for the last 12 weeks (GitHub's search
//   reaches back by creation date, so the weeks are filled in at once); its ten most-starred repositories.
// - 新晋热门: repositories created in the last 7 days with the most stars, across GitHub and in each topic.
// - 涨星榜: the stars of every repository seen here (topic leaders, new ones, competitors, Trending) recorded each day;
//   today's count against the count N days ago is how many it gained. It grows from the first day NocoReach records.
// - GitHub Trending: github.com/trending for today, this week and this month. GitHub has no API for it, so the page is
//   read once a day and parsed; if GitHub changes the page, this part comes back empty and says so.
// Search allows 30 requests a minute with a token and 10 without, so the requests are spaced out.
const API='https://api.github.com',WEB='https://github.com';
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const KEY=id=>`github-trends:${id}`;
const TOPIC=/^[a-z0-9][a-z0-9-]{0,49}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// A topic as GitHub writes it, with spellings like lowcode and low-code counted once.
const norm=t=>String(t||'').trim().toLowerCase().replace(/\s+/g,'-');
const same=t=>norm(t).replace(/-/g,'');
const repoOf=x=>({repo:x.full_name,url:x.html_url||`${WEB}/${x.full_name}`,description:String(x.description||'').slice(0,300),language:x.language||null,topics:(x.topics||[]).slice(0,12),createdAt:String(x.created_at||'').slice(0,10)||null,stars:x.stargazers_count??null});
// The Monday a date's week starts on.
const weekStart=d=>{const t=new Date(d+'T00:00:00Z'),w=(t.getUTCDay()+6)%7;return add(d,-w);};
const decode=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const int=s=>{const n=Number(String(s||'').replace(/[^\d]/g,''));return Number.isFinite(n)?n:null;};
// One entry of github.com/trending: repository, description, language, stars, forks and the stars gained in the period.
function parseTrending(html){const out=[];for(const m of String(html||'').matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)){const a=m[1];
  const repo=a.match(/<h2[^>]*>[\s\S]*?href="\/([^/"]+\/[^/"?#]+)"/)?.[1];if(!repo)continue;
  out.push({repo,url:`${WEB}/${repo}`,description:decode(a.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1]).slice(0,300),language:decode(a.match(/itemprop="programmingLanguage">([^<]+)</)?.[1])||null,
   stars:int(a.match(new RegExp(`href="/${repo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/stargazers"[\\s\\S]*?</svg>\\s*([\\d,]+)`))?.[1]),forks:int(a.match(new RegExp(`href="/${repo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/forks"[\\s\\S]*?</svg>\\s*([\\d,]+)`))?.[1]),
   gained:int(a.match(/([\d,]+)\s+stars?\s+(?:today|this week|this month)/)?.[1])});}
 return out;}
// Stars gained over `days` days: today's count against the count recorded `days` days before (or the nearest earlier
// record within a day); unknown when either is missing.
function gained(samples,today,days){const now=samples?.[today];if(!Number.isFinite(now))return null;const target=add(today,-days),before=samples[target]??samples[add(target,-1)];return Number.isFinite(before)?now-before:null;}
class GitHubTrends{
 constructor(plugin,request){this.p=plugin;this.sleep=ms=>new Promise(ok=>setTimeout(ok,ms));this.lastSearch=0;this.running=new Set();this.p.network?.bind(this,['refresh','setTopics'],request?undefined:'github');
  this.request=request||((url,init,id)=>(this.p.network?this.p.network.fetch('github',url,{...init,signal:AbortSignal.timeout(20000)},String(id)):fetch(url,{...init,signal:AbortSignal.timeout(20000)})));}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async state(id){return (await this.repo().findOne({filter:{key:KEY(id)}}))?.get('payload')||null;}
 async mutate(id,fn){const key=KEY(id);return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key},transaction});const row=await this.repo().findOne({filter:{key},transaction});const state=await fn(row?.get('payload')||null);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key,payload:state},transaction});return state;});}
 token(id){return this.p.github?.token?.(String(id))||'';}
 headers(token,accept='application/vnd.github+json'){return {Accept:accept,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'NocoReach/0.1',...(token?{Authorization:`Bearer ${token}`}:{})};}
 async json(id,url,token,init={}){const res=await this.request(url,{...init,headers:{...this.headers(token),...(init.headers||{})}},id);if(res.ok)return res.json();let said='';try{said=String((await res.json())?.message||'').slice(0,160);}catch{said='';}
  if(res.status===429||(res.status===403&&/rate limit/i.test(said)))throw Object.assign(new Error(systemMessageText('githubTrends.rateLimited')),{status:429,limited:true});
  fail(systemMessageText('messages.githubStatusDetail',{0:res.status,1:said?`（GitHub：${said}）`:''}),502);}
 // Search, spaced out under GitHub's limit (30 a minute with a token, 10 without).
 async search(id,q,token,{sort='',per=10}={}){const gap=token?2100:6500,wait=this.lastSearch+gap-Date.now();if(wait>0)await this.sleep(wait);this.lastSearch=Date.now();
  return this.json(id,`${API}/search/repositories?q=${encodeURIComponent(q)}${sort?`&sort=${sort}&order=desc`:''}&per_page=${per}`,token);}
 // Today's stars for repositories the searches and Trending did not cover, 100 a GraphQL request (only with a token).
 async starCounts(id,repos,token){const out={};if(!token)return out;for(let i=0;i<repos.length;i+=100){const part=repos.slice(i,i+100).filter(r=>/^[\w.-]+\/[\w.-]+$/.test(r));if(!part.length)continue;
  const query=`query{${part.map((r,k)=>{const [o,n]=r.split('/');return `r${k}:repository(owner:"${o}",name:"${n}"){nameWithOwner stargazerCount}`;}).join(' ')}}`;
  const d=await this.json(id,`${API}/graphql`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});for(const v of Object.values(d?.data||{}))if(v?.nameWithOwner)out[v.nameWithOwner]=v.stargazerCount;}
  return out;}
 async trendingPage(id,since){const res=await this.request(`${WEB}/trending?since=${since}`,{headers:{'User-Agent':'Mozilla/5.0 (compatible; NocoReach/0.1)',Accept:'text/html'}},id);if(!res.ok)fail(systemMessageText('messages.githubStatus',{0:res.status}),502);return parseTrending(await res.text());}
 // The repository's own topics, the six with the most repositories (spellings of one topic counted once).
 async suggest(id,token){const gh=await this.p.github?.state?.(String(id)).catch(()=>null);let topics=gh?.profile?.topics||[];
  if(!topics.length&&gh?.repo)try{topics=(await this.json(id,`${API}/repos/${gh.repo}`,token))?.topics||[];}catch{topics=[];}
  const unique=[];for(const t of topics.map(norm))if(TOPIC.test(t)&&!unique.some(u=>same(u)===same(t)))unique.push(t);
  const sized=[];for(const t of unique.slice(0,20)){try{sized.push([t,(await this.search(id,`topic:${t}`,token,{per:1}))?.total_count||0]);}catch(e){if(e.limited)throw e;}}
  return sized.sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t])=>t);}
 async refresh(id){if(this.running.has(String(id)))return this.state(id);this.running.add(String(id));try{return await this.read(id);}finally{this.running.delete(String(id));}}
 async read(id){const token=this.token(id),today=iso(businessNow(this.p,id,'github')),week7=add(today,-7),errors=[],started=new Date().toISOString();
  const cur=await this.state(id)||{};let topics=cur.topics;if(!topics?.length){try{topics=await this.suggest(id,token);}catch(e){errors.push(e.message);topics=[];}}
  const heat={...(cur.heat||{})},weekly={...(cur.weekly||{})},leaders={},topicNew={},repos={...(cur.repos||{})},seen={};
  const keep=x=>{const r=repoOf(x);repos[r.repo]={...repos[r.repo],...r};if(Number.isFinite(r.stars))seen[r.repo]=r.stars;return r.repo;};
  let limited=false;
  for(const t of topics){if(limited)break;try{
   const all=await this.search(id,`topic:${t}`,token,{sort:'stars',per:10});leaders[t]=(all.items||[]).map(keep);
   const fresh=await this.search(id,`topic:${t} created:>=${week7}`,token,{sort:'stars',per:5});topicNew[t]=(fresh.items||[]).map(keep);
   heat[t]={...(heat[t]||{}),[today]:{total:all.total_count??null,new7:fresh.total_count??null}};
   // The last 12 whole weeks once, then the latest two again each day (a week fills as GitHub indexes new repositories).
   const w={...(weekly[t]||{})},last=add(weekStart(today),-7),weeks=[];for(let i=11;i>=0;i--)weeks.push(add(last,-7*i));
   for(const s of weeks.filter(s=>!(s in w)||s>=add(last,-7))){const r=await this.search(id,`topic:${t} created:${s}..${add(s,6)}`,token,{per:1});w[s]=r.total_count??null;}
   weekly[t]=Object.fromEntries(Object.entries(w).sort(([a],[b])=>a.localeCompare(b)).slice(-26));
  }catch(e){if(e.limited)limited=true;errors.push(`${t}：${e.message}`);}}
  let newHot=cur.newHot?.all||[];if(!limited)try{newHot=((await this.search(id,`created:>=${week7}`,token,{sort:'stars',per:20})).items||[]).map(keep);}catch(e){if(e.limited)limited=true;errors.push(e.message);}
  const trending={};for(const since of ['daily','weekly','monthly']){try{trending[since]=await this.trendingPage(id,since);for(const r of trending[since]){repos[r.repo]={...repos[r.repo],repo:r.repo,url:r.url,description:r.description||repos[r.repo]?.description||'',language:r.language||repos[r.repo]?.language||null,topics:repos[r.repo]?.topics||[]};if(Number.isFinite(r.stars))seen[r.repo]=r.stars;}}catch(e){errors.push(`Trending：${e.message}`);}}
  if(['daily','weekly','monthly'].every(s=>trending[s]&&!trending[s].length))errors.push(systemMessageText('githubTrends.trendingUnreadable'));
  const cw=await this.p.competitors?.state?.(String(id)).catch(()=>null),gh=await this.p.github?.state?.(String(id)).catch(()=>null);
  const rivals=(cw?.list||[]).map(c=>c.repo).filter(Boolean),own=gh?.repo||null;
  const pool=[...new Set([...Object.keys(cur.stars||{}),...rivals,...(own?[own]:[])])].filter(r=>!(r in seen)).slice(0,300);
  try{Object.assign(seen,await this.starCounts(id,pool,token));}catch(e){errors.push(e.message);}
  const stars={};for(const [r,s] of Object.entries(cur.stars||{}))stars[r]={...s};for(const [r,n] of Object.entries(seen))stars[r]={...(stars[r]||{}),[today]:n};
  // 120 days of stars per repository, the 600 repositories seen most recently, 31 days of Trending.
  const recent=Object.entries(stars).map(([r,s])=>[r,Object.keys(s).sort().at(-1)]).sort((a,b)=>b[1].localeCompare(a[1])).slice(0,600).map(([r])=>r);
  const trimmed=Object.fromEntries(recent.map(r=>[r,Object.fromEntries(Object.entries(stars[r]).sort(([a],[b])=>a.localeCompare(b)).slice(-120))]));
  const keptRepos=Object.fromEntries(Object.entries(repos).filter(([r])=>r in trimmed));
  const trendingDays={...(cur.trending||{})};if(Object.keys(trending).length)trendingDays[today]=trending;
  return this.mutate(id,old=>({...(old||{}),topics,topicsAuto:old?.topics?.length?Boolean(old.topicsAuto):!cur.topics?.length,heat:Object.fromEntries(Object.entries(heat).filter(([t])=>topics.includes(t)).map(([t,v])=>[t,Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).slice(-120))])),
   weekly:Object.fromEntries(Object.entries(weekly).filter(([t])=>topics.includes(t))),leaders,topicNew,newHot:{date:today,all:newHot},repos:keptRepos,stars:trimmed,
   trending:Object.fromEntries(Object.entries(trendingDays).sort(([a],[b])=>a.localeCompare(b)).slice(-31)),// A run cut short by the rate limit is not today's: the next tick, three hours on, reads again.
   lastRun:{at:started,day:limited?(cur.lastRun?.day||null):today,ok:!errors.length,errors:errors.slice(0,10),limited,token:Boolean(token)}}));}
 async setTopics(id,v){const list=[];for(const t of (Array.isArray(v.topics)?v.topics:[]).map(norm)){if(!TOPIC.test(t))fail(systemMessageText('githubTrends.invalidTopic',{0:t}));if(!list.some(x=>same(x)===same(t)))list.push(t);}
  if(list.length>12)fail(systemMessageText('githubTrends.tooManyTopics'));await this.mutate(id,old=>({...(old||{}),topics:list,topicsAuto:false}));this.later=this.refresh(id).catch(()=>undefined);return this.view(id);}
 // The page's view: topics with their weeks, gainers for a day, a week and a month, Trending, new repositories.
 async view(id){const s=await this.state(id),today=iso(businessNow(this.p,id,'github')),cw=await this.p.competitors?.state?.(String(id)).catch(()=>null),gh=await this.p.github?.state?.(String(id)).catch(()=>null);
  if(!s)return {ready:false,running:this.running.has(String(id)),token:Boolean(this.token(id)),topics:[]};
  const rivals=new Set((cw?.list||[]).map(c=>c.repo).filter(Boolean)),own=gh?.repo||null,topics=s.topics||[];
  const mark=r=>({...(s.repos?.[r]||{repo:r,url:`${WEB}/${r}`}),repo:r,stars:s.stars?.[r]?.[Object.keys(s.stars[r]).sort().at(-1)]??s.repos?.[r]?.stars??null,rival:rivals.has(r),own:r===own,matched:topics.filter(t=>(s.repos?.[r]?.topics||[]).some(x=>same(x)===same(t)))});
  const day=s.lastRun?.day||today,first=Object.values(s.stars||{}).flatMap(o=>Object.keys(o)).sort()[0]||null;
  const gainers=Object.fromEntries([['day',1],['week',7],['month',30]].map(([k,n])=>[k,Object.keys(s.stars||{}).map(r=>({...mark(r),gained:gained(s.stars[r],day,n)})).filter(x=>x.gained!==null).sort((a,b)=>b.gained-a.gained).slice(0,50)]));
  const latestTrending=Object.keys(s.trending||{}).sort().at(-1);
  return {ready:true,running:this.running.has(String(id)),token:Boolean(this.token(id)),topicsAuto:Boolean(s.topicsAuto),lastRun:s.lastRun||null,recordedSince:first,day,
   topics:topics.map(t=>{const h=s.heat?.[t]||{},latest=h[Object.keys(h).sort().at(-1)]||{},weeks=Object.entries(s.weekly?.[t]||{}).sort(([a],[b])=>a.localeCompare(b)).map(([week,count])=>({week,count})),done=weeks.filter(w=>w.count!=null),lastWeek=done.at(-1)?.count??null,prior=done.slice(-5,-1).map(w=>w.count);
    return {name:t,total:latest.total??null,new7:latest.new7??null,lastWeek,priorAverage:prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:null,weeks,leaders:(s.leaders?.[t]||[]).map(mark),fresh:(s.topicNew?.[t]||[]).map(mark)};}),
   suggestions:(gh?.profile?.topics||[]).map(norm).filter(t=>TOPIC.test(t)&&!topics.some(x=>same(x)===same(t))).slice(0,12),
   gainers,newHot:{date:s.newHot?.date||null,all:(s.newHot?.all||[]).map(mark)},
   trending:latestTrending?{date:latestTrending,...Object.fromEntries(['daily','weekly','monthly'].map(k=>[k,(s.trending[latestTrending][k]||[]).map(x=>({...mark(x.repo),stars:x.stars,forks:x.forks,gained:x.gained,language:x.language,description:x.description}))]))}:null};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id)),gh=await this.p.github?.state?.(String(id)).catch(()=>null);
   if(!s?.topics?.length&&!gh?.repo)continue;if(s?.lastRun?.day===iso(businessNow(this.p,String(id),'github')))continue;
   if(s?.lastRun?.at&&Date.now()-Date.parse(s.lastRun.at)<3*3600000)continue;await this.refresh(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach GitHub trends tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(String(id),v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('githubTrends.notRead'));}};
  const actions={view:wrap(id=>this.view(id)),setTopics:wrap((id,v)=>this.setTopics(id,v)),refresh:wrap(async id=>{const s=await this.state(id);if(!this.running.has(id)&&!(s?.lastRun?.at&&Date.now()-Date.parse(s.lastRun.at)<10*60000))this.later=this.refresh(id).catch(()=>undefined);return {...await this.view(id),running:true};})};
  this.p.app.resourceManager.define({name:'nrGitHubTrends',actions});this.p.app.acl.allow('nrGitHubTrends',Object.keys(actions),'loggedIn');}
}
export { GitHubTrends, parseTrending, gained, weekStart, KEY };
