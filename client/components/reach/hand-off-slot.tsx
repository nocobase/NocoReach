import { $t } from "#i18n";
import {Checkbox} from '#components/ui/checkbox';
import {useEffect,useLayoutEffect,useState,useSyncExternalStore,type ReactElement,type ReactNode} from 'react';
// 交给 Agent on a data page (2026-10-08 user decisions): the page's lists can be ticked, and once anything is ticked a bar
// floats at the bottom of the window with the count and 交给 Agent (first a button at the top right, which was far from
// rows ticked lower down). Each list is a source: what is ticked in it and how it becomes a task. The bar adds them up;
// lists ticked together on one page (GitHub Issues and Discussions) go into the same task.
export type HandOffDraft={title:string;objective:string;brief:string;signalKey?:string};
export type HandOffSource={
 count:number;
 // What the rows are, for the bar's count (“个关键词已选”); “项已选” otherwise.
 noun?:string;
 // The list's other bulk actions (保存, 导出, 删除…), shown in the bar before 交给 Agent.
 actions?:ReactNode;
 // The ticked rows as one task; sources with a draft are combined.
 draft?:()=>HandOffDraft;playbookId?:string;description?:string;page?:string;
 // A source with its own dialog (keywords pick 做法 by their own rule).
 open?:()=>void;
 // Unticks the rows once they are handed off.
 clear?:()=>void;
};
// One page is shown at a time, so the sources live in one place: a list adds itself while it is shown and takes itself
// off when it goes (another tab, another page).
const sources=new Map<string,HandOffSource>(),listeners=new Set<()=>void>();
let version=0;
const changed=()=>{version++;listeners.forEach(l=>l());};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export function useHandOffSources():HandOffSource[]{
 useSyncExternalStore(subscribe,()=>version);
 return [...sources.values()];
}
// Registers a source while the list is shown; `null` takes it off (no list on this tab, nothing to hand off).
export function useHandOffSource(id:string,source:HandOffSource|null):void{
 // Kept up to date on every render (the callbacks and the list's own actions change); the bar re-renders, the page not.
 useLayoutEffect(()=>{if(source)sources.set(id,source);else if(!sources.has(id))return;else sources.delete(id);changed();});
 useEffect(()=>()=>{sources.delete(id);changed();},[id]);
}
// Ticked rows of one list, by key; keys no longer listed (another range, a refresh) drop out.
export function useSelection(keys:readonly string[]){
 const [picked,setPicked]=useState<ReadonlySet<string>>(new Set()),shown=new Set(keys);
 const selected=[...picked].filter(k=>shown.has(k));
 const all=keys.length>0&&selected.length===keys.length;
 return {selected,size:selected.length,all,some:selected.length>0&&!all,
  has:(k:string)=>picked.has(k)&&shown.has(k),
  toggle:(k:string,on:boolean)=>setPicked(s=>{const n=new Set(s);if(on)n.add(k);else n.delete(k);return n;}),
  toggleAll:(on:boolean)=>setPicked(on?new Set(keys):new Set()),
  clear:()=>setPicked(new Set())};
}
export type Selection=ReturnType<typeof useSelection>;
// The checkbox of one row, and the one that ticks a whole list (in its header row).
export function RowCheck({selection,k,label}:{selection:Selection;k:string;label?:string}):ReactElement{
 return <Checkbox checked={selection.has(k)} onCheckedChange={on=>selection.toggle(k,Boolean(on))} onClick={e=>e.stopPropagation()} aria-label={label||$t('common.selectRow')} data-row-check=""/>;
}
export function AllCheck({selection,count}:{selection:Selection;count:number}):ReactElement{
 return <Checkbox checked={selection.all} indeterminate={selection.some} disabled={!count} onCheckedChange={on=>selection.toggleAll(Boolean(on))} aria-label={$t('common.select')} data-all-check=""/>;
}
// A list whose rows can be ticked for 交给 Agent: its selection, registered as a source while the list is shown
// (`rows` undefined: not shown). `source` turns the ticked rows into the task.
export function useTickedList<T>(id:string,rows:readonly T[]|undefined,keyOf:(row:T)=>string,source:(ticked:T[])=>Omit<HandOffSource,'count'|'clear'>):Selection&{ticked:T[]}{
 const list=rows||[],selection=useSelection(list.map(keyOf)),ticked=list.filter(r=>selection.has(keyOf(r)));
 useHandOffSource(id,rows?{...source(ticked),count:ticked.length,clear:selection.clear}:null);
 return {...selection,ticked};
}
