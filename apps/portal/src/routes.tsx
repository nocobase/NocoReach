import {analysisNavigation} from './analysis-navigation';
import {defineAppRoutes} from '@nocobase/portal-sdk/routing';
import {Navigate} from 'react-router';
import {LayoutDashboard,ChartNoAxesCombined,Search,ListTodo,DatabaseZap,Settings2,Globe,Waypoints,Files,Goal,TrendingUp,ScanSearch,Lightbulb,ClipboardList,FilePenLine,ChartColumnIncreasing} from 'lucide-react';
const websiteIcons={overview:<Globe/>,sources:<Waypoints/>,pages:<Files/>,conversion:<Goal/>};
const searchIcons={performance:<TrendingUp/>,opportunities:<Lightbulb/>};
export const registryRoutesEnabled=false;
export const appRoutes=defineAppRoutes([
 {name:'growth-overview',path:'/home',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'总览',icon:<LayoutDashboard/>,priority:1,acl:{type:'authenticated'}}}},
 {name:'website-performance',path:'/website',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'网站与产品',icon:<ChartNoAxesCombined/>,priority:2,acl:{type:'authenticated'}}}},
 {name:'search-growth',path:'/seo-opportunities',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'搜索与关键词',icon:<Search/>,priority:3,acl:{type:'authenticated'}}}},
 {name:'keyword-research',path:'/research/keywords',lazy:()=>import('./pages/keyword-research'),resource:{meta:{label:'关键词研究',icon:<ScanSearch/>,priority:3,parent:'search-growth',acl:{type:'authenticated'}}}},
 {name:'action-plan',path:'/action-plan',element:<Navigate to="/actions" replace/>,resource:{meta:{label:'行动计划',icon:<ClipboardList/>,priority:4,group:true,plannedItems:[{label:'行动草案',icon:<FilePenLine/>},{label:'效果复盘',icon:<ChartColumnIncreasing/>}],acl:{type:'authenticated'}}}},
 {name:'action-center',path:'/actions',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'任务列表',icon:<ListTodo/>,priority:1,parent:'action-plan',acl:{type:'authenticated'}}}},
 {name:'data-connections',path:'/connections',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'数据连接',icon:<DatabaseZap/>,priority:5,acl:{type:'authenticated'}}}},
 {name:'project-settings',path:'/project',lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:'项目设置',icon:<Settings2/>,priority:6,acl:{type:'authenticated'}}}},
 {name:'search-overview-legacy',path:'/seo-opportunities/overview',lazy:()=>import('./pages/reach-workspace')},
 ...analysisNavigation.website.map((item,index)=>({name:'website-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:item.label,icon:websiteIcons[item.key as keyof typeof websiteIcons],priority:index+1,parent:'website-performance',acl:{type:'authenticated' as const}}}})),
 ...analysisNavigation.search.map(item=>({name:'search-'+item.key,path:item.path,lazy:()=>import('./pages/reach-workspace'),resource:{meta:{label:item.label,icon:searchIcons[item.key as keyof typeof searchIcons],priority:item.key==='performance'?2:4,parent:'search-growth',acl:{type:'authenticated' as const}}}})),
]);
