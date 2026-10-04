'use strict';
// 洞察 · 各方面一览 (2026-10-03): a few numbers per area — search, AI search, the site and product, community — from every
// connected source, each pointing to the page with the detail. Read from data already synced or saved: no paid query and
// no model call. A source that is not connected adds nothing; AI search says when it has not been asked yet.
const {projectId,requireAdmin}=require('./policy');
const {DataViews}=require('./data-views');
const DAY=86400000;
const n=v=>Number(v||0).toLocaleString('en-US');
const PLATFORM={chat_gpt:'ChatGPT',google:'Google AI 概览'};
class InsightSummary{
 constructor(p){this.p=p;this.views=new DataViews(p);}
 async safe(fn){try{return await fn();}catch{return null;}}
 async search(id){const items=[];
  const sr=await this.safe(()=>this.views.search(id,{range:'28'}));
  if(sr?.connected&&sr.cutoff){const near=(sr.striking||[]).length;items.push({key:'striking',label:'接近首页的查询',value:n(near),detail:'排名 5–20 位，改进对应页面最有希望进前几名',to:'/seo-opportunities',tone:near?'blue':'grey'});
   if(sr.totals)items.push({key:'ctr',label:'平均点击率',value:`${(sr.totals.ctr*100).toFixed(1)}%`,detail:`近 28 天点击 ${n(sr.totals.clicks)}，曝光 ${n(sr.totals.impressions)}`,to:'/seo-opportunities'});}
  const rt=await this.safe(()=>this.p.rankTracking?.status(id));
  if(rt?.keywords?.length){let up=0,down=0,top10=0;for(const k of rt.keywords){const a=k.previous?.position,b=k.latest?.position;if(b&&b<=10)top10++;if(a&&b){if(b<a)up++;else if(b>a)down++;}else if(!a&&b&&k.previous)up++;else if(a&&!b)down++;}
   items.push({key:'rank',label:'排名跟踪',value:`↑${up} ↓${down}`,detail:`跟踪 ${rt.keywords.length} 个词，${top10} 个在前 10 名，对比上一次检查`,to:'/keywords?tab=tracking',tone:down>up?'red':up?'green':'grey'});}
  const tr=await this.safe(()=>this.p.trends?.status(id));
  if(tr?.connected&&tr.summary?.length&&tr.checkedAt){const me=tr.summary[0];items.push({key:'trends',label:`「${me.term}」Google 关注度`,value:me.change===null?'—':`${me.change>=0?'↑':'↓'}${Math.abs(Math.round(me.change*100))}%`,detail:`近 4 周对比前 4 周（${tr.place}）${tr.summary.length>1?`；${tr.summary.slice(1).map(x=>`${x.term} ${x.recent??'—'}`).join('、')}`:''}`,to:'/trends',tone:me.change===null?'grey':me.change>=0.1?'green':me.change<=-0.1?'red':'grey'});}
  const saved=await this.safe(()=>this.p.db.getRepository('nrKeywordCandidates').count({filter:{projectId:id}}));
  if(saved)items.push({key:'saved',label:'已保存的关键词',value:n(saved),detail:'在“关键词”里对照本站排名、交给 Agent',to:'/keywords'});
  return items;}
 async ai(id){const items=[],s=await this.safe(()=>this.p.aiSearch?.state(id));
  for(const b of s?.brands||[]){const r=b.result||{},me=(r.share||[]).find(x=>x.own),total=(r.share||[]).reduce((t,x)=>t+(x.mentions||0),0),cited=(r.questions||[]).filter(q=>q.ownCited).length;
   items.push({key:`brand-${b.spec.platform}`,label:`${PLATFORM[b.spec.platform]||b.spec.platform} 提到你`,value:r.mentions==null?'—':n(r.mentions),detail:[me&&total?`提及份额 ${Math.round(me.mentions/total*100)}%`:'',r.questions?.length?`${r.questions.length} 个回答里 ${cited} 个引用本站`:'',String(b.at).slice(0,10)].filter(Boolean).join('，'),to:'/ai-search',tone:me&&total&&me.mentions/total<0.3?'amber':'grey'});}
  const asked=s?.answers||[],missing=asked.filter(a=>Object.values(a.models||{}).some(m=>!m.mentioned));
  if(asked.length)items.push({key:'answers',label:'问 AI',value:`${missing.length} / ${asked.length}`,detail:'近 30 天问过的问题里，有模型没提到你的个数',to:'/ai-search?tab=ask',tone:missing.length?'amber':'green'});
  if(!items.length&&this.p.aiSearch?.d4s?.config(id)?.verifiedAt)items.push({key:'none',label:'AI 搜索',value:'—',detail:'还没查过：看看 ChatGPT、Google AI 概览的回答里有没有提到你',to:'/ai-search',tone:'grey'});
  return items;}
 async site(id){const items=[];
  const report=await this.safe(()=>this.p.audit?.report(id));
  if(report?.connected&&report.read){const c=report.counts||{};items.push({key:'audit',label:'审计问题',value:`${n(c.critical)} 个严重`,detail:`另有 ${n(c.warning)} 个警告、${n(c.notice)} 个提示（受影响的页面数）`,to:'/audit',tone:c.critical?'red':c.warning?'amber':'green'});}
  const site=await this.safe(()=>this.p.siteContent?.state(id));
  if(site?.pages?.length){const year=Date.now()-365*DAY,stale=site.pages.filter(p=>p.lastmod&&Date.parse(p.lastmod)<year).length;items.push({key:'stale',label:'超过一年没更新的页面',value:n(stale),detail:`共 ${n(site.pages.length)} 个页面`,to:'/content',tone:stale?'amber':'grey'});}
  const gh=await this.safe(()=>this.p.github?.state(id));
  if(gh?.repo&&gh.status!=='disconnected'){const days=Object.keys(gh.daily||{}).sort(),last=days.at(-1),week=days.filter(d=>d<=new Date(Date.parse(last||0)-7*DAY).toISOString().slice(0,10)).at(-1);
   if(last&&week)items.push({key:'stars',label:'GitHub 近 7 天新增 Star',value:n(gh.daily[last].stars-gh.daily[week].stars),detail:`共 ${n(gh.daily[last].stars)} 个 Star`,to:'/data/github'});}
  return items;}
 async community(id){const items=[],now=Date.now(),since7=new Date(now-7*DAY).toISOString(),since14=new Date(now-14*DAY).toISOString();
  const cm=await this.safe(()=>this.p.community?.state(id));
  if(cm?.origin&&cm.status!=='disconnected'){const recent=Object.values(cm.topics||{}).filter(t=>String(t.createdAt)>=since14),open=recent.filter(t=>!t.replies);items.push({key:'forum',label:'论坛无人回复',value:n(open.length),detail:`近 14 天 ${recent.length} 个新主题`,to:'/data/community',tone:open.length>=3?'amber':'grey'});}
  const hn=await this.safe(()=>this.p.hackernews?.state(id));
  if(hn?.terms?.length&&hn.status!=='disconnected'){const week=Object.values(hn.mentions||{}).filter(m=>m.createdAt>=since7),top=week.filter(m=>m.type==='story').sort((a,b)=>b.points-a.points)[0];items.push({key:'hn',label:'Hacker News 近 7 天提及',value:n(week.length),detail:top?`最热：${top.title}（${top.points} 分）`:'这一周没有帖子提到',to:'/data/hackernews'});}
  const rd=await this.safe(()=>this.p.reddit?.state(id));
  if(rd?.terms?.length&&rd.status!=='disconnected'){const week=Object.values(rd.posts||{}).filter(p=>p.firstSeenAt>=since7&&rd.retainedFrom&&p.firstSeenAt.slice(0,10)>rd.retainedFrom),subs={};for(const p of week)subs[p.subreddit]=(subs[p.subreddit]||0)+1;const top=Object.entries(subs).sort((a,b)=>b[1]-a[1])[0];
   items.push({key:'reddit',label:'Reddit 近 7 天新帖',value:n(week.length),detail:top?`讨论最多：r/${top[0]}`:'每周用 Google 查一次',to:'/data/reddit'});}
  return items;}
 async summary(id){const [search,ai,site,community]=await Promise.all([this.search(id),this.ai(id),this.site(id),this.community(id)]);
  return {areas:[{id:'search',title:'搜索',items:search},{id:'ai',title:'AI 搜索',items:ai},{id:'site',title:'网站与产品',items:site},{id:'community',title:'社区',items:community}].filter(a=>a.items.length)};}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'洞察没有读出来，请稍后重试。');}};
  const actions={summary:wrap(id=>this.summary(id))};
  this.p.app.resourceManager.define({name:'nrInsights',actions});this.p.app.acl.allow('nrInsights',Object.keys(actions),'loggedIn');}
}
module.exports={InsightSummary};
