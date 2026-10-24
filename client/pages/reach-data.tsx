import { useMessageState, $t, $legacyText } from "#i18n";
import {useWorkspaceCache} from './workspace-cache';
import {useEffect,useState} from 'react';
import {useLocation} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {currentProjectId,rememberProject} from './current-project';
import {confirmUnsavedLeave} from '#components/reach/confirm';
import type {SupportedLocale} from '../../shared/i18n/locales';
export type Project={id:number;name:string;domains:string[];language?:SupportedLocale;end:string;importedAt:string;description:string;audience:string;market:string;analyticsPropertyId:string;searchConsoleProperty:string;positioning?:string;writingStyle?:string;terminology?:string;competitors?:string;keyPages?:string;contentLanguage?:string;doNotChange?:string;memory?:Record<string,string>};
export type Snapshot={id:number;key:string;payload:Project};
export async function records<T>(resource:string,filter?:object):Promise<T[]>{
 const result:T[]=[];
 for(let page=1;;page++){
  const r=await api.action<{data:T[];meta?:{count?:number}}>(resource,'list',{query:{page,pageSize:100,sort:'-createdAt',...(filter?{filter:JSON.stringify(filter)}:{})},unwrap:'none'});
  if(!Array.isArray(r.data))throw new Error($t('reachData.dataResponseMalformedTryAgain'));
  result.push(...r.data);
  if(r.data.length<100||(r.meta?.count!==undefined&&result.length>=r.meta.count))return result;
 }
}
// The project's tasks, newest first, through NocoReach so 成员 see them too (2026-10-08; the table itself is for NocoBase admins).
export async function taskRecords<T>(projectId:number):Promise<T[]>{const r=await api.action<T[]>('nrTaskWork','list',{method:'POST',body:{projectId:String(projectId)},unwrap:'data'});if(!Array.isArray(r))throw new Error($t('reachData.dataResponseMalformedTryAgain'));return r;}
export async function persist(resource:string,body:unknown,id?:number){return api.action(resource,id?'update':'create',{method:'POST',body,query:id?{filterByTk:String(id)}:undefined});}
export type ProjectList=Project[];
// All projects (nrProjects:list). NocoBase 3 has no generic table API, so the classic fallback to the single project
// record (`nrSnapshots:list`) is gone: an empty list is the answer, and the page offers to create the first project.
export async function loadProjects():Promise<Project[]>{const list=await api.action<Project[]>('nrProjects','list',{method:'POST',body:{},unwrap:'data'});if(!Array.isArray(list))throw new Error($t('reachData.dataResponseMalformedTryAgain'));return list;}
export function useProjects(){const cache=useWorkspaceCache();const [list,setList]=useState<Project[]|undefined>(()=>cache.peek<Project[]>('projects')),[error,setError]=useMessageState('');
 useEffect(()=>{let active=true,sequence=0;const load=()=>{const request=++sequence;return cache.load('projects',loadProjects,true).then(r=>{if(active&&request===sequence){setList(r);setError('');}}).catch(e=>{if(active&&request===sequence)setError(() => ($legacyText(String(e))));});};void load();window.addEventListener('reach-project-saved',load);return()=>{active=false;window.removeEventListener('reach-project-saved',load);};},[]);
 return {projects:list,error};}
// The project chosen in the header (kept in this browser); the first project when that one no longer exists.
export function useProject(){
 const {projects,error:listError}=useProjects();const [timedOut,setTimedOut]=useState(false);
 useEffect(()=>{if(projects)return;const t=window.setTimeout(()=>setTimedOut(true),15000);return()=>window.clearTimeout(t);},[projects]);
 const location=useLocation();
 const linkedProject=/^\/actions\/[^/]+\/?$/.test(location.pathname)?new URLSearchParams(location.search).get('projectId'):null;
 const wanted=linkedProject===null?currentProjectId():/^[1-9]\d{0,15}$/.test(linkedProject)?Number(linkedProject):NaN;
 const project=projects?.find(p=>Number(p.id)===wanted)||(linkedProject===null?projects?.[0]:undefined);
 useEffect(()=>{if(project&&Number(project.id)!==currentProjectId())rememberProject(Number(project.id));},[project?.id]);
 const error=listError||(projects&&(!projects.length||(linkedProject!==null&&!project))?$t('reachData.projectDataNotFound'):'')||(!projects&&timedOut?$t('reachData.loadingProjectTimedOutReload'):'');
 return {record:project?{id:Number(project.id),key:'project',payload:project}:undefined,project,error};
}
export function ProjectIcon({projectId,name}:{projectId?:number;name?:string}){const cache=useWorkspaceCache();const [icon,setIcon]=useState<string|null>(()=>cache.peek<{dataUrl:string|null}>(`project-icon:${projectId}`)?.dataUrl??null),[broken,setBroken]=useState(false);
 useEffect(()=>{if(!projectId)return;let active=true;void cache.load(`project-icon:${projectId}`,()=>api.action<{dataUrl:string|null}>('nrProjectIcon','get',{method:'POST',body:{projectId:String(projectId)},unwrap:'data'})).then(r=>{if(active)setIcon(r?.dataUrl||null);}).catch(()=>undefined);return()=>{active=false;};},[projectId]);
 return icon&&!broken?<img src={icon} alt="" data-project-icon className="size-8 shrink-0 rounded-lg border border-border bg-white object-contain p-0.5" onError={()=>setBroken(true)}/>:<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">{name?.slice(0,1)||'·'}</span>;}
export function ProjectIdentity(){const {project,error}=useProject();return <div className="flex min-w-0 items-center gap-3" title={error||$t('common.currentProject')}><ProjectIcon projectId={project?.id} name={project?.name}/><div className="min-w-0"><div className="truncate text-sm font-semibold">{project?.name||(error?$t('common.notLoadProject'):$t('common.loadingProject'))}</div><div className="truncate text-xs text-muted-foreground">{project?.domains.join(', ')||$t('common.currentProject')}</div></div></div>;}
// A link clicked with unsaved input is held while the application's dialog asks; if leaving is confirmed the same link
// is clicked again and let through (UI review 2026-10-22: no browser confirm).
export function useUnsavedWarning(dirty:boolean){
 useEffect(()=>{if(!dirty)return;let passing:Element|null=null;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};const click=(e:MouseEvent)=>{const link=(e.target as Element)?.closest?.('a[href]');if(!link)return;if(passing===link){passing=null;return;}e.preventDefault();e.stopPropagation();void confirmUnsavedLeave().then(ok=>{if(ok){passing=link;(link as HTMLElement).click();}});};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[dirty]);
}
