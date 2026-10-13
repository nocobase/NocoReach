import { type Message, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {createContext,useContext,useEffect,useMemo,useState,type ReactElement} from 'react';
import {FileTextIcon,LoaderCircleIcon,NotebookPenIcon,PencilIcon,PlusIcon,SearchIcon,Trash2Icon} from 'lucide-react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {AdminOnlyNote,useMe} from './me';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Tag} from '#components/reach/tag';
import {AiMark} from '#components/reach/actor';
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '#components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {cn} from '#lib/utils';
import {useProject,useUnsavedWarning,type Project} from './reach-data';
import {confirmAction} from '#components/reach/confirm';
import {InlineError} from '#components/reach/states';
import {InfoTip} from '#components/reach/info-tip';
import {help} from './glossary';
// 项目知识 (SPEC §6.0): what the AI team knows about this project — 记忆, read every time and kept short, in the sections of
// a brand handbook; and 知识库, material the Agent looks up when it needs to.
export const getMemorySections = (): [MemoryKey,string,string][] => ([['brand',$t('projectKnowledge.brandBasics'),$t('projectKnowledge.brandNameOneLineIntro')],['product',$t('projectKnowledge.product'),$t('projectKnowledge.productLinesCoreFeaturesValue')],['audience',$t('projectKnowledge.audience'),$t('projectKnowledge.targetAudienceWhatCareAbout')],['markets',$t('projectKnowledge.marketsLanguages'),$t('projectKnowledge.targetRegionsLanguagesRulesLanguage')],['voice',$t('projectKnowledge.voiceStyle'),$t('projectKnowledge.brandPersonalityVoiceWritingRules')],['wording',$t('projectKnowledge.terminology'),$t('projectKnowledge.glossaryWhichTermsUseAvoid')],['messages',$t('projectKnowledge.keyMessages'),$t('projectKnowledge.claimsSellingPointsRepeatEvidence')],['competitors',$t('common.competitor'),$t('projectKnowledge.mainCompetitorsHowDiffer')],['rules',$t('projectKnowledge.rulesNoGoAreas'),$t('projectKnowledge.pagesContentNotChangeThings')]]);
export type MemoryKey='brand'|'product'|'audience'|'markets'|'voice'|'wording'|'messages'|'competitors'|'rules';
export type Memory=Record<MemoryKey,string>;
const SUGGESTED=3000;
// Same reading as the server's memoryOf: saved sections, or a project's older fields read into them.
export function memoryOf(p?:Partial<Project>&{memory?:Partial<Memory>}):Memory{
 const s=(v?:string)=>(v||'').trim();
 if(p?.memory)return Object.fromEntries(getMemorySections().map(([k])=>[k,s(p.memory?.[k])])) as Memory;
 const join=(...xs:string[])=>xs.filter(Boolean).join('\n');
 return {brand:join(s(p?.description),s(p?.positioning)&&$t('projectKnowledge.positioning',{0:s(p?.positioning)})),product:s(p?.keyPages)&&$t('projectKnowledge.keyPages',{0:s(p?.keyPages)}),audience:s(p?.audience),markets:join(s(p?.market),s(p?.contentLanguage)&&$t('projectKnowledge.contentLanguage',{0:s(p?.contentLanguage)})),voice:s(p?.writingStyle),wording:s(p?.terminology),messages:'',competitors:s(p?.competitors),rules:s(p?.doNotChange)};
}
export const getCategories = (): [string,string][] => ([['competitor',$t('common.competitor')],['customer',$t('projectKnowledge.customers')],['product',$t('projectKnowledge.product')],['industry',$t('projectKnowledge.industry')],['agent',$t('projectKnowledge.agent')],['other',$t('common.other')]]);
const categoryName=(c:string)=>getCategories().find(([k])=>k===c)?.[1]||$t('common.other');
type Item={id:string;title:string;category:string;kind:'text'|'file'|'link';fileName?:string;source?:string;chars:number;summary:string;addedAt:string};
const request=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrKnowledge',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
const day=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()}`;};
// 成员 read this page; only 管理员 change it (2026-10-08).
const ReadOnly=createContext(false);
export default function ProjectKnowledgePage(){
 const {project,error:projectError}=useProject(),{isAdmin}=useMe();
 const [items,setItems]=useState<Item[]>(),[adding,setAdding]=useState(false),[open,setOpen]=useState<Item|null>(null),[error,setError]=useMessageState(''),[notice,setNotice]=useMessageState('');
 const load=()=>{if(project)void request<{items:Item[]}>('list',project.id).then(r=>setItems(r.items)).catch(()=>setError(() => ($t('projectKnowledge.notLoadKnowledgeBaseRefresh'))));};
 useEffect(load,[project?.id]);
 // Removing an item, from its row or from the drawer.
 async function remove(i:Item){if(!project||!(await confirmAction({title:() => ($t('projectKnowledge.deleteKnowledgeBase',{0:i.title})),description:() => ($t('projectKnowledge.laterTasksCannotReadAnymore')),action:'common.delete'})))return;setError('');try{await request('remove',project.id,{itemId:i.id});setOpen(null);setNotice(() => ($t('projectKnowledge.deleted',{0:i.title})));load();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notDeletedTryAgain')));}}
 return <PageContainer className="nr-page"><PageHeader title={$t('projectKnowledge.projectKnowledge')} description={$t('projectKnowledge.whatAiTeamKnowsAbout')} actions={isAdmin&&<Button disabled={!project} onClick={()=>setAdding(true)}><PlusIcon/>{$t('common.add')}</Button>}/><AdminOnlyNote/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <ReadOnly.Provider value={!isAdmin}>{project&&<LanguageSetting project={project} onSaved={msg=>{setNotice(msg);window.dispatchEvent(new Event('reach-project-saved'));}} onError={setError}/>}
  {project&&<MemoryCard project={project} onSaved={msg=>{setNotice(msg||(()=>$t('projectKnowledge.memorySavedLaterDailyAnalyses')));window.dispatchEvent(new Event('reach-project-saved'));}}/>}
  {project&&<KnowledgeTable items={items} onOpen={setOpen} onRemove={i=>void remove(i)}/>}
  {project&&<AddKnowledge open={adding} projectId={project.id} onClose={()=>setAdding(false)} onAdded={msg=>{setAdding(false);setNotice(msg);load();window.dispatchEvent(new Event('reach-project-saved'));}}/>}
  {project&&<ItemDrawer projectId={project.id} item={open} onClose={()=>setOpen(null)} onChanged={msg=>{setNotice(msg);load();}} onRemove={remove}/>}</ReadOnly.Provider>
 </PageContainer>;
}
// AI 写的内容用的语言 (2026-10-07): one line above 记忆; the analysis, opportunities, task documents and memory follow it.
const getLanguageNames = (): Record<'zh-CN'|'en-US',string> => ({'zh-CN':$t('common.chineseLanguage'),'en-US':'English'});
function LanguageSetting({project,onSaved,onError}:{project:Project;onSaved:(msg:Message)=>void;onError:(msg:Message)=>void}):ReactElement{
 const value=project.language==='en-US'?'en-US':'zh-CN',[busy,setBusy]=useState(false),readOnly=useContext(ReadOnly);
 async function change(next:'zh-CN'|'en-US'){if(next===value)return;setBusy(true);onError('');try{await api.action('nrProjects','edit',{method:'POST',body:{projectId:String(project.id),language:next}});onSaved(() => ($t('projectKnowledge.changedAiWrittenContentUses',{0:getLanguageNames()[next]})));}catch(e){onError(() => (e instanceof Error?$legacyText(e.message):$t('common.notChangedTryAgain')));}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-2 text-sm" data-project-language>
  <span className="text-muted-foreground">{$t('common.languageAiWrittenContent')}</span>
  <select aria-label={$t('common.languageAiWrittenContent')} value={value} disabled={busy||readOnly} onChange={e=>void change(e.target.value as 'zh-CN'|'en-US')} className="min-w-28">{(Object.keys(getLanguageNames()) as ('zh-CN'|'en-US')[]).map(k=><option key={k} value={k}>{getLanguageNames()[k]}</option>)}</select>
  <InfoTip label={$t('common.info')}>{$t('projectKnowledge.dailyAnalysisOpportunitiesTaskDocuments')}</InfoTip>
 </div>;
}
// 记忆: the nine sections, edited in place; the length shown against what is suggested, since it is read every time.
function MemoryCard({project,onSaved}:{project:Project&{memory?:Partial<Memory>};onSaved:(msg?:Message)=>void}):ReactElement{
 const memory=memoryOf(project),[draft,setDraft]=useState<{name:string;memory:Memory}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const updates=useMemoryUpdates(project.id,onSaved),readOnly=useContext(ReadOnly);
 useUnsavedWarning(Boolean(draft&&JSON.stringify(draft.memory)!==JSON.stringify(memory)));
 const shown=draft?.memory||memory,total=Object.values(shown).reduce((n,t)=>n+t.length,0);
 async function save(){if(!draft)return;setBusy(true);setError('');try{await request('saveMemory',project.id,{name:draft.name,memory:draft.memory});setDraft(null);onSaved();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notSavedTryAgain')));}finally{setBusy(false);}}
 return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t('projectKnowledge.memory')}>
  <div className="flex flex-wrap items-center gap-2"><NotebookPenIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">{$t('projectKnowledge.memory')}</h2><InfoTip label={$t('projectKnowledge.whatMemory')}>{help($t('projectKnowledge.memory'))}</InfoTip>
   <span className={cn('text-xs',total>SUGGESTED?'text-nr-ink-amber':'text-muted-foreground')}>{$tj('projectKnowledge.aboutCharactersKeepUnder',{0:total.toLocaleString(getCurrentLocale()),1:SUGGESTED.toLocaleString(getCurrentLocale())})}</span>
   {!readOnly&&<span className="ml-auto flex gap-2">{draft?<><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>{$t('common.cancel')}</Button><Button size="sm" disabled={busy||!draft.name.trim()} onClick={()=>void save()}>{$t('common.save')}</Button></>
    :<><Button size="sm" variant="ghost" disabled={Boolean(updates.status?.running)} onClick={()=>void updates.run('draft')}>{updates.status?.draft?.status==='done'?$t('projectKnowledge.regenerate'):$t('projectKnowledge.generateWebsiteMaterials')}</Button><Button size="sm" variant="outline" onClick={()=>setDraft({name:project.name,memory})}><PencilIcon/>{$t('common.edit')}</Button></>}</span>}</div>
  <p className="text-xs text-muted-foreground">{$t('projectKnowledge.everyDailyAnalysisTaskReads')}</p>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  {!draft&&<MemoryUpdates updates={updates}/>}
  {draft?<div className="flex flex-col gap-3"><label className="nr-field">{$t('common.projectName')}<input value={draft.name} maxLength={200} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   {getMemorySections().map(([k,title,hint])=><label key={k} className="nr-field">{title}<textarea rows={k==='brand'||k==='product'?4:3} maxLength={4000} placeholder={hint} value={draft.memory[k]} onChange={e=>setDraft({...draft,memory:{...draft.memory,[k]:e.target.value}})}/></label>)}</div>
  :<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
   <dt className="text-xs text-muted-foreground sm:pt-0.5">{$t('common.projectName')}</dt><dd className="m-0">{project.name}</dd>
   {getMemorySections().map(([k,title,hint])=><div key={k} className="contents"><dt className="text-xs text-muted-foreground sm:pt-0.5">{title}</dt><dd className={cn('m-0 whitespace-pre-wrap',!memory[k]&&'text-xs text-muted-foreground')}>{memory[k]||$t('projectKnowledge.notFilled',{0:hint})}</dd></div>)}
  </dl>}
 </section>;
}
// 记忆 that keeps up (confirmed 2026-10-04): the first draft written from the website and the 知识库 when the project was
// created, and the weekly suggestions from change requests, approved results and the website, accepted one by one.
type MemorySuggestion={id:string;section:MemoryKey;label:string;text:string;replace?:string;reason?:string;examples?:string[];source:'reviews'|'results'|'site'|'draft';at:string};
type MemoryStatus={running:'draft'|'check'|null;aiReady:boolean;draft:{status:'done'|'failed';at:string;pages?:{url:string;title:string}[];items?:string[];filled?:string[];suggested?:number;error?:string;seen:boolean}|null;lastCheck:{at:string;ok:boolean;error?:string;added?:number}|null;suggestions:MemorySuggestion[]};
const getSource = (): Record<MemorySuggestion['source'],string> => ({reviews:$t('projectKnowledge.taskFeedback'),results:$t('projectKnowledge.approvedDeliverables'),site:$t('projectKnowledge.website'),draft:$t('projectKnowledge.rewriteWebsiteMaterials')});
const memoryRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrMemory',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
function useMemoryUpdates(projectId:number,onSaved:(msg?:Message)=>void){
 const [status,setStatus]=useState<MemoryStatus>(),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>memoryRequest<MemoryStatus>('status',projectId).then(setStatus).catch(()=>setError(() => ($t('projectKnowledge.notLoadMemoryUpdatesRefresh'))));
 useEffect(()=>{setStatus(undefined);void load();},[projectId]);
 // While a draft or a check runs, look again every few seconds; when it ends, 记忆 may have changed.
 useEffect(()=>{if(!status?.running)return;const t=setTimeout(()=>void memoryRequest<MemoryStatus>('status',projectId).then(next=>{setStatus(next);if(!next.running)window.dispatchEvent(new Event('reach-project-saved'));}).catch(()=>undefined),4000);return()=>clearTimeout(t);},[status]);
 async function act(action:string,body:object={},done?:(r:MemoryStatus&{memory?:string[]})=>void){setBusy(true);setError('');try{const r=await memoryRequest<MemoryStatus&{memory?:string[]}>(action,projectId,body);setStatus(r);done?.(r);}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.retryFailure')));}finally{setBusy(false);}}
 return {status,busy,error,
  run:(kind:'draft'|'check')=>act(kind),seen:()=>act('seen'),dismiss:(id:string)=>act('dismiss',{ids:[id]}),
  accept:(id:string)=>act('accept',{ids:[id]},r=>onSaved(() => ($t('projectKnowledge.memoryUpdated',{0:(r.memory||[]).join('、')}))))};
}
function MemoryUpdates({updates}:{updates:ReturnType<typeof useMemoryUpdates>}):ReactElement|null{
 const {status,busy,error}=updates,[showRead,setShowRead]=useState(false),readOnly=useContext(ReadOnly);if(!status)return null;const d=status.draft,c=status.lastCheck;
 return <div className="flex flex-col gap-3">
  {error&&<p role="alert" className="nr-error">{error}</p>}
  {status.running?<p aria-live="polite" className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true"/>{status.running==='draft'?$t('projectKnowledge.readingWebsiteMaterialsWriteFirst'):$t('projectKnowledge.checkingUpdates')}</p>
   :d&&!d.seen?(d.status==='done'?<div className="rounded-md bg-nr-tint-blue px-3 py-2 text-sm text-nr-ink-blue" data-memory-draft>
    <p>{$tj('projectKnowledge.aiDraftReadWebsitePages',{0:d.pages?.length||0,1:d.items?.length?$t('projectKnowledge.materials',{0:d.items.length}):'',2:day(d.at),3:d.filled?.length?$t('projectKnowledge.filled',{0:d.filled.join('、')}):$t('projectKnowledge.nothingFoundEmptySections'),4:d.suggested?$t('projectKnowledge.suggestionsSectionsAlreadyWrittenBelow',{0:d.suggested}):''})}</p>
    {showRead&&<ul className="mt-1.5 list-disc pl-5 text-xs">{d.pages?.map(p=><li key={p.url}><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title||p.url}</a></li>)}{d.items?.map(t=><li key={t}>{$tj('projectKnowledge.knowledgeBaseValue',{0:t})}</li>)}</ul>}
    <div className="mt-1.5 flex gap-2"><Button size="xs" variant="ghost" onClick={()=>setShowRead(v=>!v)}>{showRead?$t('common.collapse'):$t('projectKnowledge.whatRead')}</Button><Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.seen()}>{$t('projectKnowledge.got')}</Button></div></div>
   :<div data-memory-draft><InlineError action={<span className="ml-auto flex gap-2">{!readOnly&&status.aiReady&&<Button size="xs" variant="outline" disabled={busy} onClick={()=>void updates.run('draft')}>{$t('common.retry')}</Button>}<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.seen()}>{$t('projectKnowledge.got')}</Button></span>}>{$tj('projectKnowledge.firstMemoryDraftNotGenerated',{0:$legacyText(d.error)})}</InlineError></div>):null}
  {status.suggestions.length?<div className="rounded-md border" aria-label={$t('projectKnowledge.suggestedUpdates')} role="region">
   <div className="flex items-center gap-2 border-b px-3 py-2"><AiMark label={$t('common.aiSuggestions')}/><h3 className="text-sm font-semibold">{$tj('projectKnowledge.suggestedUpdatesValue',{0:status.suggestions.length})}</h3><span className="hidden text-xs text-muted-foreground sm:inline">{$t('projectKnowledge.addedMemoryLaterTasksRead')}</span></div>
   {status.suggestions.map(x=><div key={x.id} className="flex items-start gap-3 border-b px-3 py-2.5 last:border-0" data-suggestion={x.id}>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm"><p><span className="text-muted-foreground">{$t(x.label)} · </span>{x.replace?<><span className="text-muted-foreground line-through">{x.replace}</span> → </>:null}<span className="whitespace-pre-wrap">{x.text}</span></p>
     <p className="text-xs text-muted-foreground">{getSource()[x.source]}{x.reason?`：${x.reason}`:''}{x.examples?.length?$t('projectKnowledge.example',{0:x.examples.join('；')}):''}</p></div>
    {!readOnly&&<><Button size="xs" variant="outline" disabled={busy} onClick={()=>void updates.accept(x.id)}>{x.replace?$t('projectKnowledge.replace'):$t('projectKnowledge.add')}</Button><Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.dismiss(x.id)}>{$t('common.ignore')}</Button></>}</div>)}
  </div>:null}
  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{status.aiReady?<>{$tj('projectKnowledge.checksTaskFeedbackApprovedDeliverables',{0:c?$t('projectKnowledge.lastChecked',{0:day(c.at),1:c.ok?(c.added?$t('projectKnowledge.suggestions',{0:c.added}):$t('projectKnowledge.nothingUpdate')):$t('projectKnowledge.notComplete',{0:$legacyText(c.error)})}):''})}{!readOnly&&<Button size="xs" variant="link" className="h-auto px-0" disabled={busy||Boolean(status.running)} onClick={()=>void updates.run('check')}>{$t('common.checkNow')}</Button>}</>:$t('projectKnowledge.onlineAiConnectedWritesFirst')}</p>
 </div>;
}
// 知识库: one row per item, newest first; search and filter by category; a row opens the full text.
function KnowledgeTable({items,onOpen,onRemove}:{items?:Item[];onOpen:(i:Item)=>void;onRemove:(i:Item)=>void}):ReactElement{
 const [q,setQ]=useState(''),[category,setCategory]=useState(''),readOnly=useContext(ReadOnly);
 const visible=useMemo(()=>(items||[]).filter(i=>(!category||i.category===category)&&(!q.trim()||`${i.title} ${i.summary}`.toLowerCase().includes(q.trim().toLowerCase()))),[items,q,category]);
 return <section className="flex flex-col gap-3" aria-label={$t('projectKnowledge.knowledgeBase')}>
  <div className="flex flex-wrap items-center gap-2"><FileTextIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">{$t('projectKnowledge.knowledgeBase')}</h2><InfoTip label={$t('projectKnowledge.whatKnowledgeBase')}>{help($t('projectKnowledge.knowledgeBase'))}</InfoTip><span className="text-xs text-muted-foreground tabular-nums">{items?.length??''}</span><span className="text-xs text-muted-foreground">{$t('projectKnowledge.lookedUpWhenNeeded')}</span></div>
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t('projectKnowledge.searchKnowledgeBase')} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t('projectKnowledge.searchKnowledgeBase')} className="w-full pl-8!"/></label>
   <select aria-label={$t('projectKnowledge.filterCategory')} value={category} onChange={e=>setCategory(e.target.value)} className="min-w-28"><option value="">{$t('projectKnowledge.categories')}</option>{getCategories().map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {!items?<p role="status" className="text-sm text-muted-foreground">{$t('common.loadingLoading')}</p>:visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label={$t('projectKnowledge.knowledgeBaseMaterial')}>
   <colgroup><col/><col className="w-24"/><col className="w-36"/><col className="w-20"/><col className="w-12"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t('projectKnowledge.titleSummary'),$t('common.category'),$t('common.type'),$t('common.add')].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">{$t('common.delete')}</span></th></tr></thead>
   <tbody>{visible.map(i=><tr key={i.id} data-item-id={i.id} className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={()=>onOpen(i)}>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(i);}}>{i.title}</button><p className="truncate text-xs text-muted-foreground">{i.summary}</p></td>
    <td className="px-3 py-2.5"><Tag tone="grey">{categoryName(i.category)}</Tag></td>
    <td className="truncate px-3 py-2.5 text-xs text-muted-foreground" title={i.fileName}>{$tj('projectKnowledge.characters',{0:i.kind==='file'?$t('projectKnowledge.file'):i.kind==='link'?$t('projectKnowledge.webPage'):$t('projectKnowledge.text'),1:i.chars.toLocaleString(getCurrentLocale())})}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(i.addedAt)}</td>
    <td className="px-1 py-2.5 text-center">{!readOnly&&<Button size="icon-xs" variant="ghost" aria-label={$t('common.deleteValue',{0:i.title})} title={$t('common.delete')} onClick={e=>{e.stopPropagation();onRemove(i);}}><Trash2Icon className="text-destructive"/></Button>}</td></tr>)}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{items.length?$t('projectKnowledge.noMatchingMaterial'):$t('projectKnowledge.noMaterialYetClickAdd')}</p>}
  <p className="nr-footnote">{$t('projectKnowledge.scopeHelp')}</p>
 </section>;
}
// Adding by hand for now: paste text or upload a file, with an optional title and a category.
type Suggestion={kind:'knowledge'|'skill'|'skills';draftId?:string;source?:string;chars?:number;aiUsed?:boolean;aiError?:string;title?:string;category?:string;summary?:string;memory?:MemoryLine[];skill?:{name:string;description:string;files:number};choices?:{path:string;name:string;description:string;exists?:boolean}[]};
type MemoryLine={section:MemoryKey;label:string;text:string;reason?:string;examples?:string[]};
const addRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrKnowledgeAdd',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// 添加 (项目知识 step 3): a link, text or a file. The online AI suggests the 知识库 title and category and new 记忆 lines;
// a SKILL.md or a Skill link goes to Skills. Nothing is saved until 确认.
function AddKnowledge({open,projectId,onClose,onAdded}:{open:boolean;projectId:number;onClose:()=>void;onAdded:(msg:Message)=>void}):ReactElement{
 const [mode,setMode]=useState<'text'|'file'|'link'>('text'),[text,setText]=useState(''),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const [sug,setSug]=useState<Suggestion>(),[keep,setKeep]=useState(true),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[lines,setLines]=useState<Record<number,boolean>>({}),[paths,setPaths]=useState<string[]>([]);
 useEffect(()=>{if(open){setText('');setUrl('');setFile(null);setError('');setSug(undefined);}},[open, setError]);
 async function look(){setError('');if(mode==='text'&&!text.trim()){setError(() => ($t('projectKnowledge.pasteSomeContent')));return;}if(mode==='file'&&!file){setError(() => ($t('projectKnowledge.pickFile')));return;}if(mode==='link'&&!url.trim()){setError(() => ($t('projectKnowledge.urlRequired')));return;}if(file&&mode==='file'&&file.size>5*1024*1024){setError(() => ($t('projectKnowledge.fileTooLargeKeepUnder')));return;}
  setBusy(true);try{const body=mode==='file'&&file?{file:{name:file.name,data:await toBase64(file)}}:mode==='link'?{url:url.trim()}:{text};const r=await addRequest<Suggestion>('suggest',projectId,body);
   setSug(r);setKeep(true);setTitle(r.title||'');setCategory(r.category||'other');setLines(Object.fromEntries((r.memory||[]).map((_,i)=>[i,true])));setPaths([]);}
  catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('projectKnowledge.notLoadTryAgain')));}finally{setBusy(false);}}
 async function confirmAdd(){if(!sug)return;setBusy(true);setError('');
  try{const memory=(sug.memory||[]).filter((_,i)=>lines[i]).map(m=>({section:m.section,text:m.text}));
   const r=await addRequest<{item?:{title:string};memory?:string[];skill?:{skill?:{name:string};imported?:string[]}}>('confirm',projectId,sug.kind==='knowledge'?{draftId:sug.draftId,saveKnowledge:keep,title,category,memory}:sug.draftId?{draftId:sug.draftId}:{kind:sug.kind,link:sug.source,paths});
   onAdded(() => ([r.item?$t('projectKnowledge.savedKnowledgeBase',{0:r.item.title}):'',r.memory?.length?$t('projectKnowledge.addedMemory',{0:r.memory.join('、')}):'',r.skill?.skill?$t('projectKnowledge.skillImported',{0:r.skill.skill.name}):r.skill?.imported?.length?$t('projectKnowledge.skillImported',{0:r.skill.imported.join('、')}):''].filter(Boolean).join('；')||$t('projectKnowledge.nothingSaved')));}
  catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notSavedTryAgain')));}finally{setBusy(false);}}
 const picked=(sug?.memory||[]).filter((_,i)=>lines[i]).length,nothing=sug?.kind==='knowledge'&&!keep&&!picked;
 // Long AI suggestions must scroll inside the modal: the background is scroll-locked while it is open.
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl'>
  <DialogHeader className='shrink-0'><DialogTitle>{$t('common.add')}</DialogTitle><DialogDescription>{sug?$t('projectKnowledge.lookOverAiSuggestionsSelect'):$t('projectKnowledge.pasteTextUploadFileEnter')}</DialogDescription></DialogHeader>
  <div className='-mx-4 min-h-0 flex-1 overflow-y-auto px-4' data-knowledge-add-body>
  {!sug?<div className="flex flex-col gap-3">
   <div className="nr-tabs" role="group" aria-label={$t('projectKnowledge.howAdd')}>{([['text',$t('projectKnowledge.pasteText')],['file',$t('projectKnowledge.uploadFile')],['link',$t('projectKnowledge.urlPlaceholder')]] as const).map(([k,v])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>{setMode(k);setError('');}}>{v}</button>)}</div>
   {mode==='text'?<label className="nr-field">{$t('projectKnowledge.content')}<textarea rows={8} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={$t('projectKnowledge.pasteArticleInterviewNotesCompetitor')}/></label>
   :mode==='file'?<label className="nr-field">{$t('projectKnowledge.file')}<input type="file" accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.md,.markdown,.txt,.csv,.json" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/><span className="text-xs font-normal text-muted-foreground">{$t('projectKnowledge.pdfWordPowerpointExcelMarkdown')}</span></label>
   :<label className="nr-field">{$t('projectKnowledge.url')}<input value={url} disabled={busy} placeholder={$t('projectKnowledge.httpsWebPageSkillLink')} onChange={e=>setUrl(e.target.value)}/></label>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  :sug.kind==='knowledge'?<div className="flex flex-col gap-3" data-suggestion="knowledge">
   {sug.aiError?<InlineError>{sug.aiError}</InlineError>:null}
   <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={keep} disabled={busy} onChange={e=>setKeep(e.target.checked)}/>{$t('projectKnowledge.saveKnowledgeBase')}<span className="text-xs font-normal text-muted-foreground">{$tj('common.characters',{0:sug.chars?.toLocaleString(getCurrentLocale())})}</span></label>
   {keep?<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"><label className="nr-field">{$t('common.title')}<input value={title} maxLength={120} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="nr-field">{$t('common.category')}<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{getCategories().map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>:null}
   {sug.summary&&keep?<p className="text-xs text-muted-foreground">{sug.summary}</p>:null}
   <div className="flex flex-col gap-2"><p className="text-sm font-medium">{$tj('projectKnowledge.addMemory',{0:sug.memory?.length?'':$t('projectKnowledge.nothingWorthRememberingLongTerm')})}</p>
    {(sug.memory||[]).map((m,i)=><label key={i} className="flex items-start gap-2 rounded-md border p-2.5 text-sm" data-memory-line={m.section}><input type="checkbox" className="mt-1" checked={Boolean(lines[i])} disabled={busy} onChange={e=>setLines({...lines,[i]:e.target.checked})}/><span className="min-w-0"><span className="text-xs text-muted-foreground">{m.label}</span><span className="block">{m.text}</span>{m.reason?<span className="block text-xs text-muted-foreground">{m.reason}</span>:null}</span></label>)}</div>
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  :<div className="flex flex-col gap-3" data-suggestion="skill">
   {sug.kind==='skill'?<p className="text-sm">{$t('projectKnowledge.skill')}<b className="font-medium">{sug.skill?.name}</b>{$tj('projectKnowledge.onceConfirmedGoesSkillsAgent',{0:sug.skill?.description?` — ${sug.skill.description}`:''})}</p>
   :<><p className="text-sm">{$tj('projectKnowledge.repositorySkillsSelectOnesImport',{0:sug.choices?.length})}</p>{(sug.choices||[]).map(c=><label key={c.path} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy||c.exists} checked={paths.includes(c.path)} onChange={e=>setPaths(e.target.checked?[...paths,c.path]:paths.filter(x=>x!==c.path))}/><span><b className="font-medium">{c.name}</b>{c.exists?$t('projectKnowledge.exists'):''}<span className="block text-xs text-muted-foreground">{c.description}</span></span></label>)}</>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>}
  </div>
  <DialogFooter className='shrink-0'>{sug?<><Button variant="ghost" disabled={busy} onClick={()=>setSug(undefined)}>{$t('projectKnowledge.back')}</Button><Button disabled={busy||nothing||(sug.kind==='skills'&&!paths.length)} onClick={()=>void confirmAdd()}>{busy?$t('common.saving'):$t('projectKnowledge.confirm')}</Button></>
   :<><Button variant="ghost" disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button><Button disabled={busy} onClick={()=>void look()}>{busy?$t('common.loadingLoading'):$t('projectKnowledge.next')}</Button></>}</DialogFooter>
 </DialogContent></Dialog>;
}
const toBase64=(f:File)=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>no(new Error($t('projectKnowledge.notReadFile')));r.readAsDataURL(f);});
// One item: its title and category (editable) and removing it, above its full text.
function ItemDrawer({projectId,item,onClose,onChanged,onRemove}:{projectId:number;item:Item|null;onClose:()=>void;onChanged:(msg:Message)=>void;onRemove:(i:Item)=>Promise<void>}):ReactElement{
 const [text,setText]=useState<string>(),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),readOnly=useContext(ReadOnly);
 useEffect(()=>{setText(undefined);setError('');if(!item)return;setTitle(item.title);setCategory(item.category);void request<{text:string}>('get',projectId,{itemId:item.id}).then(r=>setText(r.text)).catch(()=>setError(() => ($t('projectKnowledge.notLoadFullText'))));},[item?.id]);
 async function save(){if(!item)return;setBusy(true);setError('');
  try{await request('edit',projectId,{itemId:item.id,title,category});onChanged(() => ($t('projectKnowledge.saved')));onClose();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.notSavedTryAgain')));}finally{setBusy(false);}}
 const changed=item&&(title.trim()!==item.title||category!==item.category);
 return <Sheet open={Boolean(item)} onOpenChange={o=>{if(!o)onClose();}}><SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
  <SheetHeader className="sr-only"><SheetTitle>{item?.title||$t('projectKnowledge.material')}</SheetTitle></SheetHeader>
  {item&&<div className="flex flex-col gap-3 p-4 pt-12" aria-label={$t('projectKnowledge.materialDetails')} role="region">
   <label className="nr-field">{$t('common.title')}<input value={title} maxLength={120} disabled={readOnly} onChange={e=>setTitle(e.target.value)}/></label>
   <div className="flex flex-wrap items-end gap-3"><label className="nr-field">{$t('common.category')}<select value={category} disabled={readOnly} onChange={e=>setCategory(e.target.value)}>{getCategories().map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <p className="pb-2 text-xs text-muted-foreground">{$tj('projectKnowledge.charactersAdded',{0:item.kind==='file'?$t('projectKnowledge.fileValue',{0:item.fileName}):item.kind==='link'?$t('projectKnowledge.webPageValue',{0:item.source||''}):$t('projectKnowledge.pastedText'),1:item.chars.toLocaleString(getCurrentLocale()),2:day(item.addedAt)})}</p></div>
   {!readOnly&&<div className="flex items-center gap-2"><Button size="sm" disabled={busy||!changed||!title.trim()} onClick={()=>void save()}>{$t('common.save')}</Button><Button size="sm" variant="outline" className="ml-auto text-destructive" disabled={busy} onClick={()=>void onRemove(item)}><Trash2Icon/>{$t('common.delete')}</Button></div>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
   <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{text===undefined?$t('common.loadingLoading'):text}</div>
  </div>}
 </SheetContent></Sheet>;
}
