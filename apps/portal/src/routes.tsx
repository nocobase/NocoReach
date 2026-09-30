import {analysisNavigation} from './analysis-navigation';
import {defineAppRoutes} from '@nocobase/portal-sdk/routing';
import {Navigate} from 'react-router';
import {LayoutDashboard,ListTodo,Files,Globe,Search,Lightbulb,NotebookPen,Plug,LayoutGrid,Github} from 'lucide-react';
const admin={roles:{anyOf:['root','admin']}};
export const registryRoutesEnabled=false;
export const appRoutes=defineAppRoutes([
 {name:'nav-work',path:'/nav/work',element:<Navigate to="/home" replace/>,resource:{meta:{label:'工作',priority:1,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-analysis',path:'/nav/analysis',element:<Navigate to="/website" replace/>,resource:{meta:{label:'数据分析',priority:2,group:true,acl:{type:'authenticated'}}}},
 {name:'nav-settings',path:'/nav/settings',element:<Navigate to="/project" replace/>,resource:{meta:{label:'设置',priority:3,group:true,acl:{type:'authenticated'}}}},
 {name:'growth-overview',path:'/home',access:admin,lazy:()=>import('./pages/strategy'),resource:{meta:{label:'概览',icon:<LayoutDashboard/>,priority:1,parent:'nav-work',acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',access:admin,lazy:()=>import('./pages/optimization-work'),resource:{meta:{label:'优化工作',icon:<ListTodo/>,priority:3,parent:'nav-work',acl:{type:'authenticated'}}}},
 {name:'content-index',path:'/content',access:admin,lazy:()=>import('./pages/content-index'),resource:{meta:{label:'内容',icon:<Files/>,priority:3,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'project-settings',path:'/project',access:admin,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'项目记忆',icon:<NotebookPen/>,priority:2,parent:'nav-settings',acl:{type:'authenticated'}}}},
 {name:'opportunity-library',path:'/opportunities',access:admin,lazy:()=>import('./pages/strategy/library'),resource:{meta:{label:'建议',icon:<Lightbulb/>,priority:2,parent:'nav-work',acl:{type:'authenticated'}}}},
 {name:'opportunity-discussion',path:'/home/opportunities/:opportunityId',access:admin,lazy:()=>import('./pages/strategy')},
 {name:'opportunity-explore',path:'/home/explore',access:admin,lazy:()=>import('./pages/strategy')},
 {name:'task-work',path:'/actions/:taskId',access:admin,lazy:()=>import('./pages/task-work')},
 {name:'data-connections',path:'/connections',access:admin,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'数据连接',icon:<Plug/>,priority:1,parent:'nav-settings',acl:{type:'authenticated'}}}},
 {name:'data-overview',path:'/data',access:admin,lazy:()=>import('./pages/data-overview'),resource:{meta:{label:'数据总览',icon:<LayoutGrid/>,priority:0,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'data-github',path:'/data/github',access:admin,lazy:()=>import('./pages/data-github'),resource:{meta:{label:'GitHub',icon:<Github/>,priority:4,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'网站表现',icon:<Globe/>,priority:1,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'搜索表现',icon:<Search/>,priority:2,parent:'nav-analysis',acl:{type:'authenticated'}}}},
 {name:'keyword-research',path:'/research/keywords',lazy:()=>import('./pages/keyword-research')},
 {name:'project-strategy',path:'/project/strategy',access:admin,element:<Navigate to="/home" replace/>},
 {name:'insights-opportunities',path:'/insights',element:<Navigate to="/home" replace/>},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>},
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/reach-workspace')},
 ...analysisNavigation.website.map(item=>({name:'website-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
 ...analysisNavigation.search.map(item=>({name:'search-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
]);
