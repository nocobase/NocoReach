import {useWorkspaceCache} from './workspace-cache';
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
export type Project={id:number;name:string;domains:string[];end:string;importedAt:string;description:string;audience:string;market:string;analyticsPropertyId:string;searchConsoleProperty:string;positioning?:string;writingStyle?:string;terminology?:string;competitors?:string;keyPages?:string;contentLanguage?:string;doNotChange?:string};
export type Snapshot={id:number;key:string;payload:Project};
export async function records<T>(resource:string,filter?:object):Promise<T[]>{
 const result:T[]=[];
 for(let page=1;;page++){
  const r=await api.action<{data:T[];meta?:{count?:number}}>(resource,'list',{query:{page,pageSize:100,sort:'-createdAt',...(filter?{filter:JSON.stringify(filter)}:{})},unwrap:'none'});
  if(!Array.isArray(r.data))throw new Error('数据响应格式异常，请重试。');
  result.push(...r.data);
  if(r.data.length<100||(r.meta?.count!==undefined&&result.length>=r.meta.count))return result;
 }
}
export async function persist(resource:string,body:unknown,id?:number){return api.action(resource,id?'update':'create',{method:'POST',body,query:id?{filterByTk:String(id)}:undefined});}
export function useProject(){
 const cache=useWorkspaceCache();
 const [record,setRecord]=useState<Snapshot|undefined>(()=>cache.peek<Snapshot[]>('project:1')?.[0]),[error,setError]=useState('');
 useEffect(()=>{let active=true;const timer=window.setTimeout(()=>{if(active)setError('读取项目超时，请重新加载。');},15000);const load=()=>cache.load('project:1',()=>records<Snapshot>('nrSnapshots',{key:'project'}),true).then(r=>{if(active){window.clearTimeout(timer);if(!r[0])throw new Error('项目数据不存在');setRecord(r[0]);setError('');}}).catch(e=>{if(active){window.clearTimeout(timer);setError(String(e));}});void load();window.addEventListener('reach-project-saved',load);return()=>{active=false;window.clearTimeout(timer);window.removeEventListener('reach-project-saved',load);};},[]);
 return {record,project:record?.payload,error};
}
export function ProjectIdentity(){const {project,error}=useProject();return <div className="flex min-w-0 items-center gap-3" title={error||'当前项目'}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-900 text-sm font-semibold text-white">{project?.name?.slice(0,1)||'·'}</span><div className="min-w-0"><div className="truncate text-sm font-semibold">{project?.name||(error?'项目读取失败':'正在读取项目…')}</div><div className="truncate text-[11px] text-muted-foreground">{project?.domains.join(', ')||'当前项目'}</div></div></div>;}
export function useUnsavedWarning(dirty:boolean){
 useEffect(()=>{if(!dirty)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};const click=(e:MouseEvent)=>{const link=(e.target as Element)?.closest?.('a[href]');if(link&&!window.confirm('有未保存的修改，确定离开吗？')){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[dirty]);
}
