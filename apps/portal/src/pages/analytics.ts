import { $t } from "@/i18n";
export type Pair = {keyword:string;page:string;clicks:number|null;impressions:number|null;previous:number|null;previousImpressions:number|null;position:number|null};
export type Opportunity = {keyword:string;clicks:number;impressions:number;previous:number;position:number;pages:Pair[];kind:string;reason:string;recommendation:string};
export function opportunities(pairs:Pair[]):Opportunity[]{
 const groups=new Map<string,Pair[]>();
 for(const pair of pairs) groups.set(pair.keyword,[...(groups.get(pair.keyword)||[]),pair]);
 return [...groups.entries()].map(([keyword,pages])=>{
  const sum=(key:'clicks'|'impressions'|'previous')=>pages.reduce((s,p)=>s+(p[key]||0),0);
  const clicks=sum('clicks'),impressions=sum('impressions'),previous=sum('previous');
  const position=pages.reduce((s,p)=>s+(p.position||0)*(p.impressions||0),0)/(impressions||1);
  const active=pages.filter(p=>(p.impressions||0)>=100);
  let kind=$t("观察"),reason=$t("已有搜索曝光，可作为选题与页面优化的参考。"),recommendation=$t("先确认搜索意图与产品相关性，再决定是否投入内容。");
  if(/noco\s*base/i.test(keyword)){reason=$t("品牌相关查询：多个页面可能来自导航意图、语言版本或站点链接，不据此判定关键词冲突。");recommendation=$t("观察品牌需求与官网入口表现，不将品牌导航词直接转成新增文章选题。");}
  else if(previous>=10 && clicks<previous*.75){kind=$t("流量回落");reason=$t("点击从 {0} 降至 {1}，值得优先检查。",{0:previous,1:clicks});recommendation=$t("核对排名、收录、需求季节性及近期页面改动；优先修复已有页面，不急于新建文章。");}
  else if(impressions>=200 && position>=4 && position<=20){kind=$t("排名提升");reason=$t("曝光 {0}，平均位置 {1}，已有一定搜索基础。",{0:impressions,1:position.toFixed(1)});recommendation=$t("检查现有页面是否充分回答搜索意图，补充示例、差异化信息及相关内链。");}
  else if(active.length>1){kind=$t("多页面待核查");reason=$t("至少 {0} 个 URL 获得曝光，需判断是否覆盖相同意图。",{0:active.length});recommendation=$t("先区分语言、地域与搜索意图。多个 URL 不等于关键词冲突；未经核查不建议合并或重定向。");}
  else if(impressions>=500 && clicks/impressions<.01){kind=$t("点击率检查");reason=$t("曝光 {0}，点击率 {1}%。",{0:impressions,1:(clicks/impressions*100).toFixed(2)});recommendation=$t("结合排名与搜索结果样式检查标题和摘要，不把低点击率直接归因于文案。");}
  return {keyword,clicks,impressions,previous,position,pages,kind,reason,recommendation};
 }).sort((a,b)=>(a.kind===$t("观察")?1:0)-(b.kind===$t("观察")?1:0)||b.impressions-a.impressions);
}
export function delta(current:number,previous:number){return previous===0?(current===0?$t("持平"):$t("上期为 0")): `${current>=previous?'+':''}${((current/previous-1)*100).toFixed(1)}%`;}
export function safeLink(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}}
