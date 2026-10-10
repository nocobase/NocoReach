// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
// X 提及 (SPEC §11 外部讨论, P2; 2026-10-04 user choice: the project's own X API key, $5 a month by default). X's API is
// pay-per-use only (about $0.005 a post returned, $0.005 a counts request), so every read is counted against a monthly
// cap the person sets and reading stops before passing it. Once a day: the daily number of posts naming the product
// (one counts request) and the new posts since the last read (recent search, 7 days back the first time, at most five
// pages a day). Retweets and the project's own account are left out. Authors are not requested (they would be billed
// as user reads); posts link to x.com. Spending is an estimate from these prices — X's console has the real bill.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const API='https://api.x.com/2',TOKEN=id=>`NOREACH_X_TOKEN_${id}`,POST=0.005,COUNTS=0.005,DAY=86400000,PAGES=5,MAX_POSTS=3000;
const iso=t=>new Date(t).toISOString().slice(0,10),month=()=>new Date().toISOString().slice(0,7);
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
function termsOf(input){const list=[...new Set((Array.isArray(input)?input:String(input||'').split(/[,，、\n]/)).map(t=>String(t).trim()).filter(Boolean))];
 if(!list.length)fail('请填写要搜索的产品名');if(list.length>5)fail('最多 5 个词');for(const t of list)if(t.length<2||t.length>40||/["\\]/.test(t))fail(`“${t.slice(0,20)}”不行：每个词 2–40 个字符，不含引号`);return list;}
const handleOf=v=>{const h=str(v,40).replace(/^@/,'').replace(/^https?:\/\/(x|twitter)\.com\//i,'').replace(/\/.*$/,'');if(h&&!/^\w{1,15}$/.test(h))fail('官方账号写成 @NocoBase 这样');return h;};
function query(terms,handle){const q=`(${terms.map(t=>`"${t}"`).join(' OR ')}) -is:retweet${handle?` -from:${handle}`:''}`;if(q.length>512)fail('搜索词太长了，请减少');return q;}
const engagement=m=>(m?.like_count||0)+(m?.retweet_count||0)+(m?.reply_count||0)+(m?.quote_count||0);
class XSource{
 constructor(p,request){this.p=p;this.p.network?.bind(this,['connect', 'check']);this.request=request||((url,init)=>(this.p.network?this.p.network.fetch('x',url,{...init,signal:AbortSignal.timeout(20000)}):fetch(url,{...init,signal:AbortSignal.timeout(20000)})));this.checking=null;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `x:${id}`;}
 token(id){return this.p.env?this.p.env(TOKEN(id)):'';}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||null);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else if(state)await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async x(path,token){let res;try{res=await this.request(API+path,{headers:{Authorization:`Bearer ${token}`,'User-Agent':'NocoReach/0.1'}});}catch{fail('连不上 X 接口，请稍后再试',503);}
  const body=await res.json().catch(()=>({}));if(res.ok)return body;const why=str(body?.detail||body?.title||body?.errors?.[0]?.message||'',200);
  if(res.status===401)fail('X 的 Bearer Token 无效或已撤销，请重新复制',422);if(res.status===429)fail('X 接口请求太频繁，明天会再试',429);
  if(res.status===402||/credit|payment|billing/i.test(why))fail('X 账户的额度用完了，请在 X 开发者后台充值',402);fail(`X 接口拒绝了请求${why?`：${why}`:''}`,res.status===403?403:502);}
 spent(s){return s?.spend?.[month()]||{usd:0,posts:0,requests:0};}
 charge(s,usd,posts=0){const m=month(),cur=this.spent(s);return {...s,spend:{...(s.spend||{}),[m]:{usd:Number((cur.usd+usd).toFixed(4)),posts:cur.posts+posts,requests:cur.requests+1}}};}
 // Saving the token checks it with one counts request ($0.005), which is also the first day of numbers.
 async connect(id,v){const terms=termsOf(v.terms),handle=handleOf(v.handle),cap=Number(v.cap??5);if(!Number.isFinite(cap)||cap<1||cap>200)fail('每月上限填 1–200 美元');
  const fresh=str(v.token,300),token=fresh||this.token(id);if(!token)fail('请粘贴 X 的 Bearer Token');if(fresh&&!/^[A-Za-z0-9%._~+/=-]{40,}$/.test(fresh))fail('这不像 X 的 Bearer Token，请复制完整');
  const q=query(terms,handle),counts=await this.x(`/tweets/counts/recent?query=${encodeURIComponent(q)}&granularity=day`,token);
  if(fresh)await this.p.variable(TOKEN(id),fresh,true);
  await this.mutate(id,old=>{const same=old&&JSON.stringify([old.terms,old.handle])===JSON.stringify([terms,handle]);let s={...(same?old:{posts:{},counts:{},sinceId:null,lastRun:null,retainedFrom:null,spend:old?.spend||{}}),terms,handle,cap,status:'active',connectedAt:same?old.connectedAt:new Date().toISOString(),tokenAt:fresh?new Date().toISOString():old?.tokenAt||null};
   s=this.charge(s,COUNTS);s.counts={...(s.counts||{}),...this.days(counts)};return s;});
  this.start(id);return this.status(id);}
 days(r){return Object.fromEntries((r?.data||[]).filter(d=>d.start&&Date.parse(d.end)<=Date.now()+60000).map(d=>[iso(d.start),Number(d.tweet_count)||0]));}
 start(id){if(this.checking)return;this.checking=this.check(id,{force:true,skipCounts:true}).catch(()=>undefined).finally(()=>{this.checking=null;});}
 async disconnect(id){await this.p.variable(TOKEN(id),null);await this.mutate(id,cur=>cur?{...cur,status:'disconnected',tokenAt:null}:cur);return this.status(id);}
 // Once a day: counts, then new posts page by page while the month's cap allows.
 async check(id,{force=false,skipCounts=false}={}){const s0=await this.state(id),token=this.token(id);if(!s0?.terms?.length||s0.status==='disconnected'||!token)fail('请先接入 X',409);
  if(!force&&s0.lastRun&&Date.now()-Date.parse(s0.lastRun.at)<20*3600000)return {skipped:true};
  const now=new Date().toISOString(),q=query(s0.terms,s0.handle),errors=[];let s={...s0},added=0,capped=false;const posts={};
  const left=()=>s.cap-this.spent(s).usd;
  try{if(!skipCounts){if(left()>=COUNTS){const c=await this.x(`/tweets/counts/recent?query=${encodeURIComponent(q)}&granularity=day`,token);s=this.charge(s,COUNTS);s.counts={...(s.counts||{}),...this.days(c)};}else capped=true;}
   let next='',newest=null;for(let page=0;page<PAGES;page++){const max=Math.min(100,Math.floor(left()/POST));if(max<10){capped=true;break;}
    const params=new URLSearchParams({query:q,max_results:String(max),'tweet.fields':'created_at,public_metrics,lang'});if(s.sinceId)params.set('since_id',s.sinceId);else params.set('start_time',new Date(Date.now()-7*DAY+60000).toISOString());if(next)params.set('next_token',next);
    const r=await this.x(`/tweets/search/recent?${params}`,token),list=r?.data||[];s=this.charge(s,list.length*POST,list.length);newest=newest||r?.meta?.newest_id||null;
    for(const t of list)posts[t.id]={id:t.id,text:str(t.text,600),createdAt:t.created_at||now,lang:t.lang||'',metrics:{likes:t.public_metrics?.like_count||0,reposts:t.public_metrics?.retweet_count||0,replies:t.public_metrics?.reply_count||0,quotes:t.public_metrics?.quote_count||0,views:t.public_metrics?.impression_count??null},url:`https://x.com/i/web/status/${t.id}`};
    next=r?.meta?.next_token||'';if(!next)break;}
   if(newest)s.sinceId=newest;}
  catch(e){errors.push(e.message);}
  await this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s0.terms))return cur;const all={...(cur.posts||{})};for(const [k,p] of Object.entries(posts)){if(!all[k])added++;all[k]={...p,firstSeenAt:all[k]?.firstSeenAt||now};}
   const kept=Object.values(all).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,MAX_POSTS);
   return {...cur,spend:s.spend,counts:Object.fromEntries(Object.entries(s.counts||{}).sort(([a],[b])=>a.localeCompare(b)).slice(-400)),sinceId:s.sinceId||cur.sinceId||null,posts:Object.fromEntries(kept.map(p=>[p.id,p])),retainedFrom:cur.retainedFrom||(errors.length?null:iso(Date.now()-7*DAY)),
    lastRun:{at:now,ok:!errors.length,errors,added,capped}};});
  return {added,capped,errors};}
 async status(id){const s=await this.state(id),tokenSaved=Boolean(this.token(id));if(!s?.terms?.length)return {connected:false,tokenSaved};const sp=this.spent(s);
  return {connected:s.status!=='disconnected',checking:Boolean(this.checking),tokenSaved,terms:s.terms,handle:s.handle||'',cap:s.cap,spend:{...sp,usd:sp.usd},total:Object.keys(s.posts||{}).length,lastRun:s.lastRun||null,nextCheckAt:s.lastRun?new Date(Date.parse(s.lastRun.at)+DAY).toISOString():null};}
 // The X page: daily posts naming the product (from counts), the posts read in the range, the month's spending.
 async view(id,v,windowFor){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')return {connected:false};
  const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to),counts=s.counts||{},days=[];for(let t=Date.parse(w.start);t<=Date.parse(w.end);t+=DAY)days.push(iso(t));
  const sum=(a,b)=>Object.entries(counts).filter(([d])=>d>=a&&d<=b).reduce((n,[,c])=>n+c,0),known=d=>counts[d]!==undefined;
  const list=Object.values(s.posts||{}),inRange=list.filter(p=>p.createdAt.slice(0,10)>=w.start&&p.createdAt.slice(0,10)<=w.end),covered=days.every(known),prevDays=[];for(let t=Date.parse(w.previousStart);t<=Date.parse(w.previousEnd);t+=DAY)prevDays.push(iso(t));
  const prevCovered=prevDays.every(known),cur=sum(w.start,w.end),prev=sum(w.previousStart,w.previousEnd),eng=inRange.reduce((n,p)=>n+engagement({like_count:p.metrics.likes,retweet_count:p.metrics.reposts,reply_count:p.metrics.replies,quote_count:p.metrics.quotes}),0),sp=this.spent(s);
  const score=p=>p.metrics.likes+p.metrics.reposts*2+p.metrics.replies+p.metrics.quotes;
  return {connected:true,terms:s.terms,handle:s.handle||'',window:w,lastRun:s.lastRun||null,spend:{usd:sp.usd,posts:sp.posts,cap:s.cap},
   kpis:[{key:'mentions',label:'提及',value:cur,previous:prevCovered?prev:null,complete:covered,change:covered&&prevCovered&&prev?(cur-prev)/prev:null},{key:'engagement',label:'点赞、转发和回复',value:eng,previous:null,complete:true,change:null},{key:'read',label:'读到的帖子',value:inRange.length,previous:null,complete:true,change:null}],
   series:days.map(d=>({date:d,value:counts[d]??null})),
   notes:[...(covered?[]:['X 只给最近 7 天的数，接入前的日子没有数据']),`本月按 $0.005/条估算已用 $${sp.usd.toFixed(2)}，上限 $${s.cap}；实际账单以 X 开发者后台为准`,...(s.lastRun?.capped?['本月已到上限，暂停读取新帖子，下个月继续']:[]),'不含转发'+(s.handle?`和 @${s.handle} 自己发的帖子`:'')+'；不读作者信息（会按用户另外收费）'],
   top:[...inRange].sort((a,b)=>score(b)-score(a)).slice(0,10),latest:[...inRange].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30)};}
 async tick(){if(this.busy||this.checking)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.terms?.length||s.status==='disconnected'||!this.token(String(id)))continue;await this.check(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach X check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(windowFor){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'X 提及没有读出来，请稍后重试。');}};
  const actions={status:wrap(id=>this.status(id)),connect:wrap((id,v)=>this.connect(id,v)),check:wrap(async id=>{if(this.checking)fail('正在查找，请稍后刷新',409);this.checking=this.check(id,{force:true});try{const r=await this.checking;return {...r,...await this.status(id)};}finally{this.checking=null;}}),disconnect:wrap(id=>this.disconnect(id)),view:wrap((id,v)=>this.view(id,v,windowFor))};
  this.p.app.resourceManager.define({name:'nrX',actions});this.p.app.acl.allow('nrX',Object.keys(actions),'loggedIn');}
}
export { XSource, termsOf, handleOf, query, engagement };