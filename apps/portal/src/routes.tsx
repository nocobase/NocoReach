import {analysisNavigation} from './analysis-navigation';
import {defineAppRoutes} from '@nocobase/portal-sdk/routing';
import {Navigate} from 'react-router';
import {LayoutDashboard,ListTodo,Settings2,Files} from 'lucide-react';
const admin={roles:{anyOf:['root','admin']}};
export const registryRoutesEnabled=false;
export const appRoutes=defineAppRoutes([
 {name:'growth-overview',path:'/home',access:admin,lazy:()=>import('./pages/strategy'),resource:{meta:{label:'概览',icon:<LayoutDashboard/>,priority:1,acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',access:admin,lazy:()=>import('./pages/optimization-work'),resource:{meta:{label:'优化工作',icon:<ListTodo/>,priority:2,acl:{type:'authenticated'}}}},
 {name:'content-index',path:'/content',access:admin,lazy:()=>import('./pages/content-index'),resource:{meta:{label:'内容',icon:<Files/>,priority:3,acl:{type:'authenticated'}}}},
 {name:'project-settings',path:'/project',access:admin,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'设置',icon:<Settings2/>,priority:4,acl:{type:'authenticated'}}}},
 {name:'opportunity-library',path:'/opportunities',access:admin,lazy:()=>import('./pages/strategy/library')},
 {name:'opportunity-discussion',path:'/home/opportunities/:opportunityId',access:admin,lazy:()=>import('./pages/strategy')},
 {name:'opportunity-explore',path:'/home/explore',access:admin,lazy:()=>import('./pages/strategy')},
 {name:'task-work',path:'/actions/:taskId',access:admin,lazy:()=>import('./pages/task-work')},
 {name:'data-connections',path:'/connections',access:admin,lazy:()=>import('./pages/reach-workspace')},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/reach-workspace')},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/reach-workspace')},
 {name:'keyword-research',path:'/research/keywords',lazy:()=>import('./pages/keyword-research')},
 {name:'project-strategy',path:'/project/strategy',access:admin,element:<Navigate to="/home" replace/>},
 {name:'insights-opportunities',path:'/insights',element:<Navigate to="/home" replace/>},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>},
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/reach-workspace')},
 ...analysisNavigation.website.map(item=>({name:'website-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
 ...analysisNavigation.search.map(item=>({name:'search-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace')})),
]);
