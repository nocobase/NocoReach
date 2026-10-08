import { $t } from "@/i18n";
import {Checkbox} from '@/components/ui/checkbox';
import {useEffect,useLayoutEffect,useState,useSyncExternalStore,type ReactElement} from 'react';
// 交给 Agent on a data page (2026-10-08 user decision): one button at the top right of the page, and the page's lists can
// be ticked. Each list (or a single result such as 问 AI's answers) is a source: what is ticked in it and how it becomes
// a task. The button in the page header adds them up. A list ticked together with
// another on the same page (GitHub Issues and Discussions) goes into the same task.
export type HandOffDraft={title:string;objective:string;brief:string;signalKey?:string};
export type HandOffSource={
 count:number;
 // The thing being viewed rather than ticked rows (问 AI's answers): the button shows no number.
 single?:boolean;
 // Why the button is off while nothing is ticked, when "tick below" is not the reason.
 hint?:string;
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
 // The callbacks change on every render; the latest are kept without re-rendering the page.
 useLayoutEffect(()=>{if(source)sources.set(id,source);else sources.delete(id);});
 useEffect(()=>{changed();},[source===null,source?.count,source?.hint,source?.single]);
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
 return <Checkbox checked={selection.has(k)} onCheckedChange={on=>selection.toggle(k,Boolean(on))} onClick={e=>e.stopPropagation()} aria-label={label||$t("选择这一行")} data-row-check=""/>;
}
export function AllCheck({selection,count}:{selection:Selection;count:number}):ReactElement{
 return <Checkbox checked={selection.all} indeterminate={selection.some} disabled={!count} onCheckedChange={on=>selection.toggleAll(Boolean(on))} aria-label={$t("全选")} data-all-check=""/>;
}
// A list whose rows can be ticked for 交给 Agent: its selection, registered as a source while the list is shown
// (`rows` undefined: not shown). `source` turns the ticked rows into the task.
export function useTickedList<T>(id:string,rows:readonly T[]|undefined,keyOf:(row:T)=>string,source:(ticked:T[])=>Omit<HandOffSource,'count'|'clear'>):Selection&{ticked:T[]}{
 const list=rows||[],selection=useSelection(list.map(keyOf)),ticked=list.filter(r=>selection.has(keyOf(r)));
 useHandOffSource(id,rows?{...source(ticked),count:ticked.length,clear:selection.clear}:null);
 return {...selection,ticked};
}
