import { type Message, useMessageState, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router';
import {ArrowDownIcon,ArrowUpIcon,MoreHorizontal,PencilIcon,PlusIcon,SparklesIcon,XIcon} from 'lucide-react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Tag} from '#components/reach/tag';
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '#components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '#components/ui/dropdown-menu';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '#components/ui/select';
import {cn} from '#lib/utils';
import {useProject} from './reach-data';
import {skillRequest,skillFor,type Skill,type SkillList} from './skill-model';
import {playbookRequest,localizePlaybookList,getCategories,categoryName,getStepKinds,type Category,type Playbook,type PlaybookList,type Step,type StepKind} from './playbook-model';
import {confirmAction} from '#components/reach/confirm';
import {InfoTip,WithInfo} from '#components/reach/info-tip';
import {PlaybookSteps,StepIcon} from './playbook-steps';
type Draft=Pick<Playbook,'name'|'category'|'description'|'steps'|'next'>&{id?:string};
type Saved=PlaybookList&{playbook?:Playbook|null};
const NEW='new';
const source=(p:Playbook)=>p.system?(p.edited?$t('playbooks.builtModified'):$t('playbooks.built')):$t('playbooks.own');
// 做法 (SPEC §6.0): every kind of work as a few steps the Agent does and you review, grouped by the work it is. Built-in
// playbooks are edited in place and can be restored; new ones start from one sentence the online AI turns into a draft.
export default function PlaybooksPage(){
 const {project,error:projectError}=useProject();const [params,setParams]=useSearchParams();
 const {can:canSave}=useBusinessAccess('nrPlaybooks.save',project?.id??null),{can:canCopy}=useBusinessAccess('nrPlaybooks.copy',project?.id??null),{can:canRestore}=useBusinessAccess('nrPlaybooks.restore',project?.id??null),{can:canRemove}=useBusinessAccess('nrPlaybooks.remove',project?.id??null);
 const [rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[skills,setSkills]=useState<Skill[]>([]),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[notice,setNotice]=useMessageState(''),[creating,setCreating]=useState(false);
 const list=localizePlaybookList(rawPlaybooks);
 useEffect(()=>{if(!project)return;void playbookRequest<PlaybookList>('list',project.id).then(setRawPlaybooks).catch(()=>setError(() => ($t('playbooks.notLoadPlaybooksRefreshTry'))));void skillRequest<SkillList>('list',project.id).then(r=>setSkills(r.skills)).catch(()=>undefined);},[project?.id]);
 const id=params.get('id'),selected=list?.playbooks.find(p=>p.id===id);
 const editing=Boolean(draft);
 async function pick(next:string){if(editing&&!(await confirmAction({title:() => ($t('common.discardUnsavedChanges')),action:'playbooks.discard'})))return;setDraft(null);setError('');setNotice('');const p=new URLSearchParams(params);p.set('id',next);setParams(p,{replace:true});}
 async function call(action:'save'|'copy'|'remove'|'restore',body:object,done:Message){if(!project||!list||!({save:canSave,copy:canCopy,remove:canRemove,restore:canRestore}[action]))return;setBusy(true);setError('');setNotice('');
  try{const r=await playbookRequest<Saved>(action,project.id,{revision:list.revision,...body});setRawPlaybooks(r);setDraft(null);setNotice(done);const p=new URLSearchParams(params);const next=action==='remove'?'':r.playbook?.id||'';if(next)p.set('id',next);else p.delete('id');setParams(p,{replace:true});}
  catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notSavedTryAgain')));}finally{setBusy(false);}}
 function save(){if(!draft)return;const {id:playbookId,...rest}=draft;void call('save',{...(playbookId?{playbookId}:{}),...rest},() => (playbookId?$t('playbooks.savedTasksAlreadyStartedNot'):$t('playbooks.playbookCreated')));}
 async function close(){if(editing&&!(await confirmAction({title:() => ($t('common.discardUnsavedChanges')),action:'playbooks.discard'})))return;setDraft(null);setError('');const p=new URLSearchParams(params);p.delete('id');setParams(p,{replace:true});}
 function startNew(d:Draft){setCreating(false);setDraft(d);setError('');setNotice('');const p=new URLSearchParams(params);p.set('id',NEW);setParams(p,{replace:true});}
 return <PageContainer className="nr-page"><PageHeader title={$t('playbooks.title',undefined)} description={$t('playbooks.howKindWorkDoneSteps')}
  actions={canSave&&<Button disabled={!list||busy} onClick={async()=>{if(editing&&!(await confirmAction({title:() => ($t('common.discardUnsavedChanges')),action:'playbooks.discard'})))return;setCreating(true);}}><SparklesIcon/>{$t('playbooks.newPlaybook')}</Button>}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {/* Playbooks as cards by category across the full width; one opens in a drawer to read or edit (UI review: no
      persistent side panel). A link to ?id= opens that playbook's drawer. */}
  {!list?<p role="status" className="text-sm text-muted-foreground">{$t('playbooks.loadingPlaybooks')}</p>:<div className="flex flex-col gap-5">
   {getCategories().map(([c,label])=>{const items=list.playbooks.filter(p=>p.category===c);return items.length?<section key={c} className="flex flex-col gap-2" aria-label={label}>
    <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(p=><button key={p.id} type="button" aria-current={selected?.id===p.id} onClick={()=>void pick(p.id)} className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors hover:border-ring aria-[current=true]:border-primary">
     <span className="text-sm font-medium">{p.name}</span>{p.description&&<span className="line-clamp-2 text-xs text-muted-foreground">{p.description}</span>}<span className="mt-auto pt-1 text-xs text-muted-foreground">{source(p)} · {$t('playbooks.stepCount',{0:p.steps.length})}</span></button>)}</div>
   </section>:null;})}
  </div>}
  <Sheet open={Boolean(list&&((draft&&canSave)||selected))} onOpenChange={o=>{if(!o)void close();}}>
   <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl" aria-describedby={undefined}><SheetHeader className="sr-only"><SheetTitle>{draft?$t('playbooks.editPlaybook'):$t('playbooks.playbookDetails')}</SheetTitle></SheetHeader><div className={list&&draft&&canSave?'p-4 pt-12':undefined}>
   {list&&draft&&canSave?<Editor draft={draft} list={list} skills={skills} busy={busy} onChange={setDraft} onSave={save} onCancel={()=>{setDraft(null);setError('');if(id===NEW){const p=new URLSearchParams(params);p.delete('id');setParams(p,{replace:true});}}}/>
   :list&&selected?<Detail p={selected} list={list} skills={skills} busy={busy} onEdit={canSave?()=>setDraft({id:selected.id,name:selected.name,category:selected.category,description:selected.description,steps:structuredClone(selected.steps),next:[...selected.next]}):undefined}
     onCopy={canCopy?()=>void call('copy',{playbookId:selected.id},() => ($t('playbooks.duplicatedKeepEditing'))):undefined} onRestore={canRestore?async()=>{if(await confirmAction({title:() => ($t('playbooks.restoreDefault',{0:selected.name})),description:() => ($t('playbooks.changesDiscardedTasksAlreadyStarted')),action:'common.restoreDefault'}))void call('restore',{playbookId:selected.id},() => ($t('playbooks.defaultRestored')));}:undefined}
     onRemove={canRemove?async()=>{if(await confirmAction({title:() => ($t('playbooks.deletePlaybook',{0:selected.name})),description:() => ($t('playbooks.tasksAlreadyStartedNotAffected')),action:'common.delete'}))void call('remove',{playbookId:selected.id},() => ($t('playbooks.deleted')));}:undefined}/>:null}
   </div></SheetContent>
  </Sheet>
  {project&&list&&canSave&&<NewPlaybook open={creating} projectId={project.id} onClose={()=>setCreating(false)} onDraft={startNew}/>}
 </PageContainer>;
}
function Detail({p,list,skills,busy,onEdit,onCopy,onRestore,onRemove}:{p:Playbook;list:PlaybookList;skills:Skill[];busy:boolean;onEdit?:()=>void;onCopy?:()=>void;onRestore?:()=>void;onRemove?:()=>void}){
 const next=p.next.map(id=>list.playbooks.find(x=>x.id===id)?.name).filter(Boolean);
 return <section className="flex flex-col gap-4 pb-5 [&>*:not(:first-child)]:mx-5" aria-label={$t('playbooks.playbookDetails')}>
  <div className="flex items-start gap-2 border-b py-5 pr-14 pl-5"><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold leading-snug">{p.name}</h2><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Tag tone="grey">{categoryName(p.category)}</Tag>{$tj('playbooks.runAgent',{0:source(p)})}</p></div>
   {onEdit&&<Button size="sm" variant="outline" disabled={busy} onClick={onEdit}><PencilIcon/>{$t('common.edit')}</Button>}
   {(onCopy||(p.edited&&onRestore)||(!p.system&&onRemove))&&<DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={$t('playbooks.moreActions')} disabled={busy}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max">
    {onCopy&&<DropdownMenuItem onClick={onCopy}>{$t('playbooks.duplicate')}</DropdownMenuItem>}{p.edited&&onRestore&&<DropdownMenuItem onClick={onRestore}>{$t('common.restoreDefault')}</DropdownMenuItem>}{!p.system&&onRemove&&<DropdownMenuItem variant="destructive" onClick={onRemove}>{$t('common.delete')}</DropdownMenuItem>}
   </DropdownMenuContent></DropdownMenu>}</div>
  {p.description&&<p className="text-sm text-muted-foreground">{p.description}</p>}
  <div><h3 className="text-xs font-medium text-muted-foreground">{$t('common.steps')}</h3><PlaybookSteps steps={p.steps} skills={skills}/></div>
  {next.length>0&&<p className="text-xs text-muted-foreground">{$tj('playbooks.continue',{0:next.join('、')})}</p>}
 </section>;
}
// In-place editing: name, category, one line of description, and the steps — move, remove, add; a review's items one per line.
function Editor({draft,list,skills,busy,onChange,onSave,onCancel}:{draft:Draft;list:PlaybookList;skills:Skill[];busy:boolean;onChange:(d:Draft)=>void;onSave:()=>void;onCancel:()=>void}){
 const set=(patch:Partial<Draft>)=>onChange({...draft,...patch});
 const step=(i:number,patch:Partial<Step>)=>set({steps:draft.steps.map((s,j)=>j===i?{...s,...patch}:s)});
 const move=(i:number,d:number)=>{const s=[...draft.steps],[x]=s.splice(i,1);s.splice(i+d,0,x);set({steps:s});};
 const changes=draft.steps.some(s=>s.kind==='change'),buildable=list.playbooks.filter(p=>p.kind==='build'&&p.id!==draft.id);
 return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t('playbooks.editPlaybook')}>
  <div className="flex items-center gap-2"><h2 className="flex-1 text-sm font-semibold">{draft.id?$t('playbooks.editPlaybook'):$t('playbooks.newPlaybookNotSavedYet')}</h2><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{$t('common.cancel')}</Button><Button size="sm" disabled={busy||!draft.name.trim()||!draft.steps.length} onClick={onSave}>{$t('common.save')}</Button></div>
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]"><label className="nr-field">{$t('common.name')}<input value={draft.name} maxLength={40} onChange={e=>set({name:e.target.value})}/></label>
   <label className="nr-field">{$t('common.category')}<Select value={draft.category} onValueChange={v=>set({category:v as Category})}><SelectTrigger className="w-full" aria-label={$t('common.category')}><SelectValue>{(v:string)=>categoryName(v as Category)}</SelectValue></SelectTrigger><SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{getCategories().map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></label></div>
  <label className="nr-field">{$t('playbooks.oneLineDescription')}<input value={draft.description} maxLength={200} onChange={e=>set({description:e.target.value})}/></label>
  <div className="flex flex-col gap-2"><h3 className="text-xs font-medium text-muted-foreground"><WithInfo help={changes?$t('playbooks.agentChangeSystemAppendsGo'):$t('playbooks.ifLastStepNotReview')}>{$t('common.steps')}</WithInfo></h3>
   <ol className="flex flex-col gap-2" aria-label={$t('playbooks.editSteps')}>{draft.steps.map((s,i)=><li key={i} className="flex gap-2 rounded-lg border p-3">
    <span className={cn('mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md',s.kind==='review'?'bg-nr-tint-violet text-nr-ink-violet':'bg-nr-tint-blue text-nr-ink-blue')}><StepIcon kind={s.kind}/></span>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
     <div className="flex items-center gap-2 text-sm font-medium">{i+1}. {getStepKinds()[s.kind].label}<input aria-label={$t('playbooks.nameStep',{0:i+1})} value={s.name} maxLength={20} onChange={e=>step(i,{name:e.target.value})} className="w-36"/></div>
     {s.kind==='review'?<label className="nr-field text-xs">{$t('playbooks.confirmDuringReviewOneItem')}<textarea rows={2} value={(s.checklist||[]).map(c=>c.label).join('\n')} onChange={e=>step(i,{checklist:e.target.value.split('\n').map(l=>({key:'',label:l,required:true}))})}/></label>
     :<><label className="nr-field text-xs">{$t('playbooks.instructionsAgent')}<textarea rows={3} value={s.instruction||''} onChange={e=>step(i,{instruction:e.target.value})}/></label><PickSkills index={i} ids={s.skills||[]} skills={skills} onChange={ids=>step(i,{skills:ids})}/></>}
    </div>
    <div className="flex flex-col gap-1"><Button size="icon-sm" variant="ghost" aria-label={$t('common.moveUp')} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUpIcon/></Button><Button size="icon-sm" variant="ghost" aria-label={$t('common.moveDown')} disabled={i===draft.steps.length-1} onClick={()=>move(i,1)}><ArrowDownIcon/></Button><Button size="icon-sm" variant="ghost" aria-label={$t('playbooks.deleteStep')} onClick={()=>set({steps:draft.steps.filter((_,j)=>j!==i)})}><XIcon/></Button></div>
   </li>)}</ol>
   <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-xs text-muted-foreground">{$t('playbooks.addStep')}</span>{(['analyze','change','review'] as StepKind[]).map(k=><Button key={k} size="sm" variant="outline" disabled={draft.steps.length>=10} onClick={()=>set({steps:[...draft.steps,{key:'',name:getStepKinds()[k].name,kind:k,...(k==='review'?{checklist:[]}:{instruction:''})}]})}><PlusIcon/>{getStepKinds()[k].label}</Button>)}</div>
  </div>
  {!changes&&buildable.length>0&&<fieldset className="flex flex-col gap-1.5 text-sm"><legend className="mb-1 text-xs font-medium text-muted-foreground">{$t('playbooks.continuePickOneWhenApproving')}</legend><div className="flex flex-wrap gap-x-4 gap-y-1">{buildable.map(p=><label key={p.id} className="flex items-center gap-1.5"><input type="checkbox" checked={draft.next.includes(p.id)} disabled={!draft.next.includes(p.id)&&draft.next.length>=3} onChange={e=>set({next:e.target.checked?[...draft.next,p.id]:draft.next.filter(x=>x!==p.id)})}/>{p.name}</label>)}</div></fieldset>}
 </section>;
}
// 新建做法: one sentence → the online AI drafts it (one call) → it opens in the editor to check and save. Or start blank.
function NewPlaybook({open,projectId,onClose,onDraft}:{open:boolean;projectId:number;onClose:()=>void;onDraft:(d:Draft)=>void}){
 const {can:canDraft}=useBusinessAccess('nrPlaybooks.draft',projectId);
 const [request,setRequest]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 useEffect(()=>{if(open){setError('');}},[open, setError]);
 async function ask(){if(!canDraft)return;if(!request.trim()){setError(() => ($t('playbooks.describeOneSentenceWhatPlaybook')));return;}setBusy(true);setError('');
  try{const r=await playbookRequest<{draft:Draft}>('draft',projectId,{request:request.trim()});onDraft({...r.draft,next:r.draft.next||[]});setRequest('');}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('playbooks.draftNotWorkTryAgain')));}finally{setBusy(false);}}
 const blank:Draft={name:'',category:'research',description:'',steps:[{key:'',name:$t('common.analyze'),kind:'analyze',instruction:''},{key:'',name:$t('common.review'),kind:'review',checklist:[]}],next:[]};
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle>{$t('playbooks.newPlaybook')}</DialogTitle><DialogDescription>{$t('playbooks.describeOneSentenceWhatPlaybookMessage')}</DialogDescription></DialogHeader>
  {canDraft&&<><label className="nr-field"><span className='inline-flex items-center gap-1'>{$t('playbooks.whatPlaybook')}<InfoTip>{$t('playbooks.draftingCallsOnlineAiOnce')}</InfoTip></span><textarea rows={3} value={request} maxLength={500} disabled={busy} onChange={e=>setRequest(e.target.value)} placeholder={$t('playbooks.afterReleaseSyncChangesChinese')}/></label></>}
  {error&&<p role="alert" className="nr-error">{error}</p>}
  <DialogFooter className="sm:justify-between"><Button variant="ghost" disabled={busy} onClick={()=>onDraft(blank)}>{$t('playbooks.createWithoutAi')}</Button>{canDraft&&<Button disabled={busy} onClick={()=>void ask()}><SparklesIcon/>{busy?$t('playbooks.drafting'):$t('playbooks.draftAi')}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}
// Picking a step's Skills from the library: chips to remove, a list to add (at most 5).
export function PickSkills({index,ids,skills,onChange}:{index:number;ids:string[];skills:Skill[];onChange:(ids:string[])=>void}){
 // Refs to Skills deleted since are dropped on the next change; a built-in named by its name stays.
 const chosen=ids.flatMap(ref=>{const s=skillFor(skills,ref);return s?[{ref,s}]:[];}),kept=chosen.map(x=>x.ref),rest=skills.filter(s=>!chosen.some(x=>x.s.id===s.id));
 return <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label={$t('playbooks.skillsUsedStep',{0:index+1})}><span className="text-muted-foreground">{$t('playbooks.useSkills')}</span>
  {chosen.map(({ref,s})=>{return <span key={ref} className="inline-flex items-center gap-1 rounded-full bg-nr-tint-violet py-0.5 pr-1 pl-2 font-mono text-nr-ink-violet">{s.name}<button type="button" aria-label={$t('playbooks.notUse',{0:s.name})} className="rounded-full hover:bg-background/60" onClick={()=>onChange(kept.filter(x=>x!==ref))}><XIcon className="size-3"/></button></span>;})}
  {skills.length?chosen.length<5&&rest.length>0&&<Select value={null} onValueChange={v=>{if(v)onChange([...kept,String(v)]);}}><SelectTrigger size="sm" className="min-w-28 text-xs" aria-label={$t('playbooks.addSkillsStep',{0:index+1})}><SelectValue placeholder={$t('playbooks.select')}/></SelectTrigger><SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{rest.map(s=><SelectItem key={s.id} value={s.id} className="font-mono">{s.name}</SelectItem>)}</SelectContent></Select>
   :<span className="text-muted-foreground">{$t('playbooks.noSkillsYetCreateThem')}</span>}
 </div>;
}
