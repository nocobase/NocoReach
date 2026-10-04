'use strict';
// Discord 与 Slack (SPEC §11 用户社区, P2; 2026-10-04 user choice: both). The team makes its own bot (Discord: an
// application with a bot, the Message Content intent turned on, invited with View Channels and Read Message History;
// Slack: an internal app in its own workspace, so the normal rate limits apply, with channels:read, channels:history and
// channels:join) and pastes its token; the token is checked and the channels listed before anything is saved. Once a
// day the chosen channels (up to ten per platform) are read: the last 14 days the first time, then from the last message
// read, the last three days again so reply counts stay current. Message text is kept for 30 days, daily counts longer;
// authors are never kept. A question is a message that asks something; it is "maybe unanswered" when after a day it has
// no replies (Slack threads, Discord replies and threads, forum posts without messages).
const {projectId,requireAdmin}=require('./policy');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,FIRST=14*DAY,AGAIN=3*DAY,KEEP=30*DAY,CHANNELS=10,PAGES=10,MAX_MESSAGES=6000,EPOCH=1420070400000n;
const TOKEN={discord:id=>`NOREACH_DISCORD_TOKEN_${id}`,slack:id=>`NOREACH_SLACK_TOKEN_${id}`};
const NAME={discord:'Discord',slack:'Slack'};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const iso=t=>new Date(t).toISOString();
const snowTime=id=>Number((BigInt(id)>>22n)+EPOCH);
const snowAt=t=>String((BigInt(Math.max(0,Math.floor(t)))-EPOCH)<<22n);
const QUESTION=/[?？]|^(how|what|why|when|where|which|who|can|could|does|do|is|are|should|has|have|any|anyone)\b|怎么|如何|为什么|为何|能否|能不能|可不可以|是否|有没有|请问|求助|吗[。！!]?$/i;
const isQuestion=t=>QUESTION.test(String(t||'').trim());
const DISCORD_INVITE=66560; // View Channels + Read Message History
class ChatSource{
 constructor(p,request){this.p=p;this.request=request||((url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)}));this.wait=ms=>new Promise(ok=>setTimeout(ok,ms));this.syncing=null;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `chat:${id}`;}
 token(id,platform){return this.p.env?this.p.env(TOKEN[platform](id)):'';}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{messages:{},cursor:{},daily:{}});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 // Discord REST: one wait when rate limited, then a plain message.
 async discord(path,token,again=true){let res;try{res=await this.request(`https://discord.com/api/v10${path}`,{headers:{Authorization:`Bot ${token}`,'User-Agent':'NocoReach (https://github.com/estheryo/NocoReach, 0.1)'}});}catch{fail('连不上 Discord，请稍后再试',503);}
  const body=await res.json().catch(()=>({}));if(res.ok)return body;
  if(res.status===429&&again){await this.wait(Math.min(5000,Math.ceil((Number(body.retry_after)||1)*1000)));return this.discord(path,token,false);}
  if(res.status===401)fail('Discord 机器人 token 无效，请在开发者后台 Bot 页重新复制',422);if(res.status===403)fail('机器人没有权限读这个频道：请给它“查看频道”和“读取消息历史”',403);if(res.status===404)fail('找不到这个服务器或频道，可能机器人已被移出',404);
  fail(`Discord 拒绝了请求${body?.message?`：${str(body.message,120)}`:''}`,502);}
 async slack(method,token,params={}){let res;try{res=await this.request(`https://slack.com/api/${method}?${new URLSearchParams(params)}`,{headers:{Authorization:`Bearer ${token}`}});}catch{fail('连不上 Slack，请稍后再试',503);}
  const body=await res.json().catch(()=>({}));if(res.status===429)fail('Slack 请求太频繁，明天会再试',429);if(body.ok)return body;
  const e=String(body.error||'');if(['invalid_auth','not_authed','token_revoked','account_inactive'].includes(e))fail('Slack token 无效，请复制应用的 Bot User OAuth Token（xoxb- 开头）',422);
  if(e==='missing_scope')fail(`Slack 应用缺少权限：${str(body.needed||'',80)}，请在 OAuth & Permissions 里加上后重新安装`,403);if(e==='not_in_channel')fail('机器人不在这个频道里：在频道里输入 /invite @应用名，或给应用加 channels:join 权限',403);
  fail(`Slack 拒绝了请求：${e||res.status}`,502);}
 tokenFor(id,platform,given){const t=str(given,300)||this.token(id,platform);if(!t)fail(`请粘贴 ${NAME[platform]} 的 token`);
  if(platform==='slack'&&!/^xoxb-[A-Za-z0-9-]{20,}$/.test(t))fail('Slack 要用 Bot User OAuth Token（xoxb- 开头）');if(platform==='discord'&&!/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t))fail('这不像 Discord 机器人 token，请在 Bot 页复制完整');return t;}
 // Before saving: whose bot it is, where it is, which channels it can read.
 async inspect(id,v){const platform=v.platform==='slack'?'slack':'discord',token=this.tokenFor(id,platform,v.token);
  if(platform==='discord'){const me=await this.discord('/users/@me',token),guilds=(await this.discord('/users/@me/guilds',token)||[]).map(g=>({id:g.id,name:str(g.name,100)}));const invite=`https://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot&permissions=${DISCORD_INVITE}`;
   const guildId=v.guildId&&guilds.some(g=>g.id===v.guildId)?v.guildId:guilds.length===1?guilds[0].id:'';let channels=[];
   if(guildId)channels=(await this.discord(`/guilds/${guildId}/channels`,token)||[]).filter(c=>[0,5,15].includes(c.type)).sort((a,b)=>(a.position||0)-(b.position||0)).map(c=>({id:c.id,name:str(c.name,100),kind:c.type===15?'forum':'text'}));
   return {platform,bot:str(me.username,80),invite,guilds,guildId,channels};}
  const auth=await this.slack('auth.test',token),list=await this.slack('conversations.list',token,{types:'public_channel',exclude_archived:'true',limit:'200'});
  return {platform,bot:str(auth.user,80),team:str(auth.team,100),channels:(list.channels||[]).map(c=>({id:c.id,name:str(c.name,100),kind:'text',member:Boolean(c.is_member),members:c.num_members||0})).sort((a,b)=>b.members-a.members)};}
 async connect(id,v){const platform=v.platform==='slack'?'slack':'discord',fresh=str(v.token,300),token=this.tokenFor(id,platform,v.token),info=await this.inspect(id,{...v,token});
  const ids=[...new Set(Array.isArray(v.channels)?v.channels.map(String):[])];if(!ids.length)fail('请至少选一个频道');if(ids.length>CHANNELS)fail(`最多选 ${CHANNELS} 个频道`);
  const channels=ids.map(c=>info.channels.find(x=>x.id===c)).filter(Boolean);if(channels.length!==ids.length)fail('有频道读不到了，请重新检查');
  if(platform==='slack')for(const c of channels.filter(c=>!c.member))await this.slack('conversations.join',token,{channel:c.id});
  if(fresh)await this.p.variable(TOKEN[platform](id),fresh,true);
  const conf=platform==='discord'?{guildId:info.guildId,guildName:info.guilds.find(g=>g.id===info.guildId)?.name||'',bot:info.bot}:{team:info.team,bot:info.bot};
  await this.mutate(id,s=>({...s,[platform]:{...conf,channels:channels.map(({id,name,kind})=>({id,name,kind})),status:'active',connectedAt:s[platform]?.connectedAt||iso(Date.now())}}));
  this.start(id,platform);return this.status(id);}
 async disconnect(id,v){const platform=v.platform==='slack'?'slack':'discord';await this.p.variable(TOKEN[platform](id),null);await this.mutate(id,s=>({...s,[platform]:s[platform]?{...s[platform],status:'disconnected'}:undefined}));return this.status(id);}
 start(id,platform){if(this.syncing)return;this.syncing=this.sync(id,{force:true,only:platform}).catch(()=>undefined).finally(()=>{this.syncing=null;});}
 // Reading one Discord text channel from a message id on; replies mark the message they answer.
 async discordChannel(token,c,after){const out=[],replied=new Set();let from=after;
  for(let page=0;page<PAGES;page++){const list=await this.discord(`/channels/${c.id}/messages?limit=100&after=${from}`,token)||[];if(!list.length)break;
   for(const m of list){if(m.message_reference?.message_id)replied.add(m.message_reference.message_id);if(![0,19].includes(m.type)||!str(m.content,1))continue;out.push({id:m.id,text:str(m.content,500),createdAt:iso(snowTime(m.id)),replies:m.thread?.message_count||0});}
   from=list.map(m=>m.id).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1).at(-1);if(list.length<100)break;}
  return out.map(m=>({...m,replies:m.replies+(replied.has(m.id)?1:0)}));}
 // A Discord forum: its posts (threads) of the last 30 days, each a question with its message count.
 async discordForum(token,guildId,c){const active=(await this.discord(`/guilds/${guildId}/threads/active`,token))?.threads||[],archived=(await this.discord(`/channels/${c.id}/threads/archived/public?limit=50`,token))?.threads||[];
  return [...active.filter(t=>t.parent_id===c.id),...archived].filter(t=>Date.now()-snowTime(t.id)<KEEP).map(t=>({id:t.id,text:str(t.name,300),createdAt:iso(snowTime(t.id)),replies:t.message_count||0,forum:true}));}
 async slackChannel(token,c,oldest){const out=[];let cursor='';
  for(let page=0;page<PAGES;page++){const r=await this.slack('conversations.history',token,{channel:c.id,oldest,limit:'200',...(cursor?{cursor}:{})});
   for(const m of r.messages||[]){if(m.subtype&&!['thread_broadcast','file_share'].includes(m.subtype))continue;if(!str(m.text,1))continue;out.push({id:m.ts,text:str(m.text,500),createdAt:iso(Number(m.ts)*1000),replies:m.reply_count||0});}
   cursor=r.response_metadata?.next_cursor||'';if(!cursor||!r.has_more)break;}
  return out;}
 async sync(id,{force=false,only}={}){const s=await this.state(id);const platforms=['discord','slack'].filter(k=>s?.[k]?.status==='active'&&this.token(id,k)&&(!only||only===k));if(!platforms.length)return {read:0,errors:[]};
  const ran=k=>s.lastRuns?.[k]||s.lastRun;if(!force&&platforms.every(k=>ran(k)&&Date.now()-Date.parse(ran(k).at)<20*3600000))return {skipped:true};
  const now=Date.now(),errors=[],found=[],cursor={...(s.cursor||{})},team={},runs={};
  for(const k of platforms){const token=this.token(id,k),conf=s[k],before=errors.length,count=found.length;runs[k]=()=>({at:iso(now),ok:errors.length===before,errors:errors.slice(before,before+5),read:found.length-count});if(k==='slack'){try{team.url=(await this.slack('auth.test',token)).url||'';}catch(e){errors.push(`Slack：${e.message}`);continue;}}
   for(const c of conf.channels){try{let list;const ck=`${k}:${c.id}`;
     if(k==='discord'){list=c.kind==='forum'?await this.discordForum(token,conf.guildId,c):await this.discordChannel(token,c,cursor[ck]?(BigInt(cursor[ck])<BigInt(snowAt(now-AGAIN))?cursor[ck]:snowAt(now-AGAIN)):snowAt(now-FIRST));}
     else list=await this.slackChannel(token,c,cursor[ck]?String(Math.min(Number(cursor[ck]),(now-AGAIN)/1000)):String((now-FIRST)/1000));
     for(const m of list)found.push({...m,platform:k,channelId:c.id,channel:c.name,url:k==='discord'?(m.forum?`https://discord.com/channels/${conf.guildId}/${m.id}`:`https://discord.com/channels/${conf.guildId}/${c.id}/${m.id}`):`${team.url}archives/${c.id}/p${String(m.id).replace('.','')}`});
     const newest=list.filter(m=>!m.forum).map(m=>m.id).sort((a,b)=>k==='discord'?(BigInt(a)<BigInt(b)?-1:1):Number(a)-Number(b)).at(-1);if(newest)cursor[ck]=newest;}
    catch(e){errors.push(`${NAME[k]} #${c.name}：${e.message}`);if(e.status===422)break;}}runs[k]=runs[k]();}
  await this.mutate(id,cur=>{const messages={...(cur.messages||{})};for(const m of found){const key=`${m.platform}:${m.channelId}:${m.id}`;messages[key]={...m,question:isQuestion(m.text),replies:Math.max(m.replies,messages[key]?.replies||0)};}
   const kept=Object.entries(messages).filter(([,m])=>now-Date.parse(m.createdAt)<KEEP).sort(([,a],[,b])=>b.createdAt.localeCompare(a.createdAt)).slice(0,MAX_MESSAGES);
   // Daily counts per platform, recomputed for the days still held; older days keep what was counted.
   const daily={...(cur.daily||{})},recount={};for(const [,m] of kept){const d=m.createdAt.slice(0,10);recount[d]=recount[d]||{};recount[d][m.platform]=(recount[d][m.platform]||0)+1;}
   for(const [d,v] of Object.entries(recount))daily[d]=v;
   return {...cur,messages:Object.fromEntries(kept),cursor,daily:Object.fromEntries(Object.entries(daily).sort(([a],[b])=>a.localeCompare(b)).slice(-400)),retainedFrom:cur.retainedFrom||(found.length||!errors.length?iso(now-FIRST).slice(0,10):null),lastRun:{at:iso(now),ok:!errors.length,errors:errors.slice(0,5),read:found.length},lastRuns:{...(cur.lastRuns||{}),...Object.fromEntries(Object.entries(runs).map(([k,r])=>[k,typeof r==='function'?r():r]))}};});
  return {read:found.length,errors};}
 async status(id){const s=await this.state(id)||{},side=k=>s[k]?{connected:s[k].status==='active',tokenSaved:Boolean(this.token(id,k)),name:k==='discord'?s[k].guildName:s[k].team,bot:s[k].bot,channels:s[k].channels,lastRun:s.lastRuns?.[k]||null}:{connected:false,tokenSaved:Boolean(this.token(id,k))};
  const discord=side('discord'),slack=side('slack');return {connected:discord.connected||slack.connected,syncing:Boolean(this.syncing),discord,slack,lastRun:s.lastRun||null,total:Object.keys(s.messages||{}).length,nextSyncAt:s.lastRun?iso(Date.parse(s.lastRun.at)+DAY):null};}
 // The Discord page or the Slack page (2026-10-04 split): messages and questions in the range, per channel, the questions maybe unanswered.
 async view(id,v,windowFor){const platform=v.platform==='slack'?'slack':'discord',st=await this.status(id);if(!st[platform].connected)return {connected:false,platform};const s=await this.state(id);
  const w=windowFor(iso(Date.now()-DAY).slice(0,10),String(v.range||'28'),v.from,v.to),day=m=>m.createdAt.slice(0,10),active=[platform];
  const all=Object.values(s.messages||{}).filter(m=>active.includes(m.platform)),cur=all.filter(m=>day(m)>=w.start&&day(m)<=w.end);
  const sum=(a,b)=>Object.entries(s.daily||{}).filter(([d])=>d>=a&&d<=b).reduce((n,[,x])=>n+active.reduce((t,k)=>t+(x[k]||0),0),0);
  const covered=Boolean(s.retainedFrom)&&s.retainedFrom<=w.start,prevCovered=Boolean(s.retainedFrom)&&s.retainedFrom<=w.previousStart,n=sum(w.start,w.end),prev=sum(w.previousStart,w.previousEnd);
  const questions=cur.filter(m=>m.question),open=questions.filter(m=>!m.replies&&Date.now()-Date.parse(m.createdAt)>DAY);
  const by=new Map();for(const m of cur){const k=`${m.platform}:${m.channelId}`,o=by.get(k)||{platform:m.platform,channel:m.channel,messages:0,questions:0,open:0};o.messages++;if(m.question)o.questions++;if(m.question&&!m.replies&&Date.now()-Date.parse(m.createdAt)>DAY)o.open++;by.set(k,o);}
  const days=[];for(let t=Date.parse(w.start);t<=Date.parse(w.end);t+=DAY){const d=iso(t).slice(0,10),x=(s.daily||{})[d];days.push({date:d,value:s.retainedFrom&&d>=s.retainedFrom?active.reduce((a,k)=>a+((x||{})[k]||0),0):null});}
  const pick=m=>({platform:m.platform,channel:m.channel,text:m.text,createdAt:m.createdAt,replies:m.replies,url:m.url});
  return {connected:true,platform,side:st[platform],window:w,lastRun:st[platform].lastRun||st.lastRun,retainedFrom:s.retainedFrom||null,
   kpis:[{key:'messages',label:'消息',value:n,previous:prevCovered?prev:null,complete:covered,change:covered&&prevCovered&&prev?(n-prev)/prev:null},{key:'questions',label:'提问',value:questions.length,previous:null,complete:covered,change:null},{key:'open',label:'可能没人回',value:open.length,previous:null,complete:covered,change:null},{key:'channels',label:'有消息的频道',value:by.size,previous:null,complete:true,change:null}],
   series:days,channels:[...by.values()].sort((a,b)=>b.messages-a.messages),
   open:open.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,40).map(pick),busiest:[...cur].filter(m=>m.replies>0).sort((a,b)=>b.replies-a.replies).slice(0,15).map(pick),
   notes:[...(s.retainedFrom?(covered?[]:[`从 ${s.retainedFrom} 开始记录，所选时间的前段没有数据`]):['正在第一次读取']),'“提问”按问号和疑问词判断；超过一天没有回复、子区或帖子回复的算“可能没人回”','消息内容保存 30 天，不保存作者']};}
 async tick(){if(this.busy||this.syncing)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{await this.sync(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach chat sync failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(windowFor){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'Discord、Slack 没有读出来，请稍后重试。');}};
  const actions={status:wrap(id=>this.status(id)),inspect:wrap((id,v)=>this.inspect(id,v)),connect:wrap((id,v)=>this.connect(id,v)),disconnect:wrap((id,v)=>this.disconnect(id,v)),view:wrap((id,v)=>this.view(id,v,windowFor)),
   sync:wrap(async(id,v)=>{if(this.syncing)fail('正在读取，请稍后刷新',409);this.syncing=this.sync(id,{force:true,only:v.platform==='slack'||v.platform==='discord'?v.platform:undefined});try{const r=await this.syncing;return {...r,...await this.status(id)};}finally{this.syncing=null;}})};
  this.p.app.resourceManager.define({name:'nrChat',actions});this.p.app.acl.allow('nrChat',Object.keys(actions),'loggedIn');}
}
module.exports={ChatSource,isQuestion,snowTime,snowAt};
