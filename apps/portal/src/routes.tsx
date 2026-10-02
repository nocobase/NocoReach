import {analysisNavigation} from './analysis-navigation';
import {defineAppRoutes} from '@nocobase/portal-sdk/routing';
import {Navigate,useParams} from 'react-router';
import {Sparkles,ListTodo,Workflow,Bot,Files,Globe,Search,Lightbulb,NotebookPen,Plug,LayoutGrid,Github,MessagesSquare,WandSparkles,Bookmark,Telescope} from 'lucide-react';
const admin={roles:{anyOf:['root','admin']}};
function OpportunityLink(){const {opportunityId=''}=useParams();return <Navigate to={`/opportunities?item=${encodeURIComponent(opportunityId)}`} replace/>;}
export const registryRoutesEnabled=false;
export const appRoutes=defineAppRoutes([
 // Main line (洞察 → 机会 → 任务) sits at the top without a group title; groups follow.
 {name:'nav-ai',path:'/nav/ai',element:<Navigate to="/project" replace/>,resource:{meta:{label:'AI 团队',priority:4,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-analysis',path:'/nav/analysis',element:<Navigate to="/website" replace/>,resource:{meta:{label:'数据分析',priority:5,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-settings',path:'/nav/settings',element:<Navigate to="/connections" replace/>,resource:{meta:{label:'设置',priority:6,group:true,acl:{type:'authenticated'}}}},
 {name:'growth-overview',path:'/home',access:admin,lazy:()=>import('./pages/strategy'),resource:{meta:{label:'洞察',icon:<Sparkles/>,priority:1,acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',access:admin,lazy:()=>import('./pages/optimization-work'),resource:{meta:{label:'任务',icon:<ListTodo/>,priority:3,badge:'tasks',acl:{type:'authenticated'}}}},
 {name:'content-index',path:'/content',access:admin,lazy:()=>import('./pages/content-index'),resource:{meta:{label:'内容',icon:<Files/>,priority:4,parent:'nav-analysis',acl:{type:'authenticated'}}}},
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
 {name:'data-overview',path:'/data',access:admin,lazy:()=>import('./pages/data-overview'),resource:{meta:{label:'数据总览',icon:<LayoutGrid/>,priority:0,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'data-github',path:'/data/github',access:admin,lazy:()=>import('./pages/data-github'),resource:{meta:{label:'GitHub',icon:<Github/>,priority:5,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'data-community',path:'/data/community',access:admin,lazy:()=>import('./pages/data-community'),resource:{meta:{label:'社区',icon:<MessagesSquare/>,priority:6,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'网站表现',icon:<Globe/>,priority:1,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/search-performance'),resource:{meta:{label:'搜索表现',icon:<Search/>,priority:2,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 // 数据分析 order (SPEC §5): 数据总览、网站表现、搜索表现、关键词、内容、GitHub、社区，then 关键词研究 for any keyword.
 {name:'saved-keywords',path:'/keywords',access:admin,lazy:()=>import('./pages/saved-keywords'),resource:{meta:{label:'关键词',icon:<Bookmark/>,priority:3,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'keyword-research',path:'/research/keywords',access:admin,lazy:()=>import('./pages/keyword-research'),resource:{meta:{label:'关键词研究',icon:<Telescope/>,priority:7,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'project-strategy',path:'/project/strategy',access:admin,element:<Navigate to="/home" replace/>},
 {name:'insights-opportunities',path:'/insights',element:<Navigate to="/home" replace/>},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>},
 // Old 搜索表现 tabs: overview and performance open the page; 关键词选题 (saved research candidates) is now 关键词.
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/search-performance')},
 {name:'search-performance-legacy',path:'/seo-opportunities/performance',lazy:()=>import('./pages/search-performance')},
 {name:'search-opportunities-legacy',path:'/seo-opportunities/opportunities',element:<Navigate to="/keywords" replace/>},
 ...analysisNavigation.website.map(item=>({name:'website-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
]);
