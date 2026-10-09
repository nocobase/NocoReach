import { $t } from "@/i18n";
import type {ReactElement} from 'react';
import {defineAppRoutes} from '@nocobase/app-client/plugins';
import {Navigate,useLocation,useParams} from 'react-router';
import {Sparkles,ListTodo,Workflow,Bot,Files,Globe,Search,Lightbulb,NotebookPen,Plug,Github,MessagesSquare,WandSparkles,Bookmark,Earth,ClipboardCheck,MessageSquareText,Package,Newspaper,MessageCircle,TrendingUp,AtSign,Hash,Slack,SlidersHorizontal,Users} from 'lucide-react';
// Every page is open to everyone who has joined (管理员 and 成员, 2026-10-08): who has joined is decided by NocoReach, not
// by NocoBase roles (MemberGate), and settings pages show 成员 what they can read without the change buttons.
// 关键词研究 is the 找新词 tab of 关键词 now; old links keep their query.
function ResearchLink(){const p=new URLSearchParams(useLocation().search);p.set('tab','research');return <Navigate to={`/keywords?${p}`} replace/>;}
function OpportunityLink(){const {opportunityId=''}=useParams();return <Navigate to={`/opportunities?item=${encodeURIComponent(opportunityId)}`} replace/>;}
export interface ReachRoute {name:string;path:string;element?:ReactElement;lazy?:()=>Promise<{default:React.ComponentType}>;resource?:{meta:{label:string;priority:number;group?:boolean;parent?:string;source?:string;badge?:string;icon?:ReactElement;acl:unknown}}}
export const reachPages:ReachRoute[]=[
 // Main line (洞察 → 机会 → 任务) sits at the top without a group title; groups follow.
 {name:'nav-ai',path:'/nav/ai',element:<Navigate to="/project" replace/>,resource:{meta:{get label(){return $t("AI 团队");},priority:7,group:true,acl:{type:'authenticated'}}}},
 // A data page with meta.source shows in the menu only once that source is connected (2026-10-04).
 // Data pages by what they show (2026-10-03): the site and product (GitHub and downloads too), search and market (with
 // trends and competitors; renamed 2026-10-04), community (forum, Hacker News, Reddit, X, Discord/Slack). No 数据总览: 洞察
 // is the overview. 数据接入 groups its sources the same way.
 {name:'nav-site',path:'/nav/site',element:<Navigate to="/website" replace/>,resource:{meta:{get label(){return $t("网站与产品");},priority:4,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-search',path:'/nav/search',element:<Navigate to="/seo-opportunities" replace/>,resource:{meta:{get label(){return $t("搜索与市场");},priority:5,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-community',path:'/nav/community',element:<Navigate to="/data/community" replace/>,resource:{meta:{get label(){return $t("社区");},priority:6,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-analysis',path:'/nav/analysis',element:<Navigate to="/website" replace/>},
 {name:'nav-settings',path:'/nav/settings',element:<Navigate to="/connections" replace/>,resource:{meta:{get label(){return $t("设置");},priority:8,group:true,acl:{type:'authenticated'}}}},
 {name:'growth-overview',path:'/home',lazy:()=>import('./pages/strategy'),resource:{meta:{get label(){return $t("洞察");},icon:<Sparkles/>,priority:1,acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',lazy:()=>import('./pages/optimization-work'),resource:{meta:{get label(){return $t("任务");},icon:<ListTodo/>,priority:3,badge:'tasks',acl:{type:'authenticated'}}}},
 {name:'content-index',path:'/content',lazy:()=>import('./pages/content-index'),resource:{meta:{source:'site',get label(){return $t("页面");},icon:<Files/>,priority:2,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'agents',path:'/agents',lazy:()=>import('./pages/agents'),resource:{meta:{label:'Agent',icon:<Bot/>,priority:1,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'playbooks',path:'/playbooks',lazy:()=>import('./pages/playbooks'),resource:{meta:{get label(){return $t("做法",undefined,"title");},icon:<Workflow/>,priority:3,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'flows-legacy',path:'/flows',element:<Navigate to="/playbooks" replace/>},
 {name:'skills',path:'/skills',lazy:()=>import('./pages/skills'),resource:{meta:{label:'Skills',icon:<WandSparkles/>,priority:4,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'project-settings',path:'/project',lazy:()=>import('./pages/project-knowledge'),resource:{meta:{get label(){return $t("项目知识");},icon:<NotebookPen/>,priority:5,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'analysis-rules',path:'/rules',lazy:()=>import('./pages/analysis-rules'),resource:{meta:{get label(){return $t("分析规则");},icon:<SlidersHorizontal/>,priority:6,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'opportunity-library',path:'/opportunities',lazy:()=>import('./pages/strategy/library'),resource:{meta:{get label(){return $t("机会",undefined,"title");},icon:<Lightbulb/>,priority:2,badge:'opportunities',acl:{type:'authenticated'}}}},
 // The separate discussion page is gone (decisions happen on 机会, discussion in the task); old links open the item.
 {name:'opportunity-discussion',path:'/home/opportunities/:opportunityId',element:<OpportunityLink/>},
 {name:'opportunity-explore',path:'/home/explore',lazy:()=>import('./pages/strategy')},
 {name:'task-work',path:'/actions/:taskId',lazy:()=>import('./pages/task-work')},
 {name:'data-connections',path:'/connections',lazy:()=>import('./pages/source-connections'),resource:{meta:{get label(){return $t("数据接入");},icon:<Plug/>,priority:1,parent:'nav-settings',acl:{type:'authenticated'}}}},
 {name:'members',path:'/members',lazy:()=>import('./pages/members'),resource:{meta:{get label(){return $t("成员");},icon:<Users/>,priority:2,parent:'nav-settings',acl:{type:'authenticated'}}}},
 {name:'data-overview',path:'/data',element:<Navigate to="/home" replace/>},
 {name:'data-downloads',path:'/data/downloads',lazy:()=>import('./pages/data-downloads'),resource:{meta:{source:'packages',get label(){return $t("下载量");},icon:<Package/>,priority:5,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'data-github',path:'/data/github',lazy:()=>import('./pages/data-github'),resource:{meta:{source:'github',label:'GitHub',icon:<Github/>,priority:4,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'data-community',path:'/data/community',lazy:()=>import('./pages/data-community'),resource:{meta:{source:'discourse',get label(){return $t("论坛");},icon:<MessagesSquare/>,priority:1,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-hackernews',path:'/data/hackernews',lazy:()=>import('./pages/data-hackernews'),resource:{meta:{source:'hackernews',label:'Hacker News',icon:<Newspaper/>,priority:2,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-reddit',path:'/data/reddit',lazy:()=>import('./pages/data-reddit'),resource:{meta:{source:'reddit',label:'Reddit',icon:<MessageCircle/>,priority:3,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-x',path:'/data/x',lazy:()=>import('./pages/data-x'),resource:{meta:{source:'x',label:'X',icon:<AtSign/>,priority:4,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-discord',path:'/data/discord',lazy:()=>import('./pages/data-discord'),resource:{meta:{source:'discord',label:'Discord',icon:<Hash/>,priority:5,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-slack',path:'/data/slack',lazy:()=>import('./pages/data-slack'),resource:{meta:{source:'slack',label:'Slack',icon:<Slack/>,priority:6,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-chat',path:'/data/chat',element:<Navigate to="/data/discord" replace/>},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/data-website'),resource:{meta:{source:'ga4',get label(){return $t("访问");},icon:<Globe/>,priority:1,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/search-performance'),resource:{meta:{source:'gsc',get label(){return $t("搜索表现");},icon:<Search/>,priority:1,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'saved-keywords',path:'/keywords',lazy:()=>import('./pages/saved-keywords'),resource:{meta:{get label(){return $t("关键词");},icon:<Bookmark/>,priority:2,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'site-audit',path:'/audit',lazy:()=>import('./pages/site-audit'),resource:{meta:{source:'site',get label(){return $t("审计");},icon:<ClipboardCheck/>,priority:3,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'keyword-research',path:'/research/keywords',element:<ResearchLink/>},
 {name:'data-trends',path:'/trends',lazy:()=>import('./pages/data-trends'),resource:{meta:{source:'trends',get label(){return $t("趋势");},icon:<TrendingUp/>,priority:3,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'domain-overview',path:'/research/domain',lazy:()=>import('./pages/competitors-page'),resource:{meta:{get label(){return $t("竞品",undefined,"title");},icon:<Earth/>,priority:4,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'ai-search',path:'/ai-search',lazy:()=>import('./pages/ai-search'),resource:{meta:{source:'dataforseo',get label(){return $t("AI 搜索");},icon:<MessageSquareText/>,priority:5,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'project-strategy',path:'/project/strategy',element:<Navigate to="/home" replace/>},
 {name:'insights-opportunities',path:'/insights',element:<Navigate to="/home" replace/>},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>},
 // Old 搜索表现 tabs: overview and performance open the page; 关键词选题 (saved research candidates) is now 关键词.
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/search-performance')},
 {name:'search-performance-legacy',path:'/seo-opportunities/performance',lazy:()=>import('./pages/search-performance')},
 {name:'search-opportunities-legacy',path:'/seo-opportunities/opportunities',element:<Navigate to="/keywords" replace/>},
 // Old 访问 sub-pages (概览、来源、页面、转化) are tabs of /website now.
 ...['overview','sources','conversion'].map(key=>({name:'website-'+key,path:'/website/'+key,element:<Navigate to="/website" replace/>})),
 {name:'website-pages',path:'/website/pages',element:<Navigate to="/website?tab=pages" replace/>},
];
export const reachAppRoutes=defineAppRoutes(reachPages.map(page=>({name:page.name,path:page.path,auth:'required' as const,authz:'skip' as const,...(page.lazy?{componentLoader:page.lazy}:{componentLoader:async()=>({default:()=>page.element??null})})})));
