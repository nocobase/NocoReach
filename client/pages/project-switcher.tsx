import { StatusBadge } from '#components/status-badge';
import { useMessageState, useNocoReachLocale, isChinese, $t, $legacyText } from "#i18n";
import {useState,type ReactElement,type ReactNode} from 'react';
import {Check,ChevronsUpDown,Plus} from 'lucide-react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '#components/ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '#components/ui/dropdown-menu';
import {Input} from '#components/ui/input';
import {ReachMark} from '#components/app-shell/brand';
import {ProjectIcon,useProject,useProjects,type Project} from './reach-data';
import {switchProject} from './current-project';
import {useBusinessAccess} from '#hooks/use-business-access';
// The project in the header: click to switch projects or add one (SPEC §3 多项目). Each project keeps its own data
// sources, analysis, opportunities and tasks; switching reloads the Portal on the chosen project.
export function ProjectSwitcher():ReactElement{
 useNocoReachLocale();
 const {project,error}=useProject(),{projects}=useProjects(),{can:canCreate}=useBusinessAccess('nrProjects.create');const [adding,setAdding]=useState(false);
 const label=<><ProjectIcon projectId={project?.id} name={project?.name}/><span className="sr-only min-w-0 text-left sm:not-sr-only"><span className="block truncate text-sm font-semibold">{project?.name||(projects?.length===0?$t('projectSwitcher.noProjectsYet'):error?$t('common.notLoadProject'):$t('common.loadingProject'))}</span><span className="block truncate text-xs text-muted-foreground">{project?.domains.join(', ')||(projects?.length===0?'':$t('common.currentProject'))}</span></span></>;
 return <>
  <DropdownMenu>
   <DropdownMenuTrigger render={<button type="button" aria-label={$t('projectSwitcher.switchProject')} data-project-switcher className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-muted"/>} title={error||$t('projectSwitcher.switchProject')}>
    {label}<ChevronsUpDown className="hidden size-4 shrink-0 text-muted-foreground sm:block"/>
   </DropdownMenuTrigger>
   <DropdownMenuContent align="start" className="w-72">
    {(projects||[]).map((p:Project)=><DropdownMenuItem key={p.id} onClick={()=>{if(Number(p.id)!==Number(project?.id))switchProject(Number(p.id));}} className="gap-3 py-1.5" data-project={p.id}>
     <ProjectIcon projectId={p.id} name={p.name}/><span className="min-w-0 flex-1"><span className='flex min-w-0 items-center gap-1.5'><span className='truncate font-medium'>{p.name}</span>{p.demo?<StatusBadge size="sm">{$t('demoData.badge')}</StatusBadge>:null}</span><span className="block truncate text-xs text-muted-foreground">{p.domains?.join(', ')}</span></span>{Number(p.id)===Number(project?.id)?<Check className="size-4"/>:null}
    </DropdownMenuItem>)}
    {canCreate?<><DropdownMenuSeparator/>
    <DropdownMenuItem onClick={()=>setAdding(true)} className="gap-2 py-1.5"><Plus className="size-4"/>{$t('projectSwitcher.addProject')}</DropdownMenuItem></>:null}
   </DropdownMenuContent>
  </DropdownMenu>
  {adding&&canCreate?<AddProject onClose={()=>setAdding(false)}/>:null}
 </>;
}
// A new project needs only a name and its website; data sources are connected next, in 数据接入 of that project.
function AddProject({onClose}:{onClose:()=>void}):ReactElement{
 const [busy,setBusy]=useState(false);
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-md">
  <DialogHeader><DialogTitle>{$t('projectSwitcher.addProject')}</DialogTitle><DialogDescription>{$t('projectSwitcher.projectOwnDataSourcesDaily')}</DialogDescription></DialogHeader>
  <ProjectForm onBusy={setBusy} footer={submit=><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button>{submit}</DialogFooter>}/>
 </DialogContent></Dialog>;
}
// A fresh install has no project yet: every page shows this instead, until the first one is created (2026-10-07).
export function ProjectGate({children}:{children:ReactNode}):ReactNode{
 const {projects}=useProjects(),{can:canCreate,isPending}=useBusinessAccess('nrProjects.create');
 if(projects?.length!==0)return children;
 // Creating the first project requires the same grant as adding another project.
 if(isPending)return null;
 if(!canCreate)return <div className="grid flex-1 place-items-center p-6 md:p-8"><div data-first-project className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
  <ReachMark className="mb-4 size-10"/>
  <h1 className="text-xl font-semibold tracking-tight">{$t('projectSwitcher.noProjectsYet')}</h1>
  <p className="mt-1 text-sm text-muted-foreground">{$t('projectSwitcher.askAdminCreateProjectFirst')}</p>
 </div></div>;
 return <div className="grid flex-1 place-items-center p-6 md:p-8"><div data-first-project className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
  <ReachMark className="mb-4 size-10"/>
  <h1 className="text-xl font-semibold tracking-tight">{$t('projectSwitcher.createFirstProject')}</h1>
  <p className="mt-1 mb-5 text-sm text-muted-foreground">{$t('projectSwitcher.projectOneProductWebsiteAfter')}</p>
  <ProjectForm footer={submit=><div className="flex justify-end pt-1">{submit}</div>}/>
 </div></div>;
}
function ProjectForm({footer,onBusy}:{footer:(submit:ReactElement)=>ReactElement;onBusy?:(busy:boolean)=>void}):ReactElement{
 // The language of what the AI writes for this project; the creator's UI language to start with (2026-10-07).
 const [name,setName]=useState(''),[domain,setDomain]=useState(''),[language,setLanguage]=useState<'zh-CN'|'en-US'>(isChinese()?'zh-CN':'en-US'),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const working=(b:boolean)=>{setBusy(b);onBusy?.(b);};
 const create=async()=>{working(true);setError('');try{const p=await api.action<Project>('nrProjects','create',{method:'POST',body:{name,domain,language},unwrap:'data'});switchProject(Number(p.id),'/connections');}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('projectSwitcher.notCreatedTryAgain')));working(false);}};
 return <form className="space-y-3" onSubmit={e=>{e.preventDefault();void create();}}>
  <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">{$t('common.projectName')}</span><Input aria-label={$t('common.projectName')} value={name} maxLength={60} placeholder={$t('projectSwitcher.nocobase')} onChange={e=>setName(e.target.value)} autoFocus/></label>
  <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">{$t('common.websiteUrl')}</span><Input aria-label={$t('common.websiteUrl')} value={domain} placeholder="https://example.com" onChange={e=>setDomain(e.target.value)}/></label>
  <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">{$t('common.languageAiWrittenContent')}</span><select aria-label={$t('common.languageAiWrittenContent')} value={language} onChange={e=>setLanguage(e.target.value as 'zh-CN'|'en-US')} className='h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base leading-normal transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80'><option value="zh-CN">{$t('common.chineseLanguage')}</option><option value="en-US">English</option></select></label>
  {error?<p role="alert" className="nr-error">{error}</p>:null}
  <p className="text-xs text-muted-foreground">{$t('projectSwitcher.afterCreatingProjectChooseTask')}</p>
  {footer(<Button type="submit" disabled={busy||!name.trim()||!domain.trim()}>{busy?$t('projectSwitcher.creating'):$t('projectSwitcher.createConnectData')}</Button>)}
 </form>;
}
