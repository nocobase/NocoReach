import {useEffect,useSyncExternalStore} from 'react';
import {useLocation} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {useProject} from '@/pages/reach-data';
// Menu counts (SPEC §5): 任务 shows the tasks waiting for you, 机会 the new opportunities not yet decided. Pages that change
// them call refreshNavBadges(); the menu also refreshes on navigation, when the window regains focus and every minute.
type Counts={tasks:number;opportunities:number};
let counts:Counts={tasks:0,opportunities:0};
const listeners=new Set<()=>void>(),EVENT='nocoreach:badges';
export const refreshNavBadges=()=>window.dispatchEvent(new Event(EVENT));
export const badgeLabels:Record<keyof Counts,(n:number)=>string>={tasks:n=>`${n} 个任务等你确认`,opportunities:n=>`${n} 个新机会`};
export function useNavBadge(key?:unknown):{count:number;label:string}{
 const k=typeof key==='string'&&key in counts?key as keyof Counts:null;
 const count=useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l);};},()=>k?counts[k]:0);
 return {count,label:k&&count?badgeLabels[k](count):''};
}
export function NavBadgeLoader(){
 const {project}=useProject(),{pathname}=useLocation();
 useEffect(()=>{if(!project)return;let alive=true;
  const load=()=>void api.action<Counts>('nrStrategy','badges',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).then(c=>{if(!alive||!c)return;counts={tasks:Number(c.tasks)||0,opportunities:Number(c.opportunities)||0};listeners.forEach(l=>l());}).catch(()=>undefined);
  load();const timer=window.setInterval(load,60000);window.addEventListener(EVENT,load);window.addEventListener('focus',load);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener(EVENT,load);window.removeEventListener('focus',load);};
 },[project?.id,pathname]);
 return null;
}
