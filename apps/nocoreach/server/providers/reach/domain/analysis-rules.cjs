'use strict';
// 分析规则 (2026-10-08 user decision: the analysis is not a black box, and each product weighs things differently). The
// rules that find changes in the data, with their key numbers, can be seen, switched off and changed per project; the
// team can write what matters to them (read by the AI at every judgement); and the longest watch can be set. Kept per
// project in nrSnapshots (analysis-rules:<id>); a rule or number never set reads as its default.
const {projectId,requireAccess}=require('./policy.cjs');
const p=(key,label,value,min,max,unit='')=>({key,label,default:value,min,max,unit});
// Each rule: the data source it reads, the changes (signal keys) it makes, and its numbers.
const RULES=[
 {id:'gsc-low-ctr',source:'gsc',label:'页面曝光多、点击少',description:'近 28 天曝光多，点击率低于站内中位数的一半，也低于下面的点击率',match:['gsc-low-ctr:'],params:[p('minImpressions','曝光至少',500,50,100000),p('maxCtr','点击率低于',2,0.1,20,'%')]},
 {id:'gsc-near-first',source:'gsc',label:'页面接近首页',description:'平均排名在这个范围、曝光够多的页面，改进后最有希望进前几名',match:['gsc-near-first:'],params:[p('posFrom','排名从',8,2,50),p('posTo','到',20,3,100),p('minImpressions','曝光至少',300,50,100000)]},
 {id:'gsc-click-drop',source:'gsc',label:'页面搜索点击下降',description:'近 28 天比前 28 天的点击明显减少',match:['gsc-click-drop:'],params:[p('dropPct','下降至少',30,5,90,'%'),p('minPrevious','前 28 天点击至少',20,1,100000)]},
 {id:'gsc-site',source:'gsc',label:'全站搜索点击、曝光涨跌',description:'近 28 天比前 28 天',match:['gsc-site-'],params:[p('changePct','涨跌至少',15,3,200,'%')]},
 {id:'ga4-site',source:'ga4',label:'全站访问、浏览、关键事件涨跌',description:'近 28 天比前 28 天',match:['ga4-site-'],params:[p('changePct','涨跌至少',15,3,200,'%')]},
 {id:'ga4-github-referral',source:'ga4',label:'从 GitHub 来的访问变化',description:'近 28 天比前 28 天',match:['ga4-github-referral'],params:[p('changePct','涨跌至少',30,5,300,'%'),p('minSessions','近 28 天访问至少',30,1,100000)]},
 {id:'ga4-low-conversion',source:'ga4',label:'访问多但关键事件少',description:'关键事件率不到全站平均三分之一的页面（首页和条款类页面除外）',match:['ga4-low-conversion:'],params:[p('minViews','浏览至少',500,50,1000000)]},
 {id:'site-stale',source:'site',label:'有流量的页面很久没更新',description:'文档和博客里仍有搜索曝光或访问的页面',match:['site-stale:'],params:[p('months','超过',12,3,60,'个月')]},
 {id:'site-thin',source:'site',label:'有流量的页面内容很短',description:'文档和博客里仍有搜索曝光或访问的页面',match:['site-thin:'],params:[p('maxWords','正文少于',150,30,2000,'字')]},
 {id:'audit',source:'site',label:'网站审计的问题',description:'打不开、误设 noindex 总会提出；缺标题、缺描述、标题重复要达到下面的页数',match:['audit-'],params:[p('minPages','至少',3,1,100,'页')]},
 {id:'github-star-spike',source:'github',label:'Star 单日激增',description:'最近一天新增的 Star 比前 7 天平均多很多',match:['github-star-spike'],params:[p('minStars','至少',20,1,10000,'个'),p('ratio','是平时的',3,1.5,20,'倍')]},
 {id:'github-release',source:'github',label:'新版本发布',description:'近 7 天发布的正式版或预发布版本',match:['github-release:'],params:[]},
 {id:'github-views-change',source:'github-traffic',label:'仓库浏览涨跌',description:'近 7 天比前 7 天',match:['github-views-change'],params:[p('changePct','涨跌至少',30,5,300,'%'),p('minPrevious','前 7 天浏览至少',100,10,1000000)]},
 {id:'github-referrer',source:'github-traffic',label:'某网站带来的仓库访问翻倍',description:'GitHub 最近 14 天的来源网站',match:['github-referrer:'],params:[p('minCount','访问至少',50,5,100000,'次')]},
 {id:'community-theme',source:'discourse',label:'社区反复问到的主题',description:'近 30 天几个主题都提到同一个词：网站没写的算缺口，写了还在问的算要改',match:['community-gap:','community-covered:'],params:[p('minTopics','至少',3,2,50,'个主题')]},
 {id:'community-digest',source:'discourse',label:'社区未解决的主题汇总',description:'近 30 天讨论最多、还没标记解决的主题，交给 AI 归类',match:['community-digest'],params:[p('minActive','至少',5,2,50,'个主题')]},
 {id:'community-unanswered',source:'discourse',label:'论坛主题无人回复',description:'近 14 天的新主题',match:['community-unanswered'],params:[p('minCount','至少',3,1,100,'个')]},
 {id:'community-category',source:'discourse',label:'论坛某个分类讨论增加',description:'近 14 天比前 14 天',match:['community-category:'],params:[p('minTopics','至少',5,2,100,'个主题'),p('ratio','是之前的',1.5,1.1,10,'倍')]},
 {id:'packages-downloads',source:'packages',label:'下载量涨跌',description:'近 28 天比前 28 天：全部包合计，或某一个包',match:['packages-downloads'],params:[p('totalPct','合计涨跌至少',20,5,300,'%'),p('onePct','单个包涨跌至少',40,5,500,'%'),p('minPrevious','前 28 天下载至少',500,10,10000000)]},
 {id:'hn-spike',source:'hackernews',label:'Hacker News 提及激增',description:'近 7 天的提及比前 3 周平均多很多',match:['hn-spike'],params:[p('minWeek','近 7 天至少',5,1,1000,'次'),p('ratio','是平时的',3,1.5,20,'倍')]},
 {id:'hn-story',source:'hackernews',label:'Hacker News 热门帖子',description:'近 7 天提到产品的帖子',match:['hn-story:'],params:[p('minPoints','至少',50,5,5000,'分')]},
 {id:'rank',source:'rank',label:'跟踪的关键词排名明显变化',description:'掉了几位、从前 20 掉出前 100，或进入前 10',match:['rank-'],params:[p('dropPlaces','掉至少',5,1,50,'位')]},
 {id:'reddit-new',source:'reddit',label:'Reddit 新帖子',description:'近 7 天新发现提到产品的帖子',match:['reddit-new'],params:[p('minPosts','至少',2,1,100,'个')]},
 {id:'trends-rising',source:'trends',label:'相关搜索开始上升',description:'产品或关注的关键词，这周新出现的上升搜索',match:['trends-rising','trends-kw-rising:'],params:[]},
 {id:'trends-move',source:'trends',label:'Google 关注度涨跌',description:'近 4 周比前 4 周：产品或关注的关键词',match:['trends-move','trends-kw-move:'],params:[p('changePct','涨跌至少',25,5,300,'%')]},
 {id:'competitor-pages',source:'competitors',label:'竞品官网新增页面',description:'近 7 天',match:['competitor-pages:'],params:[p('minPages','至少',3,1,100,'个页面')]},
 {id:'competitor-release',source:'competitors',label:'竞品发布新版本',description:'近 7 天',match:['competitor-release:'],params:[]},
 {id:'x-rise',source:'x',label:'X 上的提及增加',description:'近 7 天比前 7 天（不含转发）',match:['x-rise'],params:[p('minPosts','近 7 天至少',20,1,100000,'条'),p('ratio','是之前的',1.5,1.1,20,'倍')]},
 {id:'x-hot',source:'x',label:'X 上互动多的帖子',description:'赞加转发×2',match:['x-hot:'],params:[p('minEngagement','互动至少',100,5,1000000)]},
 {id:'chat-open',source:'discord',label:'Discord / Slack 可能没人回的提问',description:'近 7 天、超过一天没有回复',match:['discord-open','slack-open'],params:[p('minCount','至少',3,1,100,'个')]},
 {id:'chat-volume',source:'discord',label:'Discord / Slack 消息量涨跌',description:'近 7 天比前 7 天',match:['discord-volume','slack-volume'],params:[p('changePct','涨跌至少',30,5,300,'%'),p('minPrevious','前 7 天至少',50,5,100000,'条')]},
 {id:'ai-share',source:'ai-search',label:'AI 回答里竞品被提到得更多',description:'品牌提及里，提到最多的竞品比你多出',match:['ai-share:'],params:[p('morePct','多出至少',20,0,500,'%')]},
 {id:'ai-uncited',source:'ai-search',label:'AI 提到你却没引用你的网站',description:'品牌提及的回答',match:['ai-uncited:'],params:[p('minCount','至少',5,1,100,'个回答')]},
 {id:'ai-answer',source:'ai-search',label:'问 AI 时有模型没提到你',description:'问过的问题',match:['ai-answer:'],params:[]},
];
const BY_ID=new Map(RULES.map(r=>[r.id,r]));
const WATCH_DAYS={default:14,min:7,max:28},FOCUS_MAX=1000;
// The rule a change comes from (by its key).
function ruleOf(key){const k=String(key||'');return RULES.find(r=>r.match.some(m=>k.startsWith(m)))?.id||null;}
// A stored setting made safe: unknown rules and numbers dropped, numbers kept within their range.
function normalize(v={}){const rules={};
 for(const [id,s] of Object.entries(v.rules||{})){const r=BY_ID.get(id);if(!r||!s||typeof s!=='object')continue;const out={};if(s.enabled===false)out.enabled=false;
  const values={};for(const prm of r.params){const x=Number(s.values?.[prm.key]);if(s.values&&prm.key in s.values&&Number.isFinite(x))values[prm.key]=Math.min(prm.max,Math.max(prm.min,x));}
  if(Object.keys(values).length)out.values=values;if(Object.keys(out).length)rules[id]=out;}
 const days=Number(v.watchDays);
 return {rules,focus:typeof v.focus==='string'?v.focus.trim().slice(0,FOCUS_MAX):'',watchDays:Number.isFinite(days)?Math.round(Math.min(WATCH_DAYS.max,Math.max(WATCH_DAYS.min,days))):WATCH_DAYS.default};}
// What the signal engine reads: whether a rule is on, and each number (the default unless changed).
function resolver(config){const c=normalize(config||{});return {on:id=>c.rules[id]?.enabled!==false,value:(id,key)=>{const r=BY_ID.get(id),prm=r?.params.find(x=>x.key===key);if(!prm)throw new Error(`unknown rule number ${id}.${key}`);return c.rules[id]?.values?.[key]??prm.default;},watchDays:c.watchDays,focus:c.focus};}
class AnalysisRules{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.store.repository('nrSnapshots');}
 key(id){return `analysis-rules:${id}`;}
 async config(id){const row=await this.repo().findOne({filter:{key:this.key(id)}});return normalize(row?.get('payload')||{});}
 async save(id,v){const current=await this.config(id),next=normalize({rules:v.rules??current.rules,focus:v.focus??current.focus,watchDays:v.watchDays??current.watchDays});
  const row=await this.repo().findOne({filter:{key:this.key(id)}});if(row)await this.repo().update({filterByTk:row.id,values:{payload:next}});else await this.repo().create({values:{key:this.key(id),payload:next}});return next;}
 // The page: every rule with its numbers and this project's settings, and what the latest analysis did.
 async view(id){const config=await this.config(id),r=resolver(config),signals=await this.p.signals?.last(id).catch(()=>null),state=await this.p.strategy?.state(id).catch(()=>null);
  const reviews=Object.values(state?.insights?.signalReviews||{}),count=v=>reviews.filter(x=>x.verdict===v).length;
  return {rules:RULES.map(x=>({id:x.id,source:x.source,label:x.label,description:x.description,enabled:r.on(x.id),params:x.params.map(prm=>({...prm,value:r.value(x.id,prm.key)})),found:signals?.found?.[x.id]??null})),
   focus:config.focus,watchDays:config.watchDays,watchLimits:WATCH_DAYS,
   last:signals?{computedAt:signals.computedAt,found:signals.total??null,passed:state?.insights?.evidence?.signals?.items?.length??null,missing:signals.missing||[],analyzedAt:state?.insights?.generatedAt||null,verdicts:{do:count('do'),watch:count('watch'),skip:count('skip')}}:null};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'分析规则没有读出来，请稍后重试。');}};
  const actions={view:wrap(id=>this.view(id)),save:wrap(async(id,v)=>{await this.save(id,v);return this.view(id);})};
  this.p.routes.define({name:'nrAnalysisRules',actions});this.p.routes.allow('nrAnalysisRules',Object.keys(actions),'loggedIn');}
}
module.exports={RULES,WATCH_DAYS,ruleOf,normalize,resolver,AnalysisRules};
