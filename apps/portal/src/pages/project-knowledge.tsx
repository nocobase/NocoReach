import { $t, $tj } from "@/i18n";
import {useEffect,useMemo,useState,type ReactElement} from 'react';
import {FileTextIcon,LoaderCircleIcon,NotebookPenIcon,PencilIcon,PlusIcon,SearchIcon,Trash2Icon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Tag} from '@/components/reach/tag';
import {AiMark} from '@/components/reach/actor';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '@/components/ui/sheet';
import {cn} from '@/lib/utils';
import {useProject,useUnsavedWarning,type Project} from './reach-data';
import {confirmAction} from '@/components/reach/confirm';
import {InlineError} from '@/components/reach/states';
import {InfoTip} from '@/components/reach/info-tip';
import {help} from './glossary';
// 项目知识 (SPEC §6.0): what the AI team knows about this project — 记忆, read every time and kept short, in the sections of
// a brand handbook; and 知识库, material the Agent looks up when it needs to.
export const MEMORY_SECTIONS:[MemoryKey,string,string][]=[['brand',$t("品牌基础"),$t("品牌名、一句话介绍、定位、官网")],['product',$t("产品"),$t("产品线、核心功能、价值主张、关键页面")],['audience',$t("受众"),$t("目标人群，他们关心什么")],['markets',$t("市场与语言"),$t("面向哪些地区和语言，各语言版本的规则")],['voice',$t("语气与风格"),$t("品牌个性、语气、写作规矩")],['wording',$t("用词"),$t("术语表：用哪个、不用哪个；产品名写法")],['messages',$t("核心信息"),$t("主张、要反复强调的卖点和证据")],['competitors',$t("竞品"),$t("主要竞品和我们的区别")],['rules',$t("规矩与禁区"),$t("不能改的页面和内容、不能说的话")]];
export type MemoryKey='brand'|'product'|'audience'|'markets'|'voice'|'wording'|'messages'|'competitors'|'rules';
export type Memory=Record<MemoryKey,string>;
const SUGGESTED=3000;
// Same reading as the server's memoryOf: saved sections, or a project's older fields read into them.
export function memoryOf(p?:Partial<Project>&{memory?:Partial<Memory>}):Memory{
 const s=(v?:string)=>(v||'').trim();
 if(p?.memory)return Object.fromEntries(MEMORY_SECTIONS.map(([k])=>[k,s(p.memory?.[k])])) as Memory;
 const join=(...xs:string[])=>xs.filter(Boolean).join('\n');
 return {brand:join(s(p?.description),s(p?.positioning)&&$t("定位：{0}",{0:s(p?.positioning)})),product:s(p?.keyPages)&&$t("关键页面：\n{0}",{0:s(p?.keyPages)}),audience:s(p?.audience),markets:join(s(p?.market),s(p?.contentLanguage)&&$t("内容语言：{0}",{0:s(p?.contentLanguage)})),voice:s(p?.writingStyle),wording:s(p?.terminology),messages:'',competitors:s(p?.competitors),rules:s(p?.doNotChange)};
}
export const categories:[string,string][]=[['competitor',$t("竞品")],['customer',$t("客户")],['product',$t("产品")],['industry',$t("行业")],['other',$t("其他")]];
const categoryName=(c:string)=>categories.find(([k])=>k===c)?.[1]||$t("其他");
type Item={id:string;title:string;category:string;kind:'text'|'file'|'link';fileName?:string;source?:string;chars:number;summary:string;addedAt:string};
const request=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrKnowledge',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
const day=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()}`;};
export default function ProjectKnowledgePage(){
 const {project,error:projectError}=useProject();
 const [items,setItems]=useState<Item[]>(),[adding,setAdding]=useState(false),[open,setOpen]=useState<Item|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=()=>{if(project)void request<{items:Item[]}>('list',project.id).then(r=>setItems(r.items)).catch(()=>setError($t("读取知识库失败，请刷新后重试。")));};
 useEffect(load,[project?.id]);
 // Removing an item, from its row or from the drawer.
 async function remove(i:Item){if(!project||!(await confirmAction({title:$t("从知识库删除“{0}”？",{0:i.title}),description:$t("之后的任务不会再读到它。"),action:'删除'})))return;setError('');try{await request('remove',project.id,{itemId:i.id});setOpen(null);setNotice($t("已删除：{0}",{0:i.title}));load();}catch(e){setError(e instanceof Error?e.message:$t("没有删除，请重试。"));}}
 return <PageContainer className="nr-page"><PageHeader title={$t("项目知识")} description={$t("AI 团队对这个项目的了解：记忆每次都读，知识库需要时去查。")} actions={<Button disabled={!project} onClick={()=>setAdding(true)}><PlusIcon/>{$t("添加")}</Button>}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {project&&<LanguageSetting project={project} onSaved={msg=>{setNotice(msg);window.dispatchEvent(new Event('reach-project-saved'));}} onError={setError}/>}
  {project&&<MemoryCard project={project} onSaved={msg=>{setNotice(msg||$t("记忆已保存。之后的每日分析和任务都会读到。"));window.dispatchEvent(new Event('reach-project-saved'));}}/>}
  {project&&<KnowledgeTable items={items} onOpen={setOpen} onRemove={i=>void remove(i)}/>}
  {project&&<AddKnowledge open={adding} projectId={project.id} onClose={()=>setAdding(false)} onAdded={msg=>{setAdding(false);setNotice(msg);load();window.dispatchEvent(new Event('reach-project-saved'));}}/>}
  {project&&<ItemDrawer projectId={project.id} item={open} onClose={()=>setOpen(null)} onChanged={msg=>{setNotice(msg);load();}} onRemove={remove}/>}
 </PageContainer>;
}
// AI 写的内容用的语言 (2026-10-07): one line above 记忆; the analysis, opportunities, task documents and memory follow it.
const LANGUAGE_NAMES:Record<'zh-CN'|'en-US',string>={'zh-CN':$t("简体中文"),'en-US':'English'};
function LanguageSetting({project,onSaved,onError}:{project:Project;onSaved:(msg:string)=>void;onError:(msg:string)=>void}):ReactElement{
 const value=project.language==='en-US'?'en-US':'zh-CN',[busy,setBusy]=useState(false);
 async function change(next:'zh-CN'|'en-US'){if(next===value)return;setBusy(true);onError('');try{await api.action('nrProjects','edit',{method:'POST',body:{projectId:String(project.id),language:next}});onSaved($t("已改为“{0}”，之后 AI 写的内容用这种语言。",{0:LANGUAGE_NAMES[next]}));}catch(e){onError(e instanceof Error?e.message:$t("没有改成，请重试。"));}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-2 text-sm" data-project-language>
  <span className="text-muted-foreground">{$t("AI 写的内容用的语言")}</span>
  <select aria-label={$t("AI 写的内容用的语言")} value={value} disabled={busy} onChange={e=>void change(e.target.value as 'zh-CN'|'en-US')} className="min-w-28">{(Object.keys(LANGUAGE_NAMES) as ('zh-CN'|'en-US')[]).map(k=><option key={k} value={k}>{LANGUAGE_NAMES[k]}</option>)}</select>
  <InfoTip label={$t("说明")}>{$t("每日分析、机会、任务文档和记忆用这种语言写；你自己写的内容不受影响。")}</InfoTip>
 </div>;
}
// 记忆: the nine sections, edited in place; the length shown against what is suggested, since it is read every time.
function MemoryCard({project,onSaved}:{project:Project&{memory?:Partial<Memory>};onSaved:(msg?:string)=>void}):ReactElement{
 const memory=memoryOf(project),[draft,setDraft]=useState<{name:string;memory:Memory}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const updates=useMemoryUpdates(project.id,onSaved);
 useUnsavedWarning(Boolean(draft&&JSON.stringify(draft.memory)!==JSON.stringify(memory)));
 const shown=draft?.memory||memory,total=Object.values(shown).reduce((n,t)=>n+t.length,0);
 async function save(){if(!draft)return;setBusy(true);setError('');try{await request('saveMemory',project.id,{name:draft.name,memory:draft.memory});setDraft(null);onSaved();}catch(e){setError(e instanceof Error?e.message:$t("没有保存，请重试。"));}finally{setBusy(false);}}
 return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t("记忆")}>
  <div className="flex flex-wrap items-center gap-2"><NotebookPenIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">{$t("记忆")}</h2><InfoTip label={$t("记忆是什么")}>{help($t("记忆"))}</InfoTip>
   <span className={cn('text-xs',total>SUGGESTED?'text-nr-ink-amber':'text-muted-foreground')}>{$tj("约 {0} 字 · 建议 {1} 字以内",{0:total.toLocaleString(),1:SUGGESTED.toLocaleString()})}</span>
   <span className="ml-auto flex gap-2">{draft?<><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>{$t("取消")}</Button><Button size="sm" disabled={busy||!draft.name.trim()} onClick={()=>void save()}>{$t("保存")}</Button></>
    :<><Button size="sm" variant="ghost" disabled={Boolean(updates.status?.running)} onClick={()=>void updates.run('draft')}>{updates.status?.draft?.status==='done'?$t("重新生成"):$t("根据官网和资料生成")}</Button><Button size="sm" variant="outline" onClick={()=>setDraft({name:project.name,memory})}><PencilIcon/>{$t("编辑")}</Button></>}</span></div>
  <p className="text-xs text-muted-foreground">{$t("每日分析和每个任务都会读这里，写结论就好；长材料放进下面的知识库。")}</p>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  {!draft&&<MemoryUpdates updates={updates}/>}
  {draft?<div className="flex flex-col gap-3"><label className="nr-field">{$t("项目名称")}<input value={draft.name} maxLength={200} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   {MEMORY_SECTIONS.map(([k,title,hint])=><label key={k} className="nr-field">{title}<textarea rows={k==='brand'||k==='product'?4:3} maxLength={4000} placeholder={hint} value={draft.memory[k]} onChange={e=>setDraft({...draft,memory:{...draft.memory,[k]:e.target.value}})}/></label>)}</div>
  :<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
   <dt className="text-xs text-muted-foreground sm:pt-0.5">{$t("项目名称")}</dt><dd className="m-0">{project.name}</dd>
   {MEMORY_SECTIONS.map(([k,title,hint])=><div key={k} className="contents"><dt className="text-xs text-muted-foreground sm:pt-0.5">{title}</dt><dd className={cn('m-0 whitespace-pre-wrap',!memory[k]&&'text-xs text-muted-foreground')}>{memory[k]||$t("未填写 · {0}",{0:hint})}</dd></div>)}
  </dl>}
 </section>;
}
// 记忆 that keeps up (confirmed 2026-10-04): the first draft written from the website and the 知识库 when the project was
// created, and the weekly suggestions from change requests, approved results and the website, accepted one by one.
type MemorySuggestion={id:string;section:MemoryKey;label:string;text:string;replace?:string;reason?:string;examples?:string[];source:'reviews'|'results'|'site'|'draft';at:string};
type MemoryStatus={running:'draft'|'check'|null;aiReady:boolean;draft:{status:'done'|'failed';at:string;pages?:{url:string;title:string}[];items?:string[];filled?:string[];suggested?:number;error?:string;seen:boolean}|null;lastCheck:{at:string;ok:boolean;error?:string;added?:number}|null;suggestions:MemorySuggestion[]};
const SOURCE:Record<MemorySuggestion['source'],string>={reviews:$t("来自任务修改意见"),results:$t("来自审核通过的成果"),site:$t("来自官网"),draft:$t("根据官网和资料重写")};
const memoryRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrMemory',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
function useMemoryUpdates(projectId:number,onSaved:(msg?:string)=>void){
 const [status,setStatus]=useState<MemoryStatus>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>memoryRequest<MemoryStatus>('status',projectId).then(setStatus).catch(()=>setError($t("没有读到记忆更新，请刷新后重试。")));
 useEffect(()=>{setStatus(undefined);void load();},[projectId]);
 // While a draft or a check runs, look again every few seconds; when it ends, 记忆 may have changed.
 useEffect(()=>{if(!status?.running)return;const t=setTimeout(()=>void memoryRequest<MemoryStatus>('status',projectId).then(next=>{setStatus(next);if(!next.running)window.dispatchEvent(new Event('reach-project-saved'));}).catch(()=>undefined),4000);return()=>clearTimeout(t);},[status]);
 async function act(action:string,body:object={},done?:(r:MemoryStatus&{memory?:string[]})=>void){setBusy(true);setError('');try{const r=await memoryRequest<MemoryStatus&{memory?:string[]}>(action,projectId,body);setStatus(r);done?.(r);}catch(e){setError(e instanceof Error?e.message:$t("没有完成，请重试。"));}finally{setBusy(false);}}
 return {status,busy,error,
  run:(kind:'draft'|'check')=>act(kind),seen:()=>act('seen'),dismiss:(id:string)=>act('dismiss',{ids:[id]}),
  accept:(id:string)=>act('accept',{ids:[id]},r=>onSaved($t("记忆更新了：{0}",{0:(r.memory||[]).join('、')})))};
}
function MemoryUpdates({updates}:{updates:ReturnType<typeof useMemoryUpdates>}):ReactElement|null{
 const {status,busy,error}=updates,[showRead,setShowRead]=useState(false);if(!status)return null;const d=status.draft,c=status.lastCheck;
 return <div className="flex flex-col gap-3">
  {error&&<p role="alert" className="nr-error">{error}</p>}
  {status.running?<p aria-live="polite" className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true"/>{status.running==='draft'?$t("正在读官网和资料，写初版记忆，一般一两分钟…"):$t("正在检查有没有要更新的…")}</p>
   :d&&!d.seen?(d.status==='done'?<div className="rounded-md bg-nr-tint-blue px-3 py-2 text-sm text-nr-ink-blue" data-memory-draft>
    <p>{$tj("AI 初稿：读了官网 {0} 个页面{1}（{2}）{3}{4}。看一遍，不对的直接改。",{0:d.pages?.length||0,1:d.items?.length?$t("和 {0} 份资料",{0:d.items.length}):'',2:day(d.at),3:d.filled?.length?$t("，填了{0}",{0:d.filled.join('、')}):$t("，空着的分区都没读到内容"),4:d.suggested?$t("；已写过的分区有 {0} 条建议在下面",{0:d.suggested}):''})}</p>
    {showRead&&<ul className="mt-1.5 list-disc pl-5 text-xs">{d.pages?.map(p=><li key={p.url}><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title||p.url}</a></li>)}{d.items?.map(t=><li key={t}>{$tj("知识库：{0}",{0:t})}</li>)}</ul>}
    <div className="mt-1.5 flex gap-2"><Button size="xs" variant="ghost" onClick={()=>setShowRead(v=>!v)}>{showRead?$t("收起"):$t("读了哪些")}</Button><Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.seen()}>{$t("知道了")}</Button></div></div>
   :<div data-memory-draft><InlineError action={<span className="ml-auto flex gap-2">{status.aiReady&&<Button size="xs" variant="outline" disabled={busy} onClick={()=>void updates.run('draft')}>{$t("重试")}</Button>}<Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.seen()}>{$t("知道了")}</Button></span>}>{$tj("初版记忆没有生成：{0}",{0:$t(d.error)})}</InlineError></div>):null}
  {status.suggestions.length?<div className="rounded-md border" aria-label={$t("更新建议")} role="region">
   <div className="flex items-center gap-2 border-b px-3 py-2"><AiMark label={$t("AI 建议")}/><h3 className="text-sm font-semibold">{$tj("{0} 条更新建议",{0:status.suggestions.length})}</h3><span className="hidden text-xs text-muted-foreground sm:inline">{$t("补充后写进记忆，之后的任务都会读到")}</span></div>
   {status.suggestions.map(x=><div key={x.id} className="flex items-start gap-3 border-b px-3 py-2.5 last:border-0" data-suggestion={x.id}>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm"><p><span className="text-muted-foreground">{$t(x.label)} · </span>{x.replace?<><span className="text-muted-foreground line-through">{x.replace}</span> → </>:null}<span className="whitespace-pre-wrap">{x.text}</span></p>
     <p className="text-xs text-muted-foreground">{SOURCE[x.source]}{x.reason?`：${x.reason}`:''}{x.examples?.length?$t("（例如：{0}）",{0:x.examples.join('；')}):''}</p></div>
    <Button size="xs" variant="outline" disabled={busy} onClick={()=>void updates.accept(x.id)}>{x.replace?$t("替换"):$t("补充")}</Button><Button size="xs" variant="ghost" disabled={busy} onClick={()=>void updates.dismiss(x.id)}>{$t("忽略")}</Button></div>)}
  </div>:null}
  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{status.aiReady?<>{$tj("每周自动看一次任务修改意见、审核通过的成果和官网变化，有要更新的会提出建议{0}",{0:c?$t(" · 上次检查 {0}{1}",{0:day(c.at),1:c.ok?(c.added?$t("，{0} 条建议",{0:c.added}):$t("，没有要更新的")):$t("没有完成：{0}",{0:$t(c.error)})}):''})}<Button size="xs" variant="link" className="h-auto px-0" disabled={busy||Boolean(status.running)} onClick={()=>void updates.run('check')}>{$t("立即检查")}</Button></>:$t("接入在线 AI 后，会根据官网写初版记忆，并每周检查要更新的内容。")}</p>
 </div>;
}
// 知识库: one row per item, newest first; search and filter by category; a row opens the full text.
function KnowledgeTable({items,onOpen,onRemove}:{items?:Item[];onOpen:(i:Item)=>void;onRemove:(i:Item)=>void}):ReactElement{
 const [q,setQ]=useState(''),[category,setCategory]=useState('');
 const visible=useMemo(()=>(items||[]).filter(i=>(!category||i.category===category)&&(!q.trim()||`${i.title} ${i.summary}`.toLowerCase().includes(q.trim().toLowerCase()))),[items,q,category]);
 return <section className="flex flex-col gap-3" aria-label={$t("知识库")}>
  <div className="flex flex-wrap items-center gap-2"><FileTextIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">{$t("知识库")}</h2><InfoTip label={$t("知识库是什么")}>{help($t("知识库"))}</InfoTip><span className="text-xs text-muted-foreground tabular-nums">{items?.length??''}</span><span className="text-xs text-muted-foreground">{$t("需要时去查")}</span></div>
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t("搜索知识库")} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t("搜索知识库")} className="w-full pl-8!"/></label>
   <select aria-label={$t("按分类筛选")} value={category} onChange={e=>setCategory(e.target.value)} className="min-w-28"><option value="">{$t("全部分类")}</option>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {!items?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取…")}</p>:visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label={$t("知识库资料")}>
   <colgroup><col/><col className="w-24"/><col className="w-36"/><col className="w-20"/><col className="w-12"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t("标题 · 摘要"),$t("分类"),$t("类型"),$t("添加")].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">{$t("删除")}</span></th></tr></thead>
   <tbody>{visible.map(i=><tr key={i.id} data-item-id={i.id} className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={()=>onOpen(i)}>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(i);}}>{i.title}</button><p className="truncate text-xs text-muted-foreground">{i.summary}</p></td>
    <td className="px-3 py-2.5"><Tag tone="grey">{categoryName(i.category)}</Tag></td>
    <td className="truncate px-3 py-2.5 text-xs text-muted-foreground" title={i.fileName}>{$tj("{0} · {1} 字",{0:i.kind==='file'?$t("文件"):i.kind==='link'?$t("网页"):$t("文字"),1:i.chars.toLocaleString()})}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(i.addedAt)}</td>
    <td className="px-1 py-2.5 text-center"><Button size="icon-xs" variant="ghost" aria-label={$t("删除 {0}",{0:i.title})} title={$t("删除")} onClick={e=>{e.stopPropagation();onRemove(i);}}><Trash2Icon className="text-destructive"/></Button></td></tr>)}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{items.length?$t("没有匹配的资料。"):$t("还没有资料。点右上角“添加”，粘贴文字或上传文件。")}</p>}
  <p className="nr-footnote">{$t("我们自己的网站页面（数据接入 → 网站内容）和仓库不用放进来，Agent 本来就能读。执行任务时，知识库会交给 Agent，放在仓库之外，不会被提交。")}</p>
 </section>;
}
// Adding by hand for now: paste text or upload a file, with an optional title and a category.
type Suggestion={kind:'knowledge'|'skill'|'skills';draftId?:string;source?:string;chars?:number;aiUsed?:boolean;aiError?:string;title?:string;category?:string;summary?:string;memory?:MemoryLine[];skill?:{name:string;description:string;files:number};choices?:{path:string;name:string;description:string;exists?:boolean}[]};
type MemoryLine={section:MemoryKey;label:string;text:string;reason?:string;examples?:string[]};
const addRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrKnowledgeAdd',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// 添加 (项目知识 step 3): a link, text or a file. The online AI suggests the 知识库 title and category and new 记忆 lines;
// a SKILL.md or a Skill link goes to Skills. Nothing is saved until 确认.
function AddKnowledge({open,projectId,onClose,onAdded}:{open:boolean;projectId:number;onClose:()=>void;onAdded:(msg:string)=>void}):ReactElement{
 const [mode,setMode]=useState<'text'|'file'|'link'>('text'),[text,setText]=useState(''),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [sug,setSug]=useState<Suggestion>(),[keep,setKeep]=useState(true),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[lines,setLines]=useState<Record<number,boolean>>({}),[paths,setPaths]=useState<string[]>([]);
 useEffect(()=>{if(open){setText('');setUrl('');setFile(null);setError('');setSug(undefined);}},[open]);
 async function look(){setError('');if(mode==='text'&&!text.trim()){setError($t("请粘贴内容"));return;}if(mode==='file'&&!file){setError($t("请选择一个文件"));return;}if(mode==='link'&&!url.trim()){setError($t("请填一个网址"));return;}if(file&&mode==='file'&&file.size>5*1024*1024){setError($t("文件太大了，请控制在 5 MB 以内"));return;}
  setBusy(true);try{const body=mode==='file'&&file?{file:{name:file.name,data:await toBase64(file)}}:mode==='link'?{url:url.trim()}:{text};const r=await addRequest<Suggestion>('suggest',projectId,body);
   setSug(r);setKeep(true);setTitle(r.title||'');setCategory(r.category||'other');setLines(Object.fromEntries((r.memory||[]).map((_,i)=>[i,true])));setPaths([]);}
  catch(e){setError(e instanceof Error?e.message:$t("没有读出来，请重试。"));}finally{setBusy(false);}}
 async function confirmAdd(){if(!sug)return;setBusy(true);setError('');
  try{const memory=(sug.memory||[]).filter((_,i)=>lines[i]).map(m=>({section:m.section,text:m.text}));
   const r=await addRequest<{item?:{title:string};memory?:string[];skill?:{skill?:{name:string};imported?:string[]}}>('confirm',projectId,sug.kind==='knowledge'?{draftId:sug.draftId,saveKnowledge:keep,title,category,memory}:sug.draftId?{draftId:sug.draftId}:{kind:sug.kind,link:sug.source,paths});
   onAdded([r.item?$t("已存进知识库：{0}",{0:r.item.title}):'',r.memory?.length?$t("记忆补充了：{0}",{0:r.memory.join('、')}):'',r.skill?.skill?$t("已导入 Skill：{0}",{0:r.skill.skill.name}):r.skill?.imported?.length?$t("已导入 Skill：{0}",{0:r.skill.imported.join('、')}):''].filter(Boolean).join('；')||$t("没有保存任何内容"));}
  catch(e){setError(e instanceof Error?e.message:$t("没有保存，请重试。"));}finally{setBusy(false);}}
 const picked=(sug?.memory||[]).filter((_,i)=>lines[i]).length,nothing=sug?.kind==='knowledge'&&!keep&&!picked;
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-xl">
  <DialogHeader><DialogTitle>{$t("添加")}</DialogTitle><DialogDescription>{sug?$t("看一下 AI 的建议，勾选要保存的，再确认。"):$t("粘贴文字、上传文件或填一个网址。AI 会建议存进知识库还是补充到记忆；Skill 会放进 Skills。")}</DialogDescription></DialogHeader>
  {!sug?<div className="flex flex-col gap-3">
   <div className="nr-tabs" role="group" aria-label={$t("添加方式")}>{([['text',$t("粘贴文字")],['file',$t("上传文件")],['link',$t("填网址")]] as const).map(([k,v])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>{setMode(k);setError('');}}>{v}</button>)}</div>
   {mode==='text'?<label className="nr-field">{$t("内容")}<textarea rows={8} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={$t("粘贴文章、访谈纪要、竞品资料，或一个 SKILL.md……")}/></label>
   :mode==='file'?<label className="nr-field">{$t("文件")}<input type="file" accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.md,.markdown,.txt,.csv,.json" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/><span className="text-xs font-normal text-muted-foreground">{$t("PDF、Word、PowerPoint、Excel、Markdown、纯文本，5 MB 以内")}</span></label>
   :<label className="nr-field">{$t("网址")}<input value={url} disabled={busy} placeholder={$t("https://… 网页，或 GitHub 上的 Skill 链接")} onChange={e=>setUrl(e.target.value)}/></label>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  :sug.kind==='knowledge'?<div className="flex flex-col gap-3" data-suggestion="knowledge">
   {sug.aiError?<InlineError>{sug.aiError}</InlineError>:null}
   <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={keep} disabled={busy} onChange={e=>setKeep(e.target.checked)}/>{$t("存进知识库")}<span className="text-xs font-normal text-muted-foreground">{$tj("{0} 字",{0:sug.chars?.toLocaleString()})}</span></label>
   {keep?<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"><label className="nr-field">{$t("标题")}<input value={title} maxLength={120} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="nr-field">{$t("分类")}<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>:null}
   {sug.summary&&keep?<p className="text-xs text-muted-foreground">{sug.summary}</p>:null}
   <div className="flex flex-col gap-2"><p className="text-sm font-medium">{$tj("补充到记忆{0}",{0:sug.memory?.length?'':$t("：没有发现要长期记住的内容")})}</p>
    {(sug.memory||[]).map((m,i)=><label key={i} className="flex items-start gap-2 rounded-md border p-2.5 text-sm" data-memory-line={m.section}><input type="checkbox" className="mt-1" checked={Boolean(lines[i])} disabled={busy} onChange={e=>setLines({...lines,[i]:e.target.checked})}/><span className="min-w-0"><span className="text-xs text-muted-foreground">{m.label}</span><span className="block">{m.text}</span>{m.reason?<span className="block text-xs text-muted-foreground">{m.reason}</span>:null}</span></label>)}</div>
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  :<div className="flex flex-col gap-3" data-suggestion="skill">
   {sug.kind==='skill'?<p className="text-sm">{$t("这是一个 Skill：")}<b className="font-medium">{sug.skill?.name}</b>{$tj("{0}。确认后放进 Skills，按项目启用后 Agent 才会用。",{0:sug.skill?.description?` — ${sug.skill.description}`:''})}</p>
   :<><p className="text-sm">{$tj("这个仓库里有 {0} 个 Skill，勾选要导入的：",{0:sug.choices?.length})}</p>{(sug.choices||[]).map(c=><label key={c.path} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy||c.exists} checked={paths.includes(c.path)} onChange={e=>setPaths(e.target.checked?[...paths,c.path]:paths.filter(x=>x!==c.path))}/><span><b className="font-medium">{c.name}</b>{c.exists?$t("（已有）"):''}<span className="block text-xs text-muted-foreground">{c.description}</span></span></label>)}</>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>}
  <DialogFooter>{sug?<><Button variant="ghost" disabled={busy} onClick={()=>setSug(undefined)}>{$t("返回")}</Button><Button disabled={busy||nothing||(sug.kind==='skills'&&!paths.length)} onClick={()=>void confirmAdd()}>{busy?$t("正在保存…"):$t("确认")}</Button></>
   :<><Button variant="ghost" disabled={busy} onClick={onClose}>{$t("取消")}</Button><Button disabled={busy} onClick={()=>void look()}>{busy?$t("正在读取…"):$t("下一步")}</Button></>}</DialogFooter>
 </DialogContent></Dialog>;
}
const toBase64=(f:File)=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>no(new Error($t("读取文件失败")));r.readAsDataURL(f);});
// One item: its title and category (editable) and removing it, above its full text.
function ItemDrawer({projectId,item,onClose,onChanged,onRemove}:{projectId:number;item:Item|null;onClose:()=>void;onChanged:(msg:string)=>void;onRemove:(i:Item)=>Promise<void>}):ReactElement{
 const [text,setText]=useState<string>(),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setText(undefined);setError('');if(!item)return;setTitle(item.title);setCategory(item.category);void request<{text:string}>('get',projectId,{itemId:item.id}).then(r=>setText(r.text)).catch(()=>setError($t("读取全文失败。")));},[item?.id]);
 async function save(){if(!item)return;setBusy(true);setError('');
  try{await request('edit',projectId,{itemId:item.id,title,category});onChanged($t("已保存。"));onClose();}catch(e){setError(e instanceof Error?e.message:$t("没有保存，请重试。"));}finally{setBusy(false);}}
 const changed=item&&(title.trim()!==item.title||category!==item.category);
 return <Sheet open={Boolean(item)} onOpenChange={o=>{if(!o)onClose();}}><SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
  <SheetHeader className="sr-only"><SheetTitle>{item?.title||$t("资料")}</SheetTitle></SheetHeader>
  {item&&<div className="flex flex-col gap-3 p-4 pt-12" aria-label={$t("资料详情")} role="region">
   <label className="nr-field">{$t("标题")}<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
   <div className="flex flex-wrap items-end gap-3"><label className="nr-field">{$t("分类")}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <p className="pb-2 text-xs text-muted-foreground">{$tj("{0} · {1} 字 · {2} 添加",{0:item.kind==='file'?$t("文件 · {0}",{0:item.fileName}):item.kind==='link'?$t("网页 · {0}",{0:item.source||''}):$t("粘贴的文字"),1:item.chars.toLocaleString(),2:day(item.addedAt)})}</p></div>
   <div className="flex items-center gap-2"><Button size="sm" disabled={busy||!changed||!title.trim()} onClick={()=>void save()}>{$t("保存")}</Button><Button size="sm" variant="outline" className="ml-auto text-destructive" disabled={busy} onClick={()=>void onRemove(item)}><Trash2Icon/>{$t("删除")}</Button></div>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{text===undefined?$t("正在读取…"):text}</div>
  </div>}
 </SheetContent></Sheet>;
}
