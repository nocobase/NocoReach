import { $t } from "#i18n";
import {useEffect,useSyncExternalStore} from 'react';
import {useLocation} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {useProject} from '#pages/reach-data';
// Menu counts (SPEC §5): 任务 shows the tasks waiting for you, 机会 the new opportunities not yet decided. Pages that change
// them call refreshNavBadges(); the menu also refreshes on navigation, when the window regains focus and every minute.
type Counts={tasks:number;opportunities:number};
let counts:Counts={tasks:0,opportunities:0};
const listeners=new Set<()=>void>(),EVENT='nocoreach:badges';
export const refreshNavBadges=()=>window.dispatchEvent(new Event(EVENT));
export const badgeLabels:Record<keyof Counts,(n:number)=>string>={tasks:n=>$t('navBadges.tasksNeed',{0:n}),opportunities:n=>$t('navBadges.newOpportunities',{0:n})};
export function useNavBadge(key?:unknown):{count:number;label:string}{
 const k=typeof key==='string'&&key in counts?key as keyof Counts:null;
 const count=useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>k?counts[k]:0);
 return {count,label:k&&count?badgeLabels[k](count):''};
}
// Connected sources for the menu (2026-10-04): a data page appears once its source is connected. Kept per project in this
// tab so the menu does not flicker on reload; refreshed with the counts. If it cannot be read at all, every page shows ('*').
export type NavSources=Record<string,boolean>;
let sources:NavSources|null=null;const sourceListeners=new Set<()=>void>();
const sourceKey=(id:number)=>`nr-menu-sources:${id}`;
export function useNavSources():NavSources|null{return useSyncExternalStore(l=>{sourceListeners.add(l);return()=>{sourceListeners.delete(l);};},()=>sources);}
function setSources(next:NavSources|null){sources=next;sourceListeners.forEach(l=>l());}
export function NavBadgeLoader(){
 const {project}=useProject(),{pathname}=useLocation();
 useEffect(()=>{if(!project)return;let alive=true;
  try{const saved=sessionStorage.getItem(sourceKey(project.id));setSources(saved?JSON.parse(saved):null);}catch{setSources(null);}
  const load=()=>{void api.action<Counts>('nrStrategy','badges',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).then(c=>{if(!alive||!c)return;counts={tasks:Number(c.tasks)||0,opportunities:Number(c.opportunities)||0};listeners.forEach(l=>l());}).catch(()=>undefined);
   void api.action<NavSources>('nrHealth','connected',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).then(s=>{if(!alive||!s)return;setSources(s);try{sessionStorage.setItem(sourceKey(project.id),JSON.stringify(s));}catch{/* kept in memory */}}).catch(()=>{if(alive&&!sources)setSources({'*':true});});};
  load();const timer=window.setInterval(load,60000);window.addEventListener(EVENT,load);window.addEventListener('focus',load);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener(EVENT,load);window.removeEventListener('focus',load);};
 },[project?.id,pathname]);
 return null;
}
