import { type Message, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useMemo,useState,type ReactElement} from 'react';
import {ExternalLinkIcon,FileIcon,PencilIcon,PlusIcon,SearchIcon,Trash2Icon,XIcon} from 'lucide-react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Tag} from '#components/reach/tag';
import {WithInfo} from '#components/reach/info-tip';
import {Button} from '#components/ui/button';
import {ConnectionError} from '#components/connection-error';
import {Switch} from '#components/ui/switch';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '#components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {cn} from '#lib/utils';
import {useProject,useUnsavedWarning} from './reach-data';
import {playbookRequest,localizePlaybookList,type PlaybookList} from './playbook-model';
import {skillRequest,readSkillFiles,skillFor,SKILL_NAME,type LinkRead,type Skill,type SkillList} from './skill-model';
import {confirmAction} from '#components/reach/confirm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
// Skills (SPEC §6.0): how a kind of work is done, as SKILL.md (name, when to use it, how) and files that come with it. One
// library for every project; turned on here, a Skill goes with every task for the Agent to use when it fits. A 做法 step
// can name Skills, and that step always uses them.
type Usage=Record<string,string[]>;
const day=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()}`;};
export default function SkillsPage(){
 const {project,error:projectError}=useProject();
 const {can:canCreate}=useBusinessAccess('nrSkills.create'),{can:canImport}=useBusinessAccess('nrSkills.import'),{can:canImportLink}=useBusinessAccess('nrSkills.importLink'),{can:canRemove}=useBusinessAccess('nrSkills.remove');
 const {can:canReadLink}=useBusinessAccess('nrSkills.readLink',project?.id??null),{can:canEnable}=useBusinessAccess('nrSkills.setEnabled',project?.id??null);
 const canAdd=canCreate||canImport||(canReadLink&&canImportLink);
 const [list,setList]=useState<SkillList>(),[rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[q,setQ]=useState(''),[filter,setFilter]=useState(''),[creating,setCreating]=useState(false),[open,setOpen]=useState<string|null>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[notice,setNotice]=useMessageState('');
 const usage:Usage={};for(const p of localizePlaybookList(rawPlaybooks)?.playbooks||[])for(const step of p.steps)for(const ref of step.skills||[]){const key=skillFor(list?.skills||[],ref)?.id??ref;(usage[key]||=[]).push(`${p.name} · ${step.name}`);}
 const load=()=>{if(project)void skillRequest<SkillList>('list',project.id).then(setList).catch(()=>setError(() => ($t('skills.notLoadSkillsRefreshTry'))));};
 useEffect(load,[project?.id]);
 // Which 做法 steps name each Skill, from this project's playbooks.
 useEffect(()=>{if(!project)return;void playbookRequest<PlaybookList>('list',project.id).then(setRawPlaybooks).catch(()=>undefined);},[project?.id]);
 const visible=useMemo(()=>(list?.skills||[]).filter(s=>(!filter||(filter==='on')===s.enabled)&&(!q.trim()||`${s.name} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase()))),[list,q,filter]);
 async function toggle(s:Skill,enabled:boolean){if(!project||!canEnable)return;setError('');setList(l=>l&&{...l,skills:l.skills.map(x=>x.id===s.id?{...x,enabled}:x)});
  try{await skillRequest('setEnabled',project.id,{skillId:s.id,enabled});setNotice(() => (enabled?$t('skills.enabledProject',{0:s.name}):$t('skills.turnedOffProject',{0:s.name})));}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notChangedTryAgain')));load();}}
 // Built-in Skills remain editable; only untouched seed metadata is safe to translate.
 const selected=list?.skills.find(s=>s.id===open)||null;
 // Rows ticked to delete together (only those still listed and shown count).
 const ticked=visible.filter(s=>picked.includes(s.id)),allTicked=visible.length>0&&ticked.length===visible.length;
 async function removeTicked(){if(!project||!canRemove||!ticked.length)return;const used=ticked.filter(s=>usage[s.id]?.length).map(s=>s.name);
  if(!(await confirmAction({title:() => ($t('skills.deleteSkills',{0:ticked.length})),description:() => (used.length?$t('skills.themSetPlaybooksStepsCannot',{0:used.join('、')}):undefined),action:'common.delete'})))return;setBusy(true);setError('');
  try{const r=await skillRequest<{removed:string[]}>('remove',project.id,{skillIds:ticked.map(s=>s.id)});setNotice(() => ($t('skills.skillsDeleted',{0:r.removed.length})));setPicked([]);load();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notDeletedTryAgain')));}finally{setBusy(false);}}
 return <PageContainer className="nr-page"><PageHeader title="Skills" description={$t('skills.instructionsHowKindWorkSkills')} actions={canAdd&&<Button disabled={!project} onClick={()=>setCreating(true)}><PlusIcon/>{$t('skills.newSkill')}</Button>}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <section className="flex flex-col gap-3" aria-label={$t('skills.skills')}>
   <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t('skills.searchSkills')} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t('skills.searchSkills')} className="w-full pl-8!"/></label>
    <Select value={filter||'all'} onValueChange={v=>setFilter(v==='all'?'':String(v))}><SelectTrigger className="w-full sm:w-40" aria-label={$t('skills.filterEnabled')}><SelectValue>{(v:string)=>v==='on'?$t('skills.enabledInProject'):v==='off'?$t('common.off'):$t('skills.all')}</SelectValue></SelectTrigger><SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal"><SelectItem value="all">{$t('skills.all')}</SelectItem><SelectItem value="on">{$t('skills.enabledInProject')}</SelectItem><SelectItem value="off">{$t('common.off')}</SelectItem></SelectContent></Select>
    {canRemove&&ticked.length>0&&<span className="ml-auto flex items-center gap-2 text-sm" role="group" aria-label={$t('skills.selectedSkills')}><span className="text-muted-foreground">{$tj('skills.selected',{0:ticked.length})}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setPicked([])}>{$t('common.clearSelection')}</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={()=>void removeTicked()}><Trash2Icon/>{$t('skills.deleteSelected')}</Button></span>}</div>
   {!list?<p role="status" className="text-sm text-muted-foreground">{$t('common.loadingLoading')}</p>:visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label="Skills">
    <colgroup>{canRemove&&<col className="w-10"/>}<col/><col className="w-56"/><col className="w-20"/><col className="w-20"/></colgroup>
    <thead data-slot="table-header" className="text-xs text-muted-foreground"><tr>{canRemove&&<th className="py-2 pr-0 pl-3"><input type="checkbox" aria-label={$t('common.select')} checked={allTicked} onChange={e=>setPicked(e.target.checked?visible.map(s=>s.id):[])}/></th>}{[$t('skills.nameWhenUse'),$t('skills.usedPlaybooks'),$t('skills.attachedFiles')].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th className="px-3 py-2 text-left font-medium"><WithInfo help={$t('skills.projectEnablementHelp')}>{$t('skills.currentProject')}</WithInfo></th></tr></thead>
    <tbody>{visible.map(s=><tr key={s.id} data-skill-id={s.id} className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={()=>setOpen(s.id)}>
     {canRemove&&<td className="py-2.5 pr-0 pl-3" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={$t('common.selectValue',{0:s.name})} checked={picked.includes(s.id)} onChange={e=>setPicked(e.target.checked?[...picked,s.id]:picked.filter(x=>x!==s.id))}/></td>}
     <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-mono font-medium hover:underline" onClick={e=>{e.stopPropagation();setOpen(s.id);}}>{s.name}</button><p className="truncate text-xs text-muted-foreground">{s.builtIn&&s.createdAt&&s.createdAt===s.updatedAt?$legacyText(s.description):s.description}</p></td>
     <td className="truncate px-3 py-2.5 text-xs text-muted-foreground" title={(usage[s.id]||[]).join('、')}>{(usage[s.id]||[]).join('、')||'—'}</td>
     <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{s.files.length}</td>
     <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}><Switch aria-label={$t('skills.enableProjectValue',{0:s.name})} checked={s.enabled} disabled={!canEnable} onCheckedChange={v=>void toggle(s,v)}/></td></tr>)}</tbody></table></div>
   :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{list.skills.length?$t('skills.noMatchingSkillsMessage'):$t('skills.noSkillsYetClickNew')}</p>}
  </section>
  {project&&creating&&canAdd&&<NewSkill projectId={project.id} canCreate={canCreate} canImport={canImport} canImportLink={canImportLink} canReadLink={canReadLink} onClose={()=>setCreating(false)} onCreated={s=>{setCreating(false);setNotice(() => ($t('skills.createdTasksUseOnceEnabled',{0:s.name})));load();setOpen(s.id);}}
   onImported={r=>{setCreating(false);setNotice(() => ([r.imported.length?$t('skills.skillsImportedTasksUseThem',{0:r.imported.length,1:r.imported.join('、')}):$t('skills.noSkillsImported'),r.skipped.length?$t('skills.skippedValueMessage',{0:r.skipped.length,1:r.skipped.map(x=>`${x.name}（${$legacyText(x.reason)}）`).join('、')}):''].join('')));load();}}/>}
  {project&&<SkillDrawer projectId={project.id} canEnable={canEnable} canRemove={canRemove} skill={selected} usage={selected?usage[selected.id]||[]:[]} onClose={()=>setOpen(null)} onToggle={v=>selected&&void toggle(selected,v)} onChanged={(msg,closed)=>{load();if(closed){setNotice(msg);setOpen(null);}}}/>}
 </PageContainer>;
}
// 新建: fill in name, when to use it and how; pick a Skill folder (with SKILL.md) or a single SKILL.md file; or paste a link
// (GitHub, or an https SKILL.md) — read first to see what is there, a repository with several Skills lists them to pick one.
type Imported={imported:string[];skipped:{name:string;reason:string}[]};
function NewSkill({projectId,canCreate,canImport,canImportLink,canReadLink,onClose,onCreated,onImported}:{projectId:number;canCreate:boolean;canImport:boolean;canImportLink:boolean;canReadLink:boolean;onClose:()=>void;onCreated:(s:Skill)=>void;onImported:(r:Imported)=>void}):ReactElement{
 const canLink=canReadLink&&(canImport||canImportLink);
 const [mode,setMode]=useState<'form'|'folder'|'link'>(canCreate?'form':canImport?'folder':'link'),[url,setUrl]=useState(''),[link,setLink]=useState<LinkRead|null>(null),[ticked,setTicked]=useState<string[]>([]),[find,setFind]=useState(''),[reading,setReading]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[body,setBody]=useState(''),[picked,setPicked]=useState<{files:{path:string;text:string}[];skipped:string[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 async function readLink(){if(!canLink)return;setError('');if(!url.trim()){setError(() => ($t('skills.pasteLink')));return;}setReading(true);setLink(null);setTicked([]);setFind('');
  try{setLink(await skillRequest<LinkRead>('readLink',projectId,{url:url.trim()}));}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('skills.notReadTryAgain')));}finally{setReading(false);}}
 // A repository with several Skills: tick any number (those already here cannot be), filter by name or use, tick all shown.
 const choices=link?.choices||[],shown=choices.filter(c=>!find.trim()||`${c.name} ${c.description}`.toLowerCase().includes(find.trim().toLowerCase())),selectable=shown.filter(c=>!c.exists).map(c=>c.path),allTicked=selectable.length>0&&selectable.every(p=>ticked.includes(p));
 async function pick(list:FileList|null,folder:boolean){setError('');setPicked(null);if(!list?.length)return;const r=await readSkillFiles(list,folder);
  // A single Markdown file is the SKILL.md, whatever it is called.
  if(!folder&&r.files.length===1&&/\.(md|markdown)$/i.test(r.files[0].path))r.files[0].path='SKILL.md';
  if(!r.files.some(f=>f.path.toLowerCase()==='skill.md'||/^[^/]+\/skill\.md$/i.test(f.path))){setError(() => ($t('skills.noSkillMdFoundPick')));return;}
  setPicked(r);}
 const canSave=mode==='form'?canCreate:mode==='folder'?canImport:link?.choices?canImportLink:canImport;
 async function save(){if(!canSave)return;setError('');
  if(mode==='form'){const n=name.trim().toLowerCase();if(!SKILL_NAME.test(n)||n.length>64){setError(() => ($t('skills.invalidName')));return;}if(!description.trim()){setError(() => ($t('skills.describeWhenUseSkill')));return;}if(!body.trim()){setError(() => ($t('skills.describeHow')));return;}}
  else if(mode==='folder'&&!picked){setError(() => ($t('skills.pickSkillFolderSkillMd')));return;}
  else if(mode==='link'&&link?.choices){if(!ticked.length){setError(() => ($t('skills.selectLeastOneSkill')));return;}
   setBusy(true);try{onImported(await skillRequest<Imported>('importLink',projectId,{url:url.trim(),paths:ticked}));}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('skills.notImportedTryAgain')));}finally{setBusy(false);}return;}
  else if(mode==='link'&&!link?.files){setError(() => ($t('skills.pasteLinkClickReadFirst')));return;}
  setBusy(true);try{const r=mode==='form'?await skillRequest<{skill:Skill}>('create',projectId,{name:name.trim().toLowerCase(),description,body}):await skillRequest<{skill:Skill}>('import',projectId,mode==='link'?{files:link!.files,source:link!.source}:{files:picked!.files});onCreated(r.skill);}
  catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('skills.notSavedTryAgain')));}finally{setBusy(false);}}
 const others=picked?picked.files.filter(f=>!/(^|\/)skill\.md$/i.test(f.path)).length:0;
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-2xl">
  <DialogHeader><DialogTitle>{$t('skills.newSkill')}</DialogTitle><DialogDescription>{$t('skills.skillSpellsOutHowKind')}</DialogDescription></DialogHeader>
  <div className="flex flex-col gap-3">
   <div className="nr-tabs" role="group" aria-label={$t('skills.howCreate')}>{([['form',$t('skills.write')],['folder',$t('skills.uploadFolder')],['link',$t('skills.enterLink')]] as const).filter(([k])=>k==='form'?canCreate:k==='folder'?canImport:canLink).map(([k,v])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>{setMode(k);setError('');}}>{v}</button>)}</div>
   {mode==='form'?<>
    <label className="nr-field">{$t('common.name')}<input value={name} maxLength={64} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="seo-title" className="font-mono"/><span className="text-xs text-muted-foreground">{$t('skills.lowercaseEnglishLettersNumbersHyphens')}</span></label>
    <label className="nr-field">{$t('skills.whenUse')}<textarea rows={2} maxLength={1024} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)} placeholder={$t('skills.useWhenWritingChangingPage')}/><span className="text-xs text-muted-foreground">{$t('skills.agentUsesLineDecideWhen')}</span></label>
    <label className="nr-field">{$t('skills.how')}<textarea rows={10} disabled={busy} value={body} onChange={e=>setBody(e.target.value)} className="font-mono text-xs" placeholder={$t('skills.title3060CharactersMain')}/></label>
   </>:mode==='link'?<>
    <div className="flex flex-col gap-1"><label className="nr-field"><WithInfo help={$t('skills.sourceRecordedSkillAttachedScripts')}>{$t('skills.skillLink')}</WithInfo><span className="flex gap-2"><input value={url} disabled={busy||reading} onChange={e=>{setUrl(e.target.value);setLink(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void readLink();}}} placeholder="https://github.com/owner/repo/tree/main/skills/brand-voice" className="min-w-0 flex-1"/>
     <Button type="button" variant="outline" disabled={busy||reading} onClick={()=>void readLink()}>{reading?$t('common.loadingLoading'):$t('common.read')}</Button></span></label>
     <span className="text-xs text-muted-foreground">{$t('skills.linkSkillFolderSkillMd')}</span></div>
    {link?.choices&&<fieldset className="flex flex-col gap-1.5" disabled={busy}><legend className="mb-1 flex w-full flex-wrap items-center gap-2 text-sm"><span className="flex-1">{$tj('skills.linkSkillsSelectOnesImport',{0:choices.length,1:choices.some(c=>c.exists)?$t('skills.existingOnesCannotImportedAgain'):''})}</span>
     {selectable.length>0&&<button type="button" className="text-xs text-primary hover:underline" onClick={()=>{setError('');setTicked(allTicked?ticked.filter(p=>!selectable.includes(p)):[...new Set([...ticked,...selectable])]);}}>{allTicked?$t('skills.selectNone'):find.trim()?$t('skills.selectFiltered'):$t('common.select')}</button>}</legend>
     {choices.length>8&&<div className="nr-field"><input aria-label={$t('skills.filterSkillsLink')} value={find} onChange={e=>setFind(e.target.value)} placeholder={$t('skills.filterNameUse')}/></div>}
     <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border" aria-label={$t('skills.skillsLink')}>{shown.map(c=><li key={c.path}><label className={cn('flex gap-2.5 px-3 py-2',c.exists?'opacity-60':'cursor-pointer hover:bg-muted/40')}>
      <input type="checkbox" className="mt-1" disabled={c.exists} checked={!c.exists&&ticked.includes(c.path)} onChange={e=>{setError('');setTicked(e.target.checked?[...ticked,c.path]:ticked.filter(p=>p!==c.path));}}/>
      <span className="flex min-w-0 flex-col gap-0.5"><span className="flex items-center gap-2 font-mono text-sm font-medium">{c.name}{c.exists&&<Tag tone="grey">{$t('skills.exists')}</Tag>}</span><span className="line-clamp-2 text-xs text-muted-foreground">{c.description}</span></span></label></li>)}
      {!shown.length&&<li className="px-3 py-4 text-center text-xs text-muted-foreground">{$t('skills.noMatchingSkills')}</li>}</ul></fieldset>}
    {busy&&link?.choices&&<p role="status" className="text-sm text-muted-foreground">{$tj('skills.readingImportingSkillsTakeMoment',{0:ticked.length})}</p>}
    {link?.files&&<div role="status" className="flex flex-col gap-0.5 rounded-lg border p-3 text-sm"><p><span className="font-mono font-medium">{link.name}</span><span className="text-muted-foreground"> · {link.files.length-1?$t('skills.attachedFileCount',{0:link.files.length-1}):$t('skills.noAttachedFiles')}{link.skipped?.length?$t('skills.skippedFilesSuffix',{0:link.skipped.length,1:link.skipped.slice(0,3).join('、'),2:link.skipped.length>3?'…':''}):''}</span></p><p className="line-clamp-3 text-xs text-muted-foreground">{link.description}</p></div>}
   </>:<>
    <label className="nr-field"><WithInfo help={$t('skills.nameWhenUseReadTop')}>{$t('skills.skillFolderContainingSkillMd')}</WithInfo><input type="file" multiple disabled={busy} {...{webkitdirectory:''}} onChange={e=>void pick(e.target.files,true)}/></label>
    <label className="nr-field">{$t('skills.pickSingleSkillMdFile')}<input type="file" accept=".md,.markdown" disabled={busy} onChange={e=>void pick(e.target.files,false)}/></label>
    {picked&&<p role="status" className="text-sm">{$tj('skills.readSkillMd',{0:others?$t('skills.additionalFiles',{0:others}):'',1:picked.skipped.length?$t('skills.skippedFilesSummary',{0:picked.skipped.length,1:picked.skipped.slice(0,3).join('、'),2:picked.skipped.length>3?'…':''}):''})}</p>}
   </>}
   {/* A link GitHub cannot be read from: the folder can be downloaded elsewhere and uploaded here instead. */}
   <ConnectionError message={error} hint={mode==='link'&&canImport?$t('skills.uploadFolderInstead'):undefined} alternative={mode==='link'&&canImport?<Button type="button" size="sm" variant="outline" onClick={()=>{setMode('folder');setError('');}}>{$t('skills.useUploadFolder')}</Button>:undefined}/>
  </div>
  <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button><Button disabled={busy||reading||!canSave} onClick={()=>void save()}>{busy?(mode==='link'&&link?.choices?$t('skills.importing'):$t('common.saving')):mode==='form'?$t('common.save'):mode==='link'&&link?.choices?$t('skills.importValue',{0:ticked.length}):$t('skills.import')}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
// One Skill: turn it on here, read and edit SKILL.md in place, look at, add and remove its files, delete it. What an action
// did is said in the drawer (the page behind it is covered); deleting closes it and the page says so.
function SkillDrawer({projectId,canEnable,canRemove,skill,usage,onClose,onToggle,onChanged}:{projectId:number;canEnable:boolean;canRemove:boolean;skill:Skill|null;usage:string[];onClose:()=>void;onToggle:(v:boolean)=>void;onChanged:(msg:Message,closed?:boolean)=>void}):ReactElement{
 const {can:canEdit}=useBusinessAccess('nrSkills.edit'),{can:canAddFiles}=useBusinessAccess('nrSkills.addFiles'),{can:canRemoveFile}=useBusinessAccess('nrSkills.removeFile');
 const [content,setContent]=useState<{body:string;files:{path:string;text:string}[]}>(),[draft,setDraft]=useState<{name:string;description:string;body:string}|null>(null),[shown,setShown]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[done,setDone]=useMessageState('');
 const read=()=>{if(skill)void skillRequest<{body:string;files:{path:string;text:string}[]}>('get',projectId,{skillId:skill.id}).then(r=>setContent({body:r.body,files:r.files})).catch(()=>setError(() => ($t('skills.notLoadSkill'))));};
 useEffect(()=>{setContent(undefined);setDraft(null);setShown('');setError('');read();},[skill?.id,skill?.updatedAt]);
 useEffect(()=>setDone(''),[setDone, skill?.id]);
 useUnsavedWarning(Boolean(draft&&content&&skill&&(draft.name!==skill.name||draft.description!==skill.description||draft.body!==content.body)));
 async function act(action:'edit'|'remove'|'removeFile'|'addFiles',body:object,message:Message,closed=false){if(!skill||!({edit:canEdit,remove:canRemove,removeFile:canRemoveFile,addFiles:canAddFiles}[action]))return;setBusy(true);setError('');setDone('');
  try{await skillRequest(action,projectId,{skillId:skill.id,...body});setDraft(null);if(!closed)setDone(message);onChanged(message,closed);}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.retryFailure')));}finally{setBusy(false);}}
 async function addFiles(list:FileList|null){if(!list?.length)return;const r=await readSkillFiles(list,false);if(!r.files.length){setError(() => ($t('skills.filesNotTextFilesToo')));return;}
  await act('addFiles',{files:r.files},() => ($t('skills.filesAdded',{0:r.files.length,1:r.skipped.length?$t('skills.skippedValueSuffix',{0:r.skipped.length}):''})));}
 async function remove(){if(!skill)return;if(!(await confirmAction({title:() => ($t('skills.delete',{0:skill.name})),description:() => (usage.length?$t('skills.playbookStepsCannotUseAnymore',{0:usage.join('、')}):undefined),action:'common.delete'})))return;void act('remove',{},() => ($t('skills.deleted',{0:skill.name})),true);}
 return <Sheet open={Boolean(skill)} onOpenChange={o=>{if(!o)void (async()=>{if(draft&&!(await confirmAction({title:() => ($t('common.discardUnsavedChanges')),action:'playbooks.discard'})))return;onClose();})();}}><SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl" aria-describedby={undefined}>
  <SheetHeader className="sr-only"><SheetTitle>{skill?.name||'Skill'}</SheetTitle></SheetHeader>
  {skill&&<div className="flex flex-col gap-4 p-4 pt-12" aria-label={$t('skills.skillDetails')} role="region">
   <div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-base font-semibold">{skill.name}</h2>{skill.enabled?<Tag tone="green">{$t('skills.enabledInProject')}</Tag>:<Tag tone="grey">{$t('skills.offProject')}</Tag>}
    <span className="ml-auto flex items-center gap-2">{!draft&&canEdit&&<Button size="sm" variant="outline" disabled={busy||!content} onClick={()=>content&&setDraft({name:skill.name,description:skill.description,body:content.body})}><PencilIcon/>{$t('common.edit')}</Button>}
</span></div>
   <label className="flex items-center gap-2 text-sm"><Switch aria-label={$t('skills.enableProject')} checked={skill.enabled} disabled={!canEnable} onCheckedChange={onToggle}/>{$t('skills.enableProject')}<span className="text-xs text-muted-foreground">{$t('skills.givenAgentEveryTaskUsed')}</span></label>
   {error&&<p role="alert" className="nr-error">{error}</p>}{done&&<p role="status" className="nr-success">{done}</p>}
   {draft&&canEdit?<div className="flex flex-col gap-3">
    <label className="nr-field">{$t('common.name')}<input value={draft.name} maxLength={64} className="font-mono" onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="nr-field">{$t('skills.whenUse')}<textarea rows={2} maxLength={1024} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
    <label className="nr-field">{$t('skills.how')}<textarea rows={16} value={draft.body} className="font-mono text-xs" onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
    <div className="flex gap-2"><Button size="sm" disabled={busy||!draft.name.trim()||!draft.description.trim()||!draft.body.trim()} onClick={()=>void act('edit',{name:draft.name.trim().toLowerCase(),description:draft.description,body:draft.body},() => ($t('skills.savedLaterTasksUseNew')))}>{$t('common.save')}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>{$t('common.cancel')}</Button></div>
   </div>:<>
    <div><h3 className="text-xs font-medium text-muted-foreground">{$t('skills.whenUse')}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{skill.description}</p></div>
    <div><h3 className="text-xs font-medium text-muted-foreground">{$t('skills.howSkillMdBody')}</h3><div className="mt-1 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">{content?content.body:$t('common.loadingLoading')}</div></div>
   </>}
   <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">{$t('skills.attachedFiles')}</h3>
    {content?.files.length?<ul className="flex flex-col divide-y rounded-lg border" aria-label={$t('skills.attachedFiles')}>{content.files.map(f=><li key={f.path} className="px-3 py-2">
     <div className="flex items-center gap-2 text-sm"><FileIcon className="size-3.5 text-muted-foreground" aria-hidden="true"/><button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline" aria-expanded={shown===f.path} onClick={()=>setShown(shown===f.path?'':f.path)}>{f.path}</button><span className="text-xs text-muted-foreground tabular-nums">{$tj('common.characters',{0:f.text.length.toLocaleString(getCurrentLocale())})}</span>
      {canRemoveFile&&<Button size="icon-sm" variant="ghost" aria-label={$t('common.deleteValue',{0:f.path})} disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('skills.deleteAttachedFile',{0:f.path})),action:'common.delete'}))void act('removeFile',{path:f.path},() => ($t('skills.deleted',{0:f.path})));}}><XIcon/></Button>}</div>
     {shown===f.path&&<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{f.text}</pre>}</li>)}</ul>
    :<p className="text-xs text-muted-foreground">{content?$t('skills.noAttachedFilesTemplatesExamples'):''}</p>}
    {canAddFiles&&<label className={cn('flex w-fit cursor-pointer items-center gap-1 text-xs text-primary hover:underline',busy&&'pointer-events-none opacity-50')}><PlusIcon className="size-3.5"/>{$t('skills.addFiles')}<input type="file" multiple className="sr-only" aria-label={$t('skills.addAttachedFiles')} disabled={busy} onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/></label>}
   </div>
   <div className="flex items-start gap-2 border-t pt-3"><div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground"><p>{$tj('skills.updated',{0:usage.length?$t('skills.usedPlaybooksValue',{0:usage.join('、')}):$t('skills.noPlaybookUsesYet'),1:day(skill.updatedAt),2:skill.builtIn?$t('skills.builtExample'):''})}</p>
    {skill.source&&<a href={skill.source} target="_blank" rel="noopener noreferrer" className="flex w-fit max-w-full items-center gap-1 hover:underline"><ExternalLinkIcon className="size-3 shrink-0"/><span className="truncate">{$tj('common.source',{0:skill.source})}</span></a>}</div>
    {canRemove&&<Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={remove}><Trash2Icon/>{$t('common.delete')}</Button>}</div>
  </div>}
 </SheetContent></Sheet>;
}
