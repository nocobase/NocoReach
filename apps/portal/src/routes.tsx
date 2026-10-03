import {analysisNavigation} from './analysis-navigation';
import {defineAppRoutes} from '@nocobase/portal-sdk/routing';
import {Navigate,useLocation,useParams} from 'react-router';
import {Sparkles,ListTodo,Workflow,Bot,Files,Globe,Search,Lightbulb,NotebookPen,Plug,Github,MessagesSquare,WandSparkles,Bookmark,Earth,ClipboardCheck,MessageSquareText,Package} from 'lucide-react';
const admin={roles:{anyOf:['root','admin']}};
// 关键词研究 is the 找新词 tab of 关键词 now; old links keep their query.
function ResearchLink(){const p=new URLSearchParams(useLocation().search);p.set('tab','research');return <Navigate to={`/keywords?${p}`} replace/>;}
function OpportunityLink(){const {opportunityId=''}=useParams();return <Navigate to={`/opportunities?item=${encodeURIComponent(opportunityId)}`} replace/>;}
export const registryRoutesEnabled=false;
export const appRoutes=defineAppRoutes([
 // Main line (洞察 → 机会 → 任务) sits at the top without a group title; groups follow.
 {name:'nav-ai',path:'/nav/ai',element:<Navigate to="/project" replace/>,resource:{meta:{label:'AI 团队',priority:7,group:true,acl:{type:'authenticated'}}}},
 // Data pages by what they show (2026-10-03): the site and product, search, community. No 数据总览: 洞察 is the overview.
 {name:'nav-site',path:'/nav/site',element:<Navigate to="/website" replace/>,resource:{meta:{label:'网站与产品',priority:4,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-search',path:'/nav/search',element:<Navigate to="/seo-opportunities" replace/>,resource:{meta:{label:'搜索',priority:5,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-community',path:'/nav/community',element:<Navigate to="/data/github" replace/>,resource:{meta:{label:'社区',priority:6,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-analysis',path:'/nav/analysis',element:<Navigate to="/website" replace/>},
 {name:'nav-settings',path:'/nav/settings',element:<Navigate to="/connections" replace/>,resource:{meta:{label:'设置',priority:8,group:true,acl:{type:'authenticated'}}}},
 {name:'growth-overview',path:'/home',access:admin,lazy:()=>import('./pages/strategy'),resource:{meta:{label:'洞察',icon:<Sparkles/>,priority:1,acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',access:admin,lazy:()=>import('./pages/optimization-work'),resource:{meta:{label:'任务',icon:<ListTodo/>,priority:3,badge:'tasks',acl:{type:'authenticated'}}}},
 {name:'content-index',path:'/content',access:admin,lazy:()=>import('./pages/content-index'),resource:{meta:{label:'页面',icon:<Files/>,priority:2,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'agents',path:'/agents',access:admin,lazy:()=>import('./pages/agents'),resource:{meta:{label:'Agent',icon:<Bot/>,priority:1,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'playbooks',path:'/playbooks',access:admin,lazy:()=>import('./pages/playbooks'),resource:{meta:{label:'做法',icon:<Workflow/>,priority:3,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'flows-legacy',path:'/flows',element:<Navigate to="/playbooks" replace/>},
 {name:'skills',path:'/skills',access:admin,lazy:()=>import('./pages/skills'),resource:{meta:{label:'Skills',icon:<WandSparkles/>,priority:4,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'project-settings',path:'/project',access:admin,lazy:()=>import('./pages/project-knowledge'),resource:{meta:{label:'项目知识',icon:<NotebookPen/>,priority:5,parent:'nav-ai',acl:{type:'authenticated'}}}},
 {name:'opportunity-library',path:'/opportunities',access:admin,lazy:()=>import('./pages/strategy/library'),resource:{meta:{label:'机会',icon:<Lightbulb/>,priority:2,badge:'opportunities',acl:{type:'authenticated'}}}},
 // The separate discussion page is gone (decisions happen on 机会, discussion in the task); old links open the item.
 {name:'opportunity-discussion',path:'/home/opportunities/:opportunityId',element:<OpportunityLink/>},
 {name:'opportunity-explore',path:'/home/explore',access:admin,lazy:()=>import('./pages/strategy')},
 {name:'task-work',path:'/actions/:taskId',access:admin,lazy:()=>import('./pages/task-work')},
 {name:'data-connections',path:'/connections',access:admin,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'数据接入',icon:<Plug/>,priority:1,parent:'nav-settings',acl:{type:'authenticated'}}}},
 {name:'data-overview',path:'/data',element:<Navigate to="/home" replace/>},
 {name:'data-downloads',path:'/data/downloads',access:admin,lazy:()=>import('./pages/data-downloads'),resource:{meta:{label:'下载量',icon:<Package/>,priority:4,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'data-github',path:'/data/github',access:admin,lazy:()=>import('./pages/data-github'),resource:{meta:{label:'GitHub',icon:<Github/>,priority:1,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'data-community',path:'/data/community',access:admin,lazy:()=>import('./pages/data-community'),resource:{meta:{label:'讨论',icon:<MessagesSquare/>,priority:2,parent:'nav-community',acl:{type:'authenticated'}}}},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'访问',icon:<Globe/>,priority:1,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/search-performance'),resource:{meta:{label:'搜索表现',icon:<Search/>,priority:1,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'saved-keywords',path:'/keywords',access:admin,lazy:()=>import('./pages/saved-keywords'),resource:{meta:{label:'关键词',icon:<Bookmark/>,priority:2,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'site-audit',path:'/audit',access:admin,lazy:()=>import('./pages/site-audit'),resource:{meta:{label:'审计',icon:<ClipboardCheck/>,priority:3,parent:'nav-site',acl:{type:'authenticated'}}}},
 {name:'keyword-research',path:'/research/keywords',access:admin,element:<ResearchLink/>},
 {name:'domain-overview',path:'/research/domain',access:admin,lazy:()=>import('./pages/domain-overview'),resource:{meta:{label:'竞品',icon:<Earth/>,priority:3,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'ai-search',path:'/ai-search',access:admin,lazy:()=>import('./pages/ai-search'),resource:{meta:{label:'AI 搜索',icon:<MessageSquareText/>,priority:4,parent:'nav-search',acl:{type:'authenticated'}}}},
 {name:'project-strategy',path:'/project/strategy',access:admin,element:<Navigate to="/home" replace/>},
 {name:'insights-opportunities',path:'/insights',element:<Navigate to="/home" replace/>},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>},
 // Old 搜索表现 tabs: overview and performance open the page; 关键词选题 (saved research candidates) is now 关键词.
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/search-performance')},
 {name:'search-performance-legacy',path:'/seo-opportunities/performance',lazy:()=>import('./pages/search-performance')},
 {name:'search-opportunities-legacy',path:'/seo-opportunities/opportunities',element:<Navigate to="/keywords" replace/>},
 ...analysisNavigation.website.map(item=>({name:'website-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
]);
