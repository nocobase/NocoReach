import {createContext,useContext,useEffect,useRef,useState,type PropsWithChildren} from 'react';
// Lives only inside the authenticated layout. Logout/unmount discards all data.
type Entry={value?:unknown;at:number;pending?:Promise<unknown>};
class WorkspaceCache{
 private rows=new Map<string,Entry>();
 peek<T>(key:string):T|undefined{return this.rows.get(key)?.value as T|undefined;}
 async load<T>(key:string,fetcher:()=>Promise<T>,force=false):Promise<T>{
  const old=this.rows.get(key);
  if(old?.pending)return old.pending as Promise<T>;
  if(!force&&old?.value!==undefined&&Date.now()-old.at<30000)return old.value as T;
  const entry:Entry={value:old?.value,at:old?.at||0};
  const request=fetcher().then(value=>{entry.value=value;entry.at=Date.now();return value;}).finally(()=>{entry.pending=undefined;});
  entry.pending=request;this.rows.set(key,entry);return request;
 }
}
const Context=createContext<WorkspaceCache|null>(null);
export function WorkspaceCacheProvider({children}:PropsWithChildren){const cache=useRef<WorkspaceCache|null>(null);if(!cache.current)cache.current=new WorkspaceCache();return <Context.Provider value={cache.current}>{children}</Context.Provider>;}
export function useWorkspaceCache(){const c=useContext(Context);if(!c)throw new Error('Workspace cache requires authenticated layout');return c;}
// Pages show the last response for a key at once and refresh it quietly, so revisiting a page does not start from a blank loading state.
// A null key (e.g. an unfinished custom date range) keeps what is on screen; responses for an older key are ignored.
export function useFreshData<T>(key:string|null,fetcher:()=>Promise<T>):{data?:T;error?:unknown}{
 const cache=useWorkspaceCache();const [state,setState]=useState<{key:string|null;data?:T;error?:unknown}>(()=>({key,data:key?cache.peek<T>(key):undefined}));
 useEffect(()=>{if(!key)return;let active=true;setState({key,data:cache.peek<T>(key)});cache.load(key,fetcher,true).then(data=>{if(active)setState({key,data});},error=>{if(active)setState(s=>({...s,error}));});return()=>{active=false;};},[key]);
 return !key||state.key===key?state:{data:cache.peek<T>(key)};
}
export function PageSkeleton({title}:{title:string}){return <div className="nr-app nr-page-skeleton" role="status" aria-label="正在读取页面数据" aria-busy="true"><header className="nr-heading"><h1>{title}</h1></header><div className="nr-grid" aria-label="数据区域正在加载">{[1,2,3,4].map(i=><section className="nr-panel" key={i}><div style={{height:16,width:'35%',background:'var(--muted, #edf0f2)',borderRadius:4}}/><div style={{height:96,marginTop:20,background:'var(--muted, #edf0f2)',borderRadius:6}}/></section>)}</div></div>;}
