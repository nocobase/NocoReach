import {createContext,useContext,useEffect,useRef,useState,type PropsWithChildren} from 'react';
import {PageSkeleton as SharedSkeleton} from '@/components/reach/states';
// Lives only inside the authenticated layout. Responses are also kept in this tab's sessionStorage so a reload or a page
// opened again shows the last data at once while it refreshes; leaving the layout (logout) discards them all.
type Entry={value?:unknown;at:number;pending?:Promise<unknown>};
const PREFIX='nr-cache:',MAX_ENTRY=1500000;
// Only the data pages' reports are kept across reloads; lists the app steers by (projects, tasks) always come fresh.
const kept=(key:string)=>key.startsWith('data-view:');
function stored(key:string):{value:unknown;at:number}|undefined{if(!kept(key))return undefined;try{const raw=sessionStorage.getItem(PREFIX+key);return raw?JSON.parse(raw):undefined;}catch{return undefined;}}
function store(key:string,value:unknown,at:number){if(!kept(key))return;let raw:string;try{raw=JSON.stringify({value,at});}catch{return;}if(raw.length>MAX_ENTRY)return;
 for(let tries=0;tries<3;tries++){try{sessionStorage.setItem(PREFIX+key,raw);return;}catch{
  // Full: drop the oldest saved responses and try again.
  const old=Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX)).map(k=>({k,at:stored(k.slice(PREFIX.length))?.at||0})).sort((x,y)=>x.at-y.at).slice(0,5);if(!old.length)return;for(const o of old)sessionStorage.removeItem(o.k);}}}
// Saved responses belong to the signed-in session: a different login in this tab starts empty.
function claim(){try{const t=localStorage.getItem('NOCOBASE_TOKEN')||'';let h=5381;for(let i=0;i<t.length;i++)h=(h*33+t.charCodeAt(i))>>>0;const owner=String(h);if(sessionStorage.getItem('nr-cache-owner')!==owner){clearStoredCache();sessionStorage.setItem('nr-cache-owner',owner);}}catch{/* no storage */}}
export function clearStoredCache(){try{for(const k of Object.keys(sessionStorage))if(k.startsWith(PREFIX))sessionStorage.removeItem(k);}catch{/* nothing kept */}}
class WorkspaceCache{
 private rows=new Map<string,Entry>();
 peek<T>(key:string):T|undefined{const row=this.rows.get(key);if(row?.value!==undefined)return row.value as T;const s=stored(key);if(s){this.rows.set(key,{value:s.value,at:s.at});return s.value as T;}return undefined;}
 async load<T>(key:string,fetcher:()=>Promise<T>,force=false):Promise<T>{
  const old=this.rows.get(key);
  if(old?.pending)return old.pending as Promise<T>;
  if(!force&&old?.value!==undefined&&Date.now()-old.at<30000)return old.value as T;
  const entry:Entry={value:old?.value,at:old?.at||0};
  const request=fetcher().then(value=>{entry.value=value;entry.at=Date.now();store(key,value,entry.at);return value;}).finally(()=>{entry.pending=undefined;});
  entry.pending=request;this.rows.set(key,entry);return request;
 }
}
const Context=createContext<WorkspaceCache|null>(null);
export function WorkspaceCacheProvider({children}:PropsWithChildren){const cache=useRef<WorkspaceCache|null>(null);if(!cache.current){claim();cache.current=new WorkspaceCache();}useEffect(()=>clearStoredCache,[]);return <Context.Provider value={cache.current}>{children}</Context.Provider>;}
export function useWorkspaceCache(){const c=useContext(Context);if(!c)throw new Error('Workspace cache requires authenticated layout');return c;}
// Pages show the last response for a key at once and refresh it quietly, so revisiting a page does not start from a blank loading state.
// A null key (e.g. an unfinished custom date range) keeps what is on screen; responses for an older key are ignored.
export function useFreshData<T>(key:string|null,fetcher:()=>Promise<T>):{data?:T;error?:unknown}{
 const cache=useWorkspaceCache();const [state,setState]=useState<{key:string|null;data?:T;error?:unknown}>(()=>({key,data:key?cache.peek<T>(key):undefined}));
 useEffect(()=>{if(!key)return;let active=true;setState({key,data:cache.peek<T>(key)});cache.load(key,fetcher,true).then(data=>{if(active)setState({key,data});},error=>{if(active)setState(s=>({...s,error}));});return()=>{active=false;};},[key]);
 return !key||state.key===key?state:{data:cache.peek<T>(key)};
}
export function PageSkeleton({title}:{title:string}){return <SharedSkeleton title={title}/>;}
