// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { DataViews, hackernewsCard, packagesCard, redditCard, windowFor } from './data-views.js';
import { computeAll } from './signals.js';
import { RULES, ruleOf } from './analysis-rules.js';
// 洞察 · 需要留意 (2026-10-03 as 各方面一览): the state of each area — search, AI search, the site and product, community —
// from every connected source, each pointing to the page with the detail. Read from data already synced or saved: no
// paid query and no model call. A source that is not connected adds nothing; AI search says when it has not been asked yet.
// 2026-10-08 (user: two grids of number tiles, unclear which to look at): each item is one sentence — `text` with {0}…
// for the numbers in `values`, which the page bolds — plus where it comes from (`source`) and a short `detail`.
// 2026-10-08 (user: the line points to a whole page, where its own data is hard to find): each item also carries what is
// behind it — `rows` (up to 10, with `total`) or `compare` (this period against the one before) — shown when the line is
// clicked, and for the ones there is something to do about, `handOff` (the 做法 and a task title with {0} for the ticked
// rows), so they can be ticked and handed to the Agent from there.
// 2026-10-24 (user: the list shows only what a marketer should care about, and showed too little of it): each item has a
// `group` — getting worse, to handle, an opportunity, or share of voice — which orders the list and colours its numbers.
// Besides the lines below, each of RULE_LINES adds what that analysis rule finds, and the volumes the metric cards have no
// room for are added too. Average CTR (no comparison to judge it by), saved keywords (an inventory) and the one
// competitor line (now two rules) were dropped.
const DAY=86400000;
const n=v=>Number(v||0).toLocaleString('en-US');
const PLATFORM={chat_gpt:'ChatGPT',google:systemMessageText('common.googleAiOverviews')},MODEL={chat_gpt:'ChatGPT',claude:'Claude',gemini:'Gemini',perplexity:'Perplexity'};
const ROWS=10,day=v=>String(v||'').slice(0,10);
const rows=(list,map)=>({rows:list.slice(0,ROWS).map(map),total:list.length});
const move=c=>`${c>=0?'↑':'↓'} ${Math.abs(Math.round(c*100))}%`;
// The analysis rules Current situation lists, by the area and group they belong to and the page that has their data.
// Each value counts what the rule found (pages, competitors, AI platforms, posts...), so the labels name that unit;
// `playbook` is how its ticked items are handed to the Agent (2026-10-24 user feedback: every line that lists items
// can hand them off).
const RULE_LINES={
 'gsc-click-drop':{area:'search',group:'worse',to:'/seo-opportunities',playbook:'optimize-page'},
 'competitor-release':{area:'search',group:'worse',to:'/research/domain',playbook:'competitor-compare'},
 'competitor-pages':{area:'search',group:'worse',to:'/research/domain',playbook:'competitor-compare'},
 'ai-share':{area:'ai',group:'worse',to:'/ai-search',playbook:'content-outline'},
 'github-rival-stars':{area:'site',group:'worse',to:'/data/github',playbook:'competitor-compare'},
 'gsc-low-ctr':{area:'search',group:'handle',to:'/seo-opportunities',playbook:'optimize-page'},
 'ga4-low-conversion':{area:'site',group:'handle',to:'/website/conversion',playbook:'optimize-page'},
 'site-stale':{area:'site',group:'handle',to:'/content',playbook:'optimize-page'},
 'site-thin':{area:'site',group:'handle',to:'/content',playbook:'optimize-page'},
 'ai-uncited':{area:'ai',group:'handle',to:'/ai-search',playbook:'content-outline'},
 'trends-rising':{area:'search',group:'chance',to:'/trends',playbook:'content-outline'},
 'hn-story':{area:'community',group:'chance',to:'/data/hackernews',playbook:'community-reply'},
 'x-hot':{area:'community',group:'chance',to:'/data/x',playbook:'community-reply'},
 'community-theme':{area:'community',group:'chance',to:'/data/community',playbook:'content-outline'},
 'github-referrer':{area:'site',group:'chance',to:'/data/github',playbook:'change-research'},
 'github-release':{area:'site',group:'chance',to:'/data/github',playbook:'release-notes'},
};
const SOURCE_NAME={gsc:systemMessageText('common.searchPerformance'),ga4:'GA4',site:systemMessageText('common.websiteContent'),github:'GitHub','github-traffic':'GitHub Traffic',discourse:systemMessageText('common.forum'),hackernews:'Hacker News',x:'X',trends:systemMessageText('dataTrends.trends'),competitors:systemMessageText('common.competitor'),'ai-search':systemMessageText('common.aiSearch')};
class InsightSummary{
 constructor(p){this.p=p;this.views=new DataViews(p);}
 async safe(fn){try{return await fn();}catch{return null;}}
 async search(id){const items=[];
  const sr=await this.safe(()=>this.views.search(id,{range:'28'}));
  if(sr?.connected&&sr.cutoff){const near=(sr.striking||[]).length;items.push({key:'striking',text:systemMessageText('insightSummary.queriesClosePageOne'),values:[n(near)],source:systemMessageText('common.searchPerformance'),detail:systemMessageText('insightSummary.ranking520ImprovingPages'),to:'/seo-opportunities',group:'chance',tone:near?'blue':'grey',...rows(sr.striking||[],r=>({key:r.query,title:r.query,meta:systemMessageText('messages.positionImpressionsClicks', { 0: Number(r.position).toFixed(1), 1: n(r.impressions), 2: n(r.clicks) }),url:r.page})),handOff:{playbookId:'optimize-page',title:'把这些查询推进前几名：{0}'}});
  }
  const rt=await this.safe(()=>this.p.rankTracking?.status(id));
  if(rt?.keywords?.length){let up=0,down=0,top10=0;for(const k of rt.keywords){const a=k.previous?.position,b=k.latest?.position;if(b&&b<=10)top10++;if(a&&b){if(b<a)up++;else if(b>a)down++;}else if(!a&&b&&k.previous)up++;else if(a&&!b)down++;}
   const moved=rt.keywords.map(k=>({k,a:k.previous?.position||null,b:k.latest?.position||null})).filter(x=>x.a!==x.b&&(x.a||x.b)).sort((x,y)=>Math.abs((y.a||101)-(y.b||101))-Math.abs((x.a||101)-(x.b||101)));
   items.push({key:'rank',...rows(moved,x=>({key:x.k.keyword,title:x.k.keyword,meta:systemMessageText('rankTracking.positionChange', { 0: x.a||'100+', 1: x.b||'100+' }),tag:{tone:(x.b||101)<(x.a||101)?'green':'red',text:(x.b||101)<(x.a||101)?systemMessageText('effect.up'):systemMessageText('effect.down')},url:x.k.latest?.url||x.k.previous?.url||null})),handOff:{playbookId:'optimize-page',title:'提升这些关键词的排名：{0}'},text:systemMessageText('insightSummary.rankingsWeekUpDown'),values:[n(up),n(down)],source:systemMessageText('common.rankTracking'),detail:systemMessageText('messages.trackingKeywordsTop10Compared', { 0: rt.keywords.length, 1: top10 }),to:'/keywords?tab=tracking',group:down?'worse':'voice',tone:down>up?'red':up?'green':'grey'});}
  const tr=await this.safe(()=>this.p.trends?.status(id));
  if(tr?.connected&&tr.summary?.length&&tr.checkedAt){const me=tr.summary[0];items.push({key:'trends',text:me.change===null?systemMessageText('insightSummary.googleInterestNoComparisonYet'):systemMessageText('insightSummary.googleInterest'),values:me.change===null?[]:[`${me.change>=0?'↑':'↓'} ${Math.abs(Math.round(me.change*100))}%`],source:systemMessageText('dataTrends.trends'),detail:`「${me.term}」近 4 周对比前 4 周（${tr.place}）${tr.summary.length>1?`；${tr.summary.slice(1).map(x=>`${x.term} ${x.recent??'—'}`).join('、')}`:''}`,to:'/trends',group:'voice',tone:me.change===null?'grey':me.change>=0.1?'green':me.change<=-0.1?'red':'grey',compare:tr.summary.map(x=>({label:x.term,now:x.recent??'—',before:x.previous??'—'}))});}
  return items;}
 async ai(id){const items=[],s=await this.safe(()=>this.p.aiSearch?.state(id));
  for(const b of s?.brands||[]){const r=b.result||{},me=(r.share||[]).find(x=>x.own),total=(r.share||[]).reduce((t,x)=>t+(x.mentions||0),0),cited=(r.questions||[]).filter(q=>q.ownCited).length;
   const name=PLATFORM[b.spec.platform]||b.spec.platform,sp=/[\w]$/.test(name)?' ':'';
   const share=(r.share||[]).filter(x=>x.mentions!==null).sort((x,y)=>y.mentions-x.mentions);
   items.push({...rows(share,x=>({key:x.key,title:x.key,meta:`${n(x.mentions)} 次${total?` · 份额 ${Math.round(x.mentions/total*100)}%`:''}`,tag:x.own?{tone:'blue',text:systemMessageText('common.you')}:undefined})),handOff:{playbookId:'competitor-compare',title:`对比 ${name}${sp}回答里提到的这些品牌：{0}`},key:`brand-${b.spec.platform}`,text:r.mentions==null?`${name}${sp}的提及还没有结果`:`${name}${sp}提到你 {0} 次`,values:r.mentions==null?[]:[n(r.mentions)],source:systemMessageText('common.aiSearch'),detail:[me&&total?systemMessageText('messages.shareVoice', { 0: Math.round(me.mentions/total*100) }):'',r.questions?.length?systemMessageText('messages.answersCiteSite', { 0: r.questions.length, 1: cited }):'',String(b.at).slice(0,10)].filter(Boolean).join('，'),to:'/ai-search',group:'voice',tone:me&&total&&me.mentions/total<0.3?'amber':'grey'});}
  const asked=s?.answers||[],missing=asked.filter(a=>Object.values(a.models||{}).some(m=>!m.mentioned));
  if(asked.length)items.push({...rows(missing,a=>{const models=Object.entries(a.models||{}),no=models.filter(([,m])=>!m.mentioned).map(([k])=>MODEL[k]||k),cited=[...new Set(models.flatMap(([,m])=>(m.citations||[]).filter(c=>!c.own).map(c=>c.domain)))].slice(0,3);return {key:a.question,title:a.question,meta:`没提到：${no.join('、')}${cited.length?` · 引用了 ${cited.join('、')}`:''}`};}),handOff:{playbookId:'content-outline',title:'让 AI 回答这些问题时提到我们：{0}'},key:'answers',text:systemMessageText('insightSummary.aiLeavesOutQuestions'),values:[n(missing.length)],source:systemMessageText('common.aiSearch'),detail:systemMessageText('messages.askedLast30DaysCounted', { 0: asked.length }),to:'/ai-search?tab=ask',group:'handle',tone:missing.length?'amber':'green'});
  if(!items.length&&this.p.aiSearch?.d4s?.config(id)?.verifiedAt)items.push({key:'none',text:systemMessageText('insightSummary.aiSearchNotCheckedYet'),values:[],source:systemMessageText('common.aiSearch'),detail:systemMessageText('insightSummary.seeWhetherChatgptGoogleAi'),to:'/ai-search',group:'voice',tone:'grey'});
  return items;}
 async site(id){const items=[];
  const report=await this.safe(()=>this.p.audit?.report(id));
  if(report?.connected&&report.read){const c=report.counts||{},critical=(report.issues||[]).filter(i=>i.severity==='critical');items.push({...rows(critical,i=>({key:i.type,title:i.title,meta:systemMessageText('messages.pagesEG', { 0: n(i.count), 1: (i.pages||[]).slice(0,2).map(x=>x.url).join('；') }),tag:{tone:'red',text:systemMessageText('siteAudit.critical')},url:i.pages?.[0]?.url||null})),handOff:{playbookId:'tech-fix',title:'修复网站审计的严重问题：{0}'},key:'audit',text:systemMessageText('insightSummary.criticalAuditIssuesValue'),values:[n(c.critical)],source:systemMessageText('analysisRules.siteAudit'),detail:systemMessageText('messages.plusWarningsNoticesAffectedPages', { 0: n(c.warning), 1: n(c.notice) }),to:'/audit',group:'handle',tone:c.critical?'red':c.warning?'amber':'green'});}
  return items;}
 async community(id){const items=[],now=businessNow(this.p,id),since7=new Date(now-7*DAY).toISOString(),since14=new Date(now-14*DAY).toISOString();
  const cm=await this.safe(()=>this.p.community?.state(id));
  if(cm?.origin&&cm.status!=='disconnected'){const recent=Object.values(cm.topics||{}).filter(t=>String(t.createdAt)>=since14),open=recent.filter(t=>!t.replies).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));items.push({...rows(open,t=>({key:String(t.id||t.slug||t.title),title:t.title,meta:`${cm.categories?.[t.categoryId]||systemMessageText('communitySource.uncategorized')} · ${day(t.createdAt)}`,url:cm.origin&&t.slug?`${cm.origin}/t/${t.slug}/${t.id}`:null})),handOff:{playbookId:'community-reply',title:systemMessageText('insightSummary.draftRepliesUnansweredForumTopics')},key:'forum',text:systemMessageText('insightSummary.forumTopicsWithoutReplies'),values:[n(open.length)],source:systemMessageText('common.forum'),detail:systemMessageText('messages.newTopicCount', { 0: recent.length }),to:'/data/community',group:'handle',tone:open.length>=3?'amber':'grey'});}
  const ch=await this.safe(()=>this.p.chat?.state(id));
  for(const k of ['discord','slack'].filter(p=>ch?.[p]?.status==='active')){const week=Object.values(ch.messages||{}).filter(m=>m.platform===k&&m.createdAt>=since7),open=week.filter(m=>m.question&&!m.replies&&now-Date.parse(m.createdAt)>DAY);
   const name=k==='discord'?'Discord':'Slack';
   items.push({...rows(open,m=>({key:m.url||m.text,title:String(m.text||'').replace(/\s+/g,' ').slice(0,120),meta:`#${m.channel} · ${day(m.createdAt)}`,url:m.url})),handOff:{playbookId:'community-reply',title:`给 ${name} 上没人回的提问起草回复：{0}`},key:k,text:`${name} 上 {0} 个提问可能没人回`,values:[n(open.length)],source:name,detail:systemMessageText('messages.messagesQuestionsLast7Days', { 0: n(week.length), 1: n(week.filter(m=>m.question).length) }),to:`/data/${k}`,group:'handle',tone:open.length?'amber':'green'});}
  const xs=await this.safe(()=>this.p.xSource?.state(id));
  if(xs?.terms?.length&&xs.status!=='disconnected'){const c=xs.counts||{},keys=Object.keys(c).sort(),days=keys.slice(-8,-1),before=keys.slice(-15,-8),count=days.reduce((t,d)=>t+c[d],0),previous=before.length===7?before.reduce((t,d)=>t+c[d],0):0,top=Object.values(xs.posts||{}).filter(p=>p.createdAt>=since7).sort((a,b)=>b.metrics.likes-a.metrics.likes),hot=top[0];
   items.push({...rows(top,p=>({key:String(p.id),title:String(p.text||'').replace(/\s+/g,' ').slice(0,120),meta:systemMessageText('messages.likeCountDetail', { 0: n(p.metrics.likes), 1: day(p.createdAt) }),url:p.url})),handOff:{playbookId:'community-summary',title:'整理 X 上提到产品的帖子：{0}'},key:'x',text:days.length?systemMessageText('insightSummary.xMentionedTimesLast7'):systemMessageText('insightSummary.noXMentionDataYet'),values:days.length?[n(count),...(previous?[move((count-previous)/previous)]:[])]:[],source:'X',group:'voice',detail:hot?systemMessageText('messages.mostLikedLikes', { 0: hot.text.slice(0,40), 1: n(hot.metrics.likes) }):systemMessageText('insightSummary.checkedDailyExcludingReposts'),to:'/data/x'});}
  return items;}
 // What each of RULE_LINES finds in the saved data now, with the switches and thresholds of Settings › Analysis rules, so
 // this list and the daily analysis agree (2026-10-24 user decision). Read-only: the rule engine's inputs and its rules
 // without the custom ones, which ask a model. A rule that finds nothing, or is switched off, adds no line. A rule item
 // that stands for several things (an X post among N, a week's releases, a term's rising searches) carries `count`.
 async rules(id){const engine=this.p.signals;if(!engine)return {};
  const snapshot=await this.safe(()=>this.p.analysisRules?.snapshot?.(id)),config=snapshot?.config||await this.safe(()=>this.p.analysisRules?.config(id)),{inputs}=await engine.inputs(id);
  if(snapshot)inputs.ruleCatalog=snapshot.catalog;
  const catalog=snapshot?.catalog||RULES,by={},areas={};
  for(const s of computeAll(inputs,config).ranked){const rule=ruleOf(s.key,catalog);if(RULE_LINES[rule])(by[rule]||=[]).push(s);}
  for(const [rule,list] of Object.entries(by)){const {area,group,to,playbook}=RULE_LINES[rule],meta=catalog.find(r=>r.id===rule)||RULES.find(r=>r.id===rule),label=meta?.label||rule;
   (areas[area]||=[]).push({key:`rule-${rule}`,group,text:label,values:[n(list.reduce((t,s)=>t+(s.count||1),0))],source:SOURCE_NAME[meta?.source]||meta?.source||'',detail:meta?.description||'',to,handOff:{playbookId:playbook,title:`${label}：{0}`},
    ...rows(list,s=>({key:s.key,title:s.title,meta:s.facts?.[0],url:s.url||null,tag:s.chip}))});}
  return areas;}
 // Volumes the metric cards have no room for (they show five, and search, visits, key events and new stars come first):
 // Hacker News mentions and new Reddit posts in the last 7 days and downloads in the last 28, each against the period
 // before when it is fully covered, counted as on their pages.
 async volumes(id){const now=businessNow(this.p,id),end=day(new Date(now-DAY).toISOString()),out={site:[],community:[]};
  const [hn,rd,pk]=await Promise.all([this.safe(()=>this.p.hackernews?.state(id)),this.safe(()=>this.p.reddit?.state(id)),this.safe(()=>this.p.packages?.state(id))]);
  const values=(card,key)=>{const m=card?.metrics?.find(x=>x.key===key);return m&&m.value!=null?[n(m.value),...(m.change==null?[]:[move(m.change)])]:null;};
  const hv=values(hackernewsCard(hn,windowFor(end,'7'),now),'mentions'),rv=values(redditCard(rd,windowFor(end,'7'),now),'posts'),pv=values(packagesCard(pk,windowFor(end,'28'),now),'downloads');
  if(hv)out.community.push({key:'hackernews',group:'voice',text:systemMessageText('common.hackerNewsMentions'),values:hv,source:'Hacker News',detail:systemMessageText('common.last7Days'),to:'/data/hackernews'});
  if(rv)out.community.push({key:'reddit',group:'voice',text:systemMessageText('strategy.newRedditPosts'),values:rv,source:'Reddit',detail:systemMessageText('common.last7Days'),to:'/data/reddit'});
  if(pv)out.site.push({key:'downloads',group:'voice',text:systemMessageText('common.downloads'),values:pv,source:systemMessageText('common.downloads'),to:'/data/downloads'});
  return out;}
 async summary(id){const [search,ai,site,community,ruled,volumes]=await Promise.all([this.search(id),this.ai(id),this.site(id),this.community(id),this.safe(()=>this.rules(id)),this.safe(()=>this.volumes(id))]);
  const add=(area,list)=>[...list,...(ruled?.[area]||[]),...(volumes?.[area]||[])];
  return {areas:[{id:'search',title:systemMessageText('dataSources.categories.search'),items:add('search',search)},{id:'ai',title:systemMessageText('common.aiSearch'),items:add('ai',ai)},{id:'site',title:systemMessageText('dataSources.categories.website'),items:add('site',site)},{id:'community',title:systemMessageText('dataSources.categories.community'),items:add('community',community)}].filter(a=>a.items.length)};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('insightSummary.notLoadInsightsTryAgain'));}};
  const actions={summary:wrap(id=>this.summary(id))};
  this.p.app.resourceManager.define({name:'nrInsights',actions});this.p.app.acl.allow('nrInsights',Object.keys(actions),'loggedIn');}
}
export { InsightSummary };