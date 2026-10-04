import {useState,type ReactElement} from 'react';
import {Check,ChevronsUpDown,Plus} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {ProjectIcon,useProject,useProjects,type Project} from './reach-data';
import {switchProject} from './current-project';
// The project in the header: click to switch projects or add one (SPEC §3 多项目). Each project keeps its own data
// sources, analysis, opportunities and tasks; switching reloads the Portal on the chosen project.
export function ProjectSwitcher():ReactElement{
 const {project,error}=useProject(),{projects}=useProjects();const [adding,setAdding]=useState(false);
 const label=<><ProjectIcon projectId={project?.id} name={project?.name}/><span className="min-w-0 text-left"><span className="block truncate text-sm font-semibold">{project?.name||(error?'项目读取失败':'正在读取项目…')}</span><span className="block truncate text-xs text-muted-foreground">{project?.domains.join(', ')||'当前项目'}</span></span></>;
 return <>
  <DropdownMenu>
   <DropdownMenuTrigger render={<button type="button" aria-label="切换项目" data-project-switcher className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-muted"/>} title={error||'切换项目'}>
    {label}<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground"/>
   </DropdownMenuTrigger>
   <DropdownMenuContent align="start" className="w-72">
    {(projects||[]).map((p:Project)=><DropdownMenuItem key={p.id} onClick={()=>{if(Number(p.id)!==Number(project?.id))switchProject(Number(p.id));}} className="gap-3 py-1.5" data-project={p.id}>
     <ProjectIcon projectId={p.id} name={p.name}/><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.domains?.join(', ')}</span></span>{Number(p.id)===Number(project?.id)?<Check className="size-4"/>:null}
    </DropdownMenuItem>)}
    <DropdownMenuSeparator/>
    <DropdownMenuItem onClick={()=>setAdding(true)} className="gap-2 py-1.5"><Plus className="size-4"/>添加新项目</DropdownMenuItem>
   </DropdownMenuContent>
  </DropdownMenu>
  {adding?<AddProject onClose={()=>setAdding(false)}/>:null}
 </>;
}
// A new project needs only a name and its website; data sources are connected next, in 数据接入 of that project.
function AddProject({onClose}:{onClose:()=>void}):ReactElement{
 const [name,setName]=useState(''),[domain,setDomain]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const create=async()=>{setBusy(true);setError('');try{const p=await api.action<Project>('nrProjects','create',{method:'POST',body:{name,domain},unwrap:'data'});switchProject(Number(p.id),'/connections');}catch(e){setError(e instanceof Error?e.message:'没有建好，请重试。');setBusy(false);}};
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-md">
  <DialogHeader><DialogTitle>添加新项目</DialogTitle><DialogDescription>每个项目有自己的数据源、每日分析、机会和任务。建好后去数据接入给它接数据。</DialogDescription></DialogHeader>
  <form className="space-y-3" onSubmit={e=>{e.preventDefault();void create();}}>
   <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">项目名称</span><Input aria-label="项目名称" value={name} maxLength={60} placeholder="例如 NocoBase" onChange={e=>setName(e.target.value)} autoFocus/></label>
   <label className="flex flex-col gap-2 text-sm"><span className="text-muted-foreground">官网地址</span><Input aria-label="官网地址" value={domain} placeholder="https://example.com" onChange={e=>setDomain(e.target.value)}/></label>
   {error?<p role="alert" className="nr-error">{error}</p>:null}
   <p className="text-xs text-muted-foreground">本机 Agent 按项目连接：新项目要在 Agent 页再连一次电脑。</p>
   <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy||!name.trim()||!domain.trim()}>{busy?'正在创建…':'创建并去接入数据'}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
