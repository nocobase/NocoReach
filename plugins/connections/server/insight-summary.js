'use strict';
// 洞察 · 需要留意 (2026-10-03 as 各方面一览): the state of each area — search, AI search, the site and product, community —
// from every connected source, each pointing to the page with the detail. Read from data already synced or saved: no
// paid query and no model call. A source that is not connected adds nothing; AI search says when it has not been asked yet.
// 2026-10-08 (user: two grids of number tiles, unclear which to look at): each item is one sentence — `text` with {0}…
// for the numbers in `values`, which the page bolds — plus where it comes from (`source`) and a short `detail`.
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
  if(sr?.connected&&sr.cutoff){const near=(sr.striking||[]).length;items.push({key:'striking',text:'{0} 个查询接近首页',values:[n(near)],source:'搜索表现',detail:'排名 5–20 位，改进对应页面最有希望进前几名',to:'/seo-opportunities',tone:near?'blue':'grey'});
   if(sr.totals)items.push({key:'ctr',text:'平均点击率 {0}',values:[`${(sr.totals.ctr*100).toFixed(1)}%`],source:'搜索表现',detail:`近 28 天点击 ${n(sr.totals.clicks)}，曝光 ${n(sr.totals.impressions)}`,to:'/seo-opportunities'});}
  const rt=await this.safe(()=>this.p.rankTracking?.status(id));
  if(rt?.keywords?.length){let up=0,down=0,top10=0;for(const k of rt.keywords){const a=k.previous?.position,b=k.latest?.position;if(b&&b<=10)top10++;if(a&&b){if(b<a)up++;else if(b>a)down++;}else if(!a&&b&&k.previous)up++;else if(a&&!b)down++;}
   items.push({key:'rank',text:'本周排名 {0} 个上升、{1} 个下降',values:[n(up),n(down)],source:'排名跟踪',detail:`跟踪 ${rt.keywords.length} 个词，${top10} 个在前 10 名，对比上一次检查`,to:'/keywords?tab=tracking',tone:down>up?'red':up?'green':'grey'});}
  const tr=await this.safe(()=>this.p.trends?.status(id));
  if(tr?.connected&&tr.summary?.length&&tr.checkedAt){const me=tr.summary[0];items.push({key:'trends',text:me.change===null?'Google 关注度还没有对比':'Google 关注度 {0}',values:me.change===null?[]:[`${me.change>=0?'↑':'↓'} ${Math.abs(Math.round(me.change*100))}%`],source:'趋势',detail:`「${me.term}」近 4 周对比前 4 周（${tr.place}）${tr.summary.length>1?`；${tr.summary.slice(1).map(x=>`${x.term} ${x.recent??'—'}`).join('、')}`:''}`,to:'/trends',tone:me.change===null?'grey':me.change>=0.1?'green':me.change<=-0.1?'red':'grey'});}
  const cw=await this.safe(()=>this.p.competitors?.state(id));
  if(cw?.list?.length){const since=new Date(Date.now()-7*86400000).toISOString(),week=(cw.events||[]).filter(e=>e.at>=since),by={};for(const e of week){const c=cw.list.find(x=>x.id===e.competitorId);if(c)by[c.name]=(by[c.name]||0)+1;}
   items.push({key:'competitors',text:'竞品近 7 天 {0} 条动态',values:[n(week.length)],source:'竞品',detail:week.length?Object.entries(by).map(([k,v])=>`${k} ${v} 条`).join('、'):`关注 ${cw.list.map(c=>c.name).join('、')}，每周看一次`,to:'/research/domain',tone:week.length?'blue':'grey'});}
  const saved=await this.safe(()=>this.p.db.getRepository('nrKeywordCandidates').count({filter:{projectId:id}}));
  if(saved)items.push({key:'saved',text:'已保存 {0} 个关键词',values:[n(saved)],source:'关键词',detail:'在“关键词”里对照本站排名、交给 Agent',to:'/keywords'});
  return items;}
 async ai(id){const items=[],s=await this.safe(()=>this.p.aiSearch?.state(id));
  for(const b of s?.brands||[]){const r=b.result||{},me=(r.share||[]).find(x=>x.own),total=(r.share||[]).reduce((t,x)=>t+(x.mentions||0),0),cited=(r.questions||[]).filter(q=>q.ownCited).length;
   const name=PLATFORM[b.spec.platform]||b.spec.platform,sp=/[\w]$/.test(name)?' ':'';
   items.push({key:`brand-${b.spec.platform}`,text:r.mentions==null?`${name}${sp}的提及还没有结果`:`${name}${sp}提到你 {0} 次`,values:r.mentions==null?[]:[n(r.mentions)],source:'AI 搜索',detail:[me&&total?`提及份额 ${Math.round(me.mentions/total*100)}%`:'',r.questions?.length?`${r.questions.length} 个回答里 ${cited} 个引用本站`:'',String(b.at).slice(0,10)].filter(Boolean).join('，'),to:'/ai-search',tone:me&&total&&me.mentions/total<0.3?'amber':'grey'});}
  const asked=s?.answers||[],missing=asked.filter(a=>Object.values(a.models||{}).some(m=>!m.mentioned));
  if(asked.length)items.push({key:'answers',text:'{0} 个问题里 AI 没提到你',values:[n(missing.length)],source:'AI 搜索',detail:`近 30 天共问了 ${asked.length} 个，有模型没提到你就算`,to:'/ai-search?tab=ask',tone:missing.length?'amber':'green'});
  if(!items.length&&this.p.aiSearch?.d4s?.config(id)?.verifiedAt)items.push({key:'none',text:'AI 搜索还没查过',values:[],source:'AI 搜索',detail:'看看 ChatGPT、Google AI 概览的回答里有没有提到你',to:'/ai-search',tone:'grey'});
  return items;}
 async site(id){const items=[];
  const report=await this.safe(()=>this.p.audit?.report(id));
  if(report?.connected&&report.read){const c=report.counts||{};items.push({key:'audit',text:'{0} 个审计严重问题',values:[n(c.critical)],source:'网站审计',detail:`另有 ${n(c.warning)} 个警告、${n(c.notice)} 个提示（受影响的页面数）`,to:'/audit',tone:c.critical?'red':c.warning?'amber':'green'});}
  const site=await this.safe(()=>this.p.siteContent?.state(id));
  if(site?.pages?.length){const year=Date.now()-365*DAY,stale=site.pages.filter(p=>p.lastmod&&Date.parse(p.lastmod)<year).length;items.push({key:'stale',text:'{0} 个页面超过一年没更新',values:[n(stale)],source:'网站内容',detail:`共 ${n(site.pages.length)} 个页面`,to:'/content',tone:stale?'amber':'grey'});}
  return items;}
 // New stars, Hacker News mentions and Reddit posts are on the metric cards at the top of 洞察, so they are not repeated
 // here (2026-10-08): this list is for states worth a look, not volumes.
 async community(id){const items=[],now=Date.now(),since7=new Date(now-7*DAY).toISOString(),since14=new Date(now-14*DAY).toISOString();
  const cm=await this.safe(()=>this.p.community?.state(id));
  if(cm?.origin&&cm.status!=='disconnected'){const recent=Object.values(cm.topics||{}).filter(t=>String(t.createdAt)>=since14),open=recent.filter(t=>!t.replies);items.push({key:'forum',text:'{0} 个论坛主题没人回复',values:[n(open.length)],source:'论坛',detail:`近 14 天 ${recent.length} 个新主题`,to:'/data/community',tone:open.length>=3?'amber':'grey'});}
  const ch=await this.safe(()=>this.p.chat?.state(id));
  for(const k of ['discord','slack'].filter(p=>ch?.[p]?.status==='active')){const week=Object.values(ch.messages||{}).filter(m=>m.platform===k&&m.createdAt>=since7),open=week.filter(m=>m.question&&!m.replies&&now-Date.parse(m.createdAt)>DAY);
   const name=k==='discord'?'Discord':'Slack';
   items.push({key:k,text:`${name} 上 {0} 个提问可能没人回`,values:[n(open.length)],source:name,detail:`近 7 天 ${n(week.length)} 条消息、${n(week.filter(m=>m.question).length)} 个提问`,to:`/data/${k}`,tone:open.length?'amber':'green'});}
  const xs=await this.safe(()=>this.p.xSource?.state(id));
  if(xs?.terms?.length&&xs.status!=='disconnected'){const c=xs.counts||{},days=Object.keys(c).sort().slice(-8,-1),count=days.reduce((t,d)=>t+c[d],0),hot=Object.values(xs.posts||{}).filter(p=>p.createdAt>=since7).sort((a,b)=>b.metrics.likes-a.metrics.likes)[0];
   items.push({key:'x',text:days.length?'X 近 7 天提到你 {0} 次':'X 的提及还没有数据',values:days.length?[n(count)]:[],source:'X',detail:hot?`赞最多：${hot.text.slice(0,40)}（${n(hot.metrics.likes)} 赞）`:'每天查一次，不含转发',to:'/data/x'});}
  return items;}
 async summary(id){const [search,ai,site,community]=await Promise.all([this.search(id),this.ai(id),this.site(id),this.community(id)]);
  return {areas:[{id:'search',title:'搜索与市场',items:search},{id:'ai',title:'AI 搜索',items:ai},{id:'site',title:'网站与产品',items:site},{id:'community',title:'社区',items:community}].filter(a=>a.items.length)};}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'洞察没有读出来，请稍后重试。');}};
  const actions={summary:wrap(id=>this.summary(id))};
  this.p.app.resourceManager.define({name:'nrInsights',actions});this.p.app.acl.allow('nrInsights',Object.keys(actions),'loggedIn');}
}
module.exports={InsightSummary};
