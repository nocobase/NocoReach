import {useEffect,useMemo,useState,type ReactElement} from 'react';
import {FileTextIcon,NotebookPenIcon,PencilIcon,PlusIcon,SearchIcon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '@/components/ui/sheet';
import {cn} from '@/lib/utils';
import {useProject,useUnsavedWarning,type Project} from './reach-data';
// 项目知识 (SPEC §6.0): what the AI team knows about this project — 记忆, read every time and kept short, in the sections of
// a brand handbook; and 知识库, material the Agent looks up when it needs to.
export const MEMORY_SECTIONS:[MemoryKey,string,string][]=[['brand','品牌基础','品牌名、一句话介绍、定位、官网'],['product','产品','产品线、核心功能、价值主张、关键页面'],['audience','受众','目标人群，他们关心什么'],['markets','市场与语言','面向哪些地区和语言，各语言版本的规则'],['voice','语气与风格','品牌个性、语气、写作规矩'],['wording','用词','术语表：用哪个、不用哪个；产品名写法'],['messages','核心信息','主张、要反复强调的卖点和证据'],['competitors','竞品','主要竞品和我们的区别'],['rules','规矩与禁区','不能改的页面和内容、不能说的话']];
export type MemoryKey='brand'|'product'|'audience'|'markets'|'voice'|'wording'|'messages'|'competitors'|'rules';
export type Memory=Record<MemoryKey,string>;
const SUGGESTED=3000;
// Same reading as the server's memoryOf: saved sections, or a project's older fields read into them.
export function memoryOf(p?:Partial<Project>&{memory?:Partial<Memory>}):Memory{
 const s=(v?:string)=>(v||'').trim();
 if(p?.memory)return Object.fromEntries(MEMORY_SECTIONS.map(([k])=>[k,s(p.memory?.[k])])) as Memory;
 const join=(...xs:string[])=>xs.filter(Boolean).join('\n');
 return {brand:join(s(p?.description),s(p?.positioning)&&`定位：${s(p?.positioning)}`),product:s(p?.keyPages)&&`关键页面：\n${s(p?.keyPages)}`,audience:s(p?.audience),markets:join(s(p?.market),s(p?.contentLanguage)&&`内容语言：${s(p?.contentLanguage)}`),voice:s(p?.writingStyle),wording:s(p?.terminology),messages:'',competitors:s(p?.competitors),rules:s(p?.doNotChange)};
}
export const categories:[string,string][]=[['competitor','竞品'],['customer','客户'],['product','产品'],['industry','行业'],['other','其他']];
const categoryName=(c:string)=>categories.find(([k])=>k===c)?.[1]||'其他';
type Item={id:string;title:string;category:string;kind:'text'|'file';fileName?:string;chars:number;summary:string;addedAt:string};
const request=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrKnowledge',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
const day=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()}`;};
export default function ProjectKnowledgePage(){
 const {project,error:projectError}=useProject();
 const [items,setItems]=useState<Item[]>(),[adding,setAdding]=useState(false),[open,setOpen]=useState<Item|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=()=>{if(project)void request<{items:Item[]}>('list',project.id).then(r=>setItems(r.items)).catch(()=>setError('读取知识库失败，请刷新后重试。'));};
 useEffect(load,[project?.id]);
 return <PageContainer className="nr-page"><PageHeader title="项目知识" description="AI 团队对这个项目的了解：记忆每次都读，知识库需要时去查。" actions={<Button disabled={!project} onClick={()=>setAdding(true)}><PlusIcon/>添加</Button>}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {project&&<MemoryCard project={project} onSaved={()=>{setNotice('记忆已保存。之后的每日分析和任务都会读到。');window.dispatchEvent(new Event('reach-project-saved'));}}/>}
  {project&&<KnowledgeTable items={items} onOpen={setOpen}/>}
  {project&&<AddKnowledge open={adding} projectId={project.id} onClose={()=>setAdding(false)} onAdded={t=>{setAdding(false);setNotice(`已存进知识库：${t}`);load();}}/>}
  {project&&<ItemDrawer projectId={project.id} item={open} onClose={()=>setOpen(null)} onChanged={msg=>{setNotice(msg);load();}}/>}
 </PageContainer>;
}
// 记忆: the nine sections, edited in place; the length shown against what is suggested, since it is read every time.
function MemoryCard({project,onSaved}:{project:Project&{memory?:Partial<Memory>};onSaved:()=>void}):ReactElement{
 const memory=memoryOf(project),[draft,setDraft]=useState<{name:string;memory:Memory}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useUnsavedWarning(Boolean(draft&&JSON.stringify(draft.memory)!==JSON.stringify(memory)));
 const shown=draft?.memory||memory,total=Object.values(shown).reduce((n,t)=>n+t.length,0);
 async function save(){if(!draft)return;setBusy(true);setError('');try{await request('saveMemory',project.id,{name:draft.name,memory:draft.memory});setDraft(null);onSaved();}catch(e){setError(e instanceof Error?e.message:'没有保存，请重试。');}finally{setBusy(false);}}
 return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label="记忆">
  <div className="flex flex-wrap items-center gap-2"><NotebookPenIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">记忆</h2>
   <span className={cn('text-xs',total>SUGGESTED?'text-nr-ink-amber':'text-muted-foreground')}>约 {total.toLocaleString()} 字 · 建议 {SUGGESTED.toLocaleString()} 字以内</span>
   <span className="ml-auto flex gap-2">{draft?<><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>取消</Button><Button size="sm" disabled={busy||!draft.name.trim()} onClick={()=>void save()}>保存</Button></>
    :<Button size="sm" variant="outline" onClick={()=>setDraft({name:project.name,memory})}><PencilIcon/>编辑</Button>}</span></div>
  <p className="text-xs text-muted-foreground">每日分析和每个任务都会读这里，写结论就好；长材料放进下面的知识库。</p>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  {draft?<div className="flex flex-col gap-3"><label className="nr-field">项目名称<input value={draft.name} maxLength={200} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   {MEMORY_SECTIONS.map(([k,title,hint])=><label key={k} className="nr-field">{title}<textarea rows={k==='brand'||k==='product'?4:3} maxLength={4000} placeholder={hint} value={draft.memory[k]} onChange={e=>setDraft({...draft,memory:{...draft.memory,[k]:e.target.value}})}/></label>)}</div>
  :<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
   <dt className="text-xs text-muted-foreground sm:pt-0.5">项目名称</dt><dd className="m-0">{project.name}</dd>
   {MEMORY_SECTIONS.map(([k,title,hint])=><div key={k} className="contents"><dt className="text-xs text-muted-foreground sm:pt-0.5">{title}</dt><dd className={cn('m-0 whitespace-pre-wrap',!memory[k]&&'text-xs text-muted-foreground')}>{memory[k]||`未填写 · ${hint}`}</dd></div>)}
  </dl>}
 </section>;
}
// 知识库: one row per item, newest first; search and filter by category; a row opens the full text.
function KnowledgeTable({items,onOpen}:{items?:Item[];onOpen:(i:Item)=>void}):ReactElement{
 const [q,setQ]=useState(''),[category,setCategory]=useState('');
 const visible=useMemo(()=>(items||[]).filter(i=>(!category||i.category===category)&&(!q.trim()||`${i.title} ${i.summary}`.toLowerCase().includes(q.trim().toLowerCase()))),[items,q,category]);
 return <section className="flex flex-col gap-3" aria-label="知识库">
  <div className="flex flex-wrap items-center gap-2"><FileTextIcon className="size-4 text-muted-foreground" aria-hidden="true"/><h2 className="text-sm font-semibold">知识库</h2><span className="text-xs text-muted-foreground tabular-nums">{items?.length??''}</span><span className="text-xs text-muted-foreground">需要时去查</span></div>
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label="搜索知识库" value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索知识库" className="w-full pl-8!"/></label>
   <select aria-label="按分类筛选" value={category} onChange={e=>setCategory(e.target.value)} className="min-w-28"><option value="">全部分类</option>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {!items?<p role="status" className="text-sm text-muted-foreground">正在读取…</p>:visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label="知识库资料">
   <colgroup><col/><col className="w-24"/><col className="w-36"/><col className="w-20"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['标题 · 摘要','分类','类型','添加'].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
   <tbody>{visible.map(i=><tr key={i.id} data-item-id={i.id} className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={()=>onOpen(i)}>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(i);}}>{i.title}</button><p className="truncate text-xs text-muted-foreground">{i.summary}</p></td>
    <td className="px-3 py-2.5"><Tag tone="grey">{categoryName(i.category)}</Tag></td>
    <td className="truncate px-3 py-2.5 text-xs text-muted-foreground" title={i.fileName}>{i.kind==='file'?'文件':'文字'} · {i.chars.toLocaleString()} 字</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(i.addedAt)}</td></tr>)}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{items.length?'没有匹配的资料。':'还没有资料。点右上角“添加”，粘贴文字或上传文件。'}</p>}
  <p className="nr-footnote">我们自己的网站页面（数据接入 → 网站内容）和仓库不用放进来，Agent 本来就能读。执行任务时，知识库会交给 Agent，放在仓库之外，不会被提交。</p>
 </section>;
}
// Adding by hand for now: paste text or upload a file, with an optional title and a category.
function AddKnowledge({open,projectId,onClose,onAdded}:{open:boolean;projectId:number;onClose:()=>void;onAdded:(title:string)=>void}):ReactElement{
 const [mode,setMode]=useState<'text'|'file'>('text'),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setTitle('');setText('');setFile(null);setError('');setCategory('other');}},[open]);
 async function save(){setError('');if(mode==='text'&&!text.trim()){setError('请粘贴要存进知识库的内容');return;}if(mode==='file'&&!file){setError('请选择一个文件');return;}if(file&&file.size>5*1024*1024){setError('文件太大了，请控制在 5 MB 以内');return;}
  setBusy(true);try{const body=mode==='file'&&file?{title,category,file:{name:file.name,data:await toBase64(file)}}:{title,category,text};const r=await request<{item:Item}>('add',projectId,body);onAdded(r.item.title);}catch(e){setError(e instanceof Error?e.message:'没有存进去，请重试。');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle>添加到知识库</DialogTitle><DialogDescription>粘贴文字或上传文件（PDF、Word、PowerPoint、Excel、Markdown、纯文本，5 MB 以内）。</DialogDescription></DialogHeader>
  <div className="flex flex-col gap-3">
   <div className="nr-tabs" role="group" aria-label="添加方式">{([['text','粘贴文字'],['file','上传文件']] as const).map(([k,v])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>{setMode(k);setError('');}}>{v}</button>)}</div>
   {mode==='text'?<label className="nr-field">内容<textarea rows={8} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="粘贴文章、访谈纪要、竞品资料……"/></label>
   :<label className="nr-field">文件<input type="file" accept=".pdf,.docx,.doc,.pptx,.xlsx,.xls,.md,.markdown,.txt,.csv,.json" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}
   <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"><label className="nr-field">标题（可选）<input value={title} maxLength={120} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="不填就用文件名或第一行"/></label>
    <label className="nr-field">分类<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy} onClick={()=>void save()}>{busy?'正在读取…':'存进知识库'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
const toBase64=(f:File)=>new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>no(new Error('读取文件失败'));r.readAsDataURL(f);});
// One item: its full text, its title and category (editable), and removing it.
function ItemDrawer({projectId,item,onClose,onChanged}:{projectId:number;item:Item|null;onClose:()=>void;onChanged:(msg:string)=>void}):ReactElement{
 const [text,setText]=useState<string>(),[title,setTitle]=useState(''),[category,setCategory]=useState('other'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setText(undefined);setError('');if(!item)return;setTitle(item.title);setCategory(item.category);void request<{text:string}>('get',projectId,{itemId:item.id}).then(r=>setText(r.text)).catch(()=>setError('读取全文失败。'));},[item?.id]);
 async function act(action:'update'|'remove'){if(!item)return;if(action==='remove'&&!confirm(`从知识库删除“${item.title}”？`))return;setBusy(true);setError('');
  try{await request(action,projectId,action==='update'?{itemId:item.id,title,category}:{itemId:item.id});onChanged(action==='update'?'已保存。':`已删除：${item.title}`);onClose();}catch(e){setError(e instanceof Error?e.message:'没有完成，请重试。');}finally{setBusy(false);}}
 const changed=item&&(title.trim()!==item.title||category!==item.category);
 return <Sheet open={Boolean(item)} onOpenChange={o=>{if(!o)onClose();}}><SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
  <SheetHeader className="sr-only"><SheetTitle>{item?.title||'资料'}</SheetTitle></SheetHeader>
  {item&&<div className="flex flex-col gap-3 p-4 pt-12" aria-label="资料详情" role="region">
   <label className="nr-field">标题<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
   <div className="flex flex-wrap items-end gap-3"><label className="nr-field">分类<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <p className="pb-2 text-xs text-muted-foreground">{item.kind==='file'?`文件 · ${item.fileName}`:'粘贴的文字'} · {item.chars.toLocaleString()} 字 · {day(item.addedAt)} 添加</p></div>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{text===undefined?'正在读取…':text}</div>
   <div className="flex items-center gap-2 border-t pt-3"><Button size="sm" disabled={busy||!changed||!title.trim()} onClick={()=>void act('update')}>保存</Button><Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={busy} onClick={()=>void act('remove')}>删除</Button></div>
  </div>}
 </SheetContent></Sheet>;
}
