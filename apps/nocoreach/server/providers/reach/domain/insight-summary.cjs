'use strict';
// 洞察 · 需要留意 (2026-10-03 as 各方面一览): the state of each area — search, AI search, the site and product, community —
// from every connected source, each pointing to the page with the detail. Read from data already synced or saved: no
// paid query and no model call. A source that is not connected adds nothing; AI search says when it has not been asked yet.
// 2026-10-08 (user: two grids of number tiles, unclear which to look at): each item is one sentence — `text` with {0}…
// for the numbers in `values`, which the page bolds — plus where it comes from (`source`) and a short `detail`.
// 2026-10-08 (user: the line points to a whole page, where its own data is hard to find): each item also carries what is
// behind it — `rows` (up to 10, with `total`) or `compare` (this period against the one before) — shown when the line is
// clicked, and for the ones there is something to do about, `handOff` (the 做法 and a task title with {0} for the ticked
// rows), so they can be ticked and handed to the Agent from there.
const {projectId,requireAccess}=require('./policy.cjs');
const {DataViews}=require('./data-views.cjs');
const DAY=86400000;
const n=v=>Number(v||0).toLocaleString('en-US');
const PLATFORM={chat_gpt:'ChatGPT',google:'Google AI 概览'},MODEL={chat_gpt:'ChatGPT',claude:'Claude',gemini:'Gemini',perplexity:'Perplexity'};
const ROWS=10,day=v=>String(v||'').slice(0,10);
const rows=(list,map)=>({rows:list.slice(0,ROWS).map(map),total:list.length});
class InsightSummary{
 constructor(p){this.p=p;this.views=new DataViews(p);}
 async safe(fn){try{return await fn();}catch{return null;}}
 async search(id){const items=[];
  const sr=await this.safe(()=>this.views.search(id,{range:'28'}));
  if(sr?.connected&&sr.cutoff){const near=(sr.striking||[]).length;items.push({key:'striking',text:'{0} 个查询接近首页',values:[n(near)],source:'搜索表现',detail:'排名 5–20 位，改进对应页面最有希望进前几名',to:'/seo-opportunities',tone:near?'blue':'grey',...rows(sr.striking||[],r=>({key:r.query,title:r.query,meta:`排名 ${Number(r.position).toFixed(1)} · 曝光 ${n(r.impressions)} · 点击 ${n(r.clicks)}`,url:r.page})),handOff:{playbookId:'optimize-page',title:'把这些查询推进前几名：{0}'}});
   if(sr.totals){const pct=t=>t?`${(t.ctr*100).toFixed(1)}%`:'—',p=sr.previous;items.push({key:'ctr',text:'平均点击率 {0}',values:[pct(sr.totals)],source:'搜索表现',detail:`近 28 天点击 ${n(sr.totals.clicks)}，曝光 ${n(sr.totals.impressions)}`,to:'/seo-opportunities',
    compare:[{label:'点击率',now:pct(sr.totals),before:p?pct(p):'—'},{label:'点击',now:n(sr.totals.clicks),before:p?n(p.clicks):'—'},{label:'曝光',now:n(sr.totals.impressions),before:p?n(p.impressions):'—'},{label:'平均排名',now:sr.totals.position?Number(sr.totals.position).toFixed(1):'—',before:p?.position?Number(p.position).toFixed(1):'—'}]});}}
  const rt=await this.safe(()=>this.p.rankTracking?.status(id));
  if(rt?.keywords?.length){let up=0,down=0,top10=0;for(const k of rt.keywords){const a=k.previous?.position,b=k.latest?.position;if(b&&b<=10)top10++;if(a&&b){if(b<a)up++;else if(b>a)down++;}else if(!a&&b&&k.previous)up++;else if(a&&!b)down++;}
   const moved=rt.keywords.map(k=>({k,a:k.previous?.position||null,b:k.latest?.position||null})).filter(x=>x.a!==x.b&&(x.a||x.b)).sort((x,y)=>Math.abs((y.a||101)-(y.b||101))-Math.abs((x.a||101)-(x.b||101)));
   items.push({key:'rank',...rows(moved,x=>({key:x.k.keyword,title:x.k.keyword,meta:`第 ${x.a||'100+'} 位 → 第 ${x.b||'100+'} 位`,tag:{tone:(x.b||101)<(x.a||101)?'green':'red',text:(x.b||101)<(x.a||101)?'上升':'下降'},url:x.k.latest?.url||x.k.previous?.url||null})),handOff:{playbookId:'optimize-page',title:'提升这些关键词的排名：{0}'},text:'本周排名 {0} 个上升、{1} 个下降',values:[n(up),n(down)],source:'排名跟踪',detail:`跟踪 ${rt.keywords.length} 个词，${top10} 个在前 10 名，对比上一次检查`,to:'/keywords?tab=tracking',tone:down>up?'red':up?'green':'grey'});}
  const tr=await this.safe(()=>this.p.trends?.status(id));
  if(tr?.connected&&tr.summary?.length&&tr.checkedAt){const me=tr.summary[0];items.push({key:'trends',text:me.change===null?'Google 关注度还没有对比':'Google 关注度 {0}',values:me.change===null?[]:[`${me.change>=0?'↑':'↓'} ${Math.abs(Math.round(me.change*100))}%`],source:'趋势',detail:`「${me.term}」近 4 周对比前 4 周（${tr.place}）${tr.summary.length>1?`；${tr.summary.slice(1).map(x=>`${x.term} ${x.recent??'—'}`).join('、')}`:''}`,to:'/trends',tone:me.change===null?'grey':me.change>=0.1?'green':me.change<=-0.1?'red':'grey',compare:tr.summary.map(x=>({label:x.term,now:x.recent??'—',before:x.previous??'—'}))});}
  const cw=await this.safe(()=>this.p.competitors?.state(id));
  if(cw?.list?.length){const since=new Date(Date.now()-7*86400000).toISOString(),week=(cw.events||[]).filter(e=>e.at>=since),by={};for(const e of week){const c=cw.list.find(x=>x.id===e.competitorId);if(c)by[c.name]=(by[c.name]||0)+1;}
   const TYPE={page:'新页面',release:'新版本'};
   items.push({key:'competitors',...rows(week,e=>({key:e.id||e.url,title:e.title,meta:`${cw.list.find(c=>c.id===e.competitorId)?.name||''} · ${TYPE[e.type]||e.type} · ${day(e.at)}`,url:e.url})),handOff:{playbookId:'competitor-compare',title:'对比竞品的新动态：{0}'},text:'竞品近 7 天 {0} 条动态',values:[n(week.length)],source:'竞品',detail:week.length?Object.entries(by).map(([k,v])=>`${k} ${v} 条`).join('、'):`关注 ${cw.list.map(c=>c.name).join('、')}，每周看一次`,to:'/research/domain',tone:week.length?'blue':'grey'});}
  const saved=await this.safe(()=>this.p.store.repository('nrKeywordCandidates').count({filter:{projectId:id}}));
  if(saved)items.push({key:'saved',text:'已保存 {0} 个关键词',values:[n(saved)],source:'关键词',detail:'在“关键词”里对照本站排名、交给 Agent',to:'/keywords'});
  return items;}
 async ai(id){const items=[],s=await this.safe(()=>this.p.aiSearch?.state(id));
  for(const b of s?.brands||[]){const r=b.result||{},me=(r.share||[]).find(x=>x.own),total=(r.share||[]).reduce((t,x)=>t+(x.mentions||0),0),cited=(r.questions||[]).filter(q=>q.ownCited).length;
   const name=PLATFORM[b.spec.platform]||b.spec.platform,sp=/[\w]$/.test(name)?' ':'';
   const share=(r.share||[]).filter(x=>x.mentions!==null).sort((x,y)=>y.mentions-x.mentions);
   items.push({...rows(share,x=>({key:x.key,title:x.key,meta:`${n(x.mentions)} 次${total?` · 份额 ${Math.round(x.mentions/total*100)}%`:''}`,tag:x.own?{tone:'blue',text:'你'}:undefined})),key:`brand-${b.spec.platform}`,text:r.mentions==null?`${name}${sp}的提及还没有结果`:`${name}${sp}提到你 {0} 次`,values:r.mentions==null?[]:[n(r.mentions)],source:'AI 搜索',detail:[me&&total?`提及份额 ${Math.round(me.mentions/total*100)}%`:'',r.questions?.length?`${r.questions.length} 个回答里 ${cited} 个引用本站`:'',String(b.at).slice(0,10)].filter(Boolean).join('，'),to:'/ai-search',tone:me&&total&&me.mentions/total<0.3?'amber':'grey'});}
  const asked=s?.answers||[],missing=asked.filter(a=>Object.values(a.models||{}).some(m=>!m.mentioned));
  if(asked.length)items.push({...rows(missing,a=>{const models=Object.entries(a.models||{}),no=models.filter(([,m])=>!m.mentioned).map(([k])=>MODEL[k]||k),cited=[...new Set(models.flatMap(([,m])=>(m.citations||[]).filter(c=>!c.own).map(c=>c.domain)))].slice(0,3);return {key:a.question,title:a.question,meta:`没提到：${no.join('、')}${cited.length?` · 引用了 ${cited.join('、')}`:''}`};}),handOff:{playbookId:'content-outline',title:'让 AI 回答这些问题时提到我们：{0}'},key:'answers',text:'{0} 个问题里 AI 没提到你',values:[n(missing.length)],source:'AI 搜索',detail:`近 30 天共问了 ${asked.length} 个，有模型没提到你就算`,to:'/ai-search?tab=ask',tone:missing.length?'amber':'green'});
  if(!items.length&&this.p.aiSearch?.d4s?.config(id)?.verifiedAt)items.push({key:'none',text:'AI 搜索还没查过',values:[],source:'AI 搜索',detail:'看看 ChatGPT、Google AI 概览的回答里有没有提到你',to:'/ai-search',tone:'grey'});
  return items;}
 async site(id){const items=[];
  const report=await this.safe(()=>this.p.audit?.report(id));
  if(report?.connected&&report.read){const c=report.counts||{},critical=(report.issues||[]).filter(i=>i.severity==='critical');items.push({...rows(critical,i=>({key:i.type,title:i.title,meta:`${n(i.count)} 页 · 例如 ${(i.pages||[]).slice(0,2).map(x=>x.url).join('；')}`,tag:{tone:'red',text:'严重'},url:i.pages?.[0]?.url||null})),handOff:{playbookId:'tech-fix',title:'修复网站审计的严重问题：{0}'},key:'audit',text:'{0} 个审计严重问题',values:[n(c.critical)],source:'网站审计',detail:`另有 ${n(c.warning)} 个警告、${n(c.notice)} 个提示（受影响的页面数）`,to:'/audit',tone:c.critical?'red':c.warning?'amber':'green'});}
  const site=await this.safe(()=>this.p.siteContent?.state(id));
  if(site?.pages?.length){const year=Date.now()-365*DAY,old=site.pages.filter(p=>p.lastmod&&Date.parse(p.lastmod)<year).sort((a,b)=>String(a.lastmod).localeCompare(String(b.lastmod))),stale=old.length;items.push({...rows(old,p=>({key:p.url,title:p.title||p.url,meta:`最后更新 ${day(p.lastmod)}`,url:p.url})),handOff:{playbookId:'optimize-page',title:'更新这些很久没改的页面：{0}'},key:'stale',text:'{0} 个页面超过一年没更新',values:[n(stale)],source:'网站内容',detail:`共 ${n(site.pages.length)} 个页面`,to:'/content',tone:stale?'amber':'grey'});}
  return items;}
 // New stars, Hacker News mentions and Reddit posts are on the metric cards at the top of 洞察, so they are not repeated
 // here (2026-10-08): this list is for states worth a look, not volumes.
 async community(id){const items=[],now=Date.now(),since7=new Date(now-7*DAY).toISOString(),since14=new Date(now-14*DAY).toISOString();
  const cm=await this.safe(()=>this.p.community?.state(id));
  if(cm?.origin&&cm.status!=='disconnected'){const recent=Object.values(cm.topics||{}).filter(t=>String(t.createdAt)>=since14),open=recent.filter(t=>!t.replies).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));items.push({...rows(open,t=>({key:String(t.id||t.slug||t.title),title:t.title,meta:`${cm.categories?.[t.categoryId]||'未分类'} · ${day(t.createdAt)}`,url:cm.origin&&t.slug?`${cm.origin}/t/${t.slug}/${t.id}`:null})),handOff:{playbookId:'community-reply',title:'给论坛里没人回复的主题起草回复：{0}'},key:'forum',text:'{0} 个论坛主题没人回复',values:[n(open.length)],source:'论坛',detail:`近 14 天 ${recent.length} 个新主题`,to:'/data/community',tone:open.length>=3?'amber':'grey'});}
  const ch=await this.safe(()=>this.p.chat?.state(id));
  for(const k of ['discord','slack'].filter(p=>ch?.[p]?.status==='active')){const week=Object.values(ch.messages||{}).filter(m=>m.platform===k&&m.createdAt>=since7),open=week.filter(m=>m.question&&!m.replies&&now-Date.parse(m.createdAt)>DAY);
   const name=k==='discord'?'Discord':'Slack';
   items.push({...rows(open,m=>({key:m.url||m.text,title:String(m.text||'').replace(/\s+/g,' ').slice(0,120),meta:`#${m.channel} · ${day(m.createdAt)}`,url:m.url})),handOff:{playbookId:'community-reply',title:`给 ${name} 上没人回的提问起草回复：{0}`},key:k,text:`${name} 上 {0} 个提问可能没人回`,values:[n(open.length)],source:name,detail:`近 7 天 ${n(week.length)} 条消息、${n(week.filter(m=>m.question).length)} 个提问`,to:`/data/${k}`,tone:open.length?'amber':'green'});}
  const xs=await this.safe(()=>this.p.xSource?.state(id));
  if(xs?.terms?.length&&xs.status!=='disconnected'){const c=xs.counts||{},days=Object.keys(c).sort().slice(-8,-1),count=days.reduce((t,d)=>t+c[d],0),top=Object.values(xs.posts||{}).filter(p=>p.createdAt>=since7).sort((a,b)=>b.metrics.likes-a.metrics.likes),hot=top[0];
   items.push({...rows(top,p=>({key:String(p.id),title:String(p.text||'').replace(/\s+/g,' ').slice(0,120),meta:`${n(p.metrics.likes)} 赞 · ${day(p.createdAt)}`,url:p.url})),handOff:{playbookId:'community-summary',title:'整理 X 上提到产品的帖子：{0}'},key:'x',text:days.length?'X 近 7 天提到你 {0} 次':'X 的提及还没有数据',values:days.length?[n(count)]:[],source:'X',detail:hot?`赞最多：${hot.text.slice(0,40)}（${n(hot.metrics.likes)} 赞）`:'每天查一次，不含转发',to:'/data/x'});}
  return items;}
 async summary(id){const [search,ai,site,community]=await Promise.all([this.search(id),this.ai(id),this.site(id),this.community(id)]);
  return {areas:[{id:'search',title:'搜索与市场',items:search},{id:'ai',title:'AI 搜索',items:ai},{id:'site',title:'网站与产品',items:site},{id:'community',title:'社区',items:community}].filter(a=>a.items.length)};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'洞察没有读出来，请稍后重试。');}};
  const actions={summary:wrap(id=>this.summary(id))};
  this.p.routes.define({name:'nrInsights',actions});this.p.routes.allow('nrInsights',Object.keys(actions),'loggedIn');}
}
module.exports={InsightSummary};
