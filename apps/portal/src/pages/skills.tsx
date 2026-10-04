import {useEffect,useMemo,useState,type ReactElement} from 'react';
import {ExternalLinkIcon,FileIcon,PencilIcon,PlusIcon,SearchIcon,Trash2Icon,XIcon} from 'lucide-react';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '@/components/ui/sheet';
import {cn} from '@/lib/utils';
import {useProject,useUnsavedWarning} from './reach-data';
import {playbookRequest,type PlaybookList} from './playbook-model';
import {skillRequest,readSkillFiles,SKILL_NAME,type LinkRead,type Skill,type SkillList} from './skill-model';
// Skills (SPEC §6.0): how a kind of work is done, as SKILL.md (name, when to use it, how) and files that come with it. One
// library for every project; turned on here, a Skill goes with every task for the Agent to use when it fits. A 做法 step
// can name Skills, and that step always uses them.
type Usage=Record<string,string[]>;
const day=(iso:string)=>{const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()}`;};
export default function SkillsPage(){
 const {project,error:projectError}=useProject();
 const [list,setList]=useState<SkillList>(),[usage,setUsage]=useState<Usage>({}),[q,setQ]=useState(''),[filter,setFilter]=useState(''),[creating,setCreating]=useState(false),[open,setOpen]=useState<string|null>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=()=>{if(project)void skillRequest<SkillList>('list',project.id).then(setList).catch(()=>setError('读取 Skills 失败，请刷新后重试。'));};
 useEffect(load,[project?.id]);
 // Which 做法 steps name each Skill, from this project's playbooks.
 useEffect(()=>{if(!project)return;void playbookRequest<PlaybookList>('list',project.id).then(r=>{const u:Usage={};for(const p of r.playbooks)for(const s of p.steps)for(const id of s.skills||[])(u[id]||=[]).push(`${p.name} · ${s.name}`);setUsage(u);}).catch(()=>undefined);},[project?.id]);
 const visible=useMemo(()=>(list?.skills||[]).filter(s=>(!filter||(filter==='on')===s.enabled)&&(!q.trim()||`${s.name} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase()))),[list,q,filter]);
 async function toggle(s:Skill,enabled:boolean){if(!project)return;setError('');setList(l=>l&&{...l,skills:l.skills.map(x=>x.id===s.id?{...x,enabled}:x)});
  try{await skillRequest('setEnabled',project.id,{skillId:s.id,enabled});setNotice(enabled?`已在本项目启用 ${s.name}`:`已在本项目停用 ${s.name}`);}catch(e){setError(e instanceof Error?e.message:'没有改成，请重试。');load();}}
 const selected=list?.skills.find(s=>s.id===open)||null;
 // Rows ticked to delete together (only those still listed and shown count).
 const ticked=visible.filter(s=>picked.includes(s.id)),allTicked=visible.length>0&&ticked.length===visible.length;
 async function removeTicked(){if(!project||!ticked.length)return;const used=ticked.filter(s=>usage[s.id]?.length).map(s=>s.name);
  if(!confirm(`删除 ${ticked.length} 个 Skill？${used.length?`其中 ${used.join('、')} 被做法指定，这些步骤会不再用它们。`:''}`))return;setBusy(true);setError('');
  try{const r=await skillRequest<{removed:string[]}>('remove',project.id,{skillIds:ticked.map(s=>s.id)});setNotice(`已删除 ${r.removed.length} 个 Skill`);setPicked([]);load();}catch(e){setError(e instanceof Error?e.message:'没有删除，请重试。');}finally{setBusy(false);}}
 return <PageContainer className="nr-page"><PageHeader title="Skills" description="某类事情怎么做的说明。在本项目启用的，执行任务时交给 Agent。" actions={<Button disabled={!project} onClick={()=>setCreating(true)}><PlusIcon/>新建 Skill</Button>}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <section className="flex flex-col gap-3" aria-label="Skills 列表">
   <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label="搜索 Skill" value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索 Skill" className="w-full pl-8!"/></label>
    <select aria-label="按启用筛选" value={filter} onChange={e=>setFilter(e.target.value)} className="min-w-32"><option value="">全部</option><option value="on">本项目已启用</option><option value="off">未启用</option></select>
    {ticked.length>0&&<span className="ml-auto flex items-center gap-2 text-sm" role="group" aria-label="已选的 Skill"><span className="text-muted-foreground">已选 {ticked.length} 个</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setPicked([])}>取消选择</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={()=>void removeTicked()}><Trash2Icon/>删除所选</Button></span>}</div>
   {!list?<p role="status" className="text-sm text-muted-foreground">正在读取…</p>:visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label="Skills">
    <colgroup><col className="w-10"/><col/><col className="w-56"/><col className="w-20"/><col className="w-20"/></colgroup>
    <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="py-2 pr-0 pl-3"><input type="checkbox" aria-label="全选" checked={allTicked} onChange={e=>setPicked(e.target.checked?visible.map(s=>s.id):[])}/></th>{['名称 · 什么时候用','用在做法','附带文件','本项目'].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
    <tbody>{visible.map(s=><tr key={s.id} data-skill-id={s.id} className="cursor-pointer border-t transition-colors hover:bg-muted/40" onClick={()=>setOpen(s.id)}>
     <td className="py-2.5 pr-0 pl-3" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={`选择 ${s.name}`} checked={picked.includes(s.id)} onChange={e=>setPicked(e.target.checked?[...picked,s.id]:picked.filter(x=>x!==s.id))}/></td>
     <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-mono font-medium hover:underline" onClick={e=>{e.stopPropagation();setOpen(s.id);}}>{s.name}</button><p className="truncate text-xs text-muted-foreground">{s.description}</p></td>
     <td className="truncate px-3 py-2.5 text-xs text-muted-foreground" title={(usage[s.id]||[]).join('、')}>{(usage[s.id]||[]).join('、')||'—'}</td>
     <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{s.files.length}</td>
     <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}><Switch aria-label={`在本项目启用 ${s.name}`} checked={s.enabled} onCheckedChange={v=>void toggle(s,v)}/></td></tr>)}</tbody></table></div>
   :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{list.skills.length?'没有匹配的 Skill。':'还没有 Skill。点右上角“新建 Skill”，填写或上传一个 Skill 文件夹。'}</p>}
   <p className="nr-footnote">启用的 Skill 在本项目每个任务都交给 Agent，由它按需使用；做法步骤里指定的 Skill 不管是否启用，那一步都会用。执行时 Skill 放在仓库之外，不会被提交；附带的脚本不会运行。</p>
  </section>
  {project&&<NewSkill open={creating} projectId={project.id} onClose={()=>setCreating(false)} onCreated={s=>{setCreating(false);setNotice(`已新建 ${s.name}。在本项目启用后，任务会用到它。`);load();setOpen(s.id);}}
   onImported={r=>{setCreating(false);setNotice([r.imported.length?`已导入 ${r.imported.length} 个 Skill：${r.imported.join('、')}。在本项目启用后，任务会用到它们。`:'没有导入任何 Skill。',r.skipped.length?`跳过 ${r.skipped.length} 个：${r.skipped.map(x=>`${x.name}（${x.reason}）`).join('、')}。`:''].join(''));load();}}/>}
  {project&&<SkillDrawer projectId={project.id} skill={selected} usage={selected?usage[selected.id]||[]:[]} onClose={()=>setOpen(null)} onToggle={v=>selected&&void toggle(selected,v)} onChanged={(msg,closed)=>{load();if(closed){setNotice(msg);setOpen(null);}}}/>}
 </PageContainer>;
}
// 新建: fill in name, when to use it and how; pick a Skill folder (with SKILL.md) or a single SKILL.md file; or paste a link
// (GitHub, or an https SKILL.md) — read first to see what is there, a repository with several Skills lists them to pick one.
type Imported={imported:string[];skipped:{name:string;reason:string}[]};
function NewSkill({open,projectId,onClose,onCreated,onImported}:{open:boolean;projectId:number;onClose:()=>void;onCreated:(s:Skill)=>void;onImported:(r:Imported)=>void}):ReactElement{
 const [mode,setMode]=useState<'form'|'folder'|'link'>('form'),[url,setUrl]=useState(''),[link,setLink]=useState<LinkRead|null>(null),[ticked,setTicked]=useState<string[]>([]),[find,setFind]=useState(''),[reading,setReading]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[body,setBody]=useState(''),[picked,setPicked]=useState<{files:{path:string;text:string}[];skipped:string[]}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setName('');setDescription('');setBody('');setPicked(null);setUrl('');setLink(null);setError('');}},[open]);
 async function readLink(){setError('');if(!url.trim()){setError('请贴一个链接');return;}setReading(true);setLink(null);setTicked([]);setFind('');
  try{setLink(await skillRequest<LinkRead>('readLink',projectId,{url:url.trim()}));}catch(e){setError(e instanceof Error?e.message:'没有读到，请重试。');}finally{setReading(false);}}
 // A repository with several Skills: tick any number (those already here cannot be), filter by name or use, tick all shown.
 const choices=link?.choices||[],shown=choices.filter(c=>!find.trim()||`${c.name} ${c.description}`.toLowerCase().includes(find.trim().toLowerCase())),selectable=shown.filter(c=>!c.exists).map(c=>c.path),allTicked=selectable.length>0&&selectable.every(p=>ticked.includes(p));
 async function pick(list:FileList|null,folder:boolean){setError('');setPicked(null);if(!list?.length)return;const r=await readSkillFiles(list,folder);
  // A single Markdown file is the SKILL.md, whatever it is called.
  if(!folder&&r.files.length===1&&/\.(md|markdown)$/i.test(r.files[0].path))r.files[0].path='SKILL.md';
  if(!r.files.some(f=>f.path.toLowerCase()==='skill.md'||/^[^/]+\/skill\.md$/i.test(f.path))){setError('没有找到 SKILL.md。请选一个 Skill 的文件夹，或者一个 SKILL.md 文件。');return;}
  setPicked(r);}
 async function save(){setError('');
  if(mode==='form'){const n=name.trim().toLowerCase();if(!SKILL_NAME.test(n)||n.length>64){setError('名称只能用英文小写字母、数字和连字符，例如 seo-title');return;}if(!description.trim()){setError('请写什么时候用这个 Skill');return;}if(!body.trim()){setError('请写怎么做');return;}}
  else if(mode==='folder'&&!picked){setError('请先选择 Skill 文件夹或 SKILL.md 文件');return;}
  else if(mode==='link'&&link?.choices){if(!ticked.length){setError('请至少勾选一个 Skill');return;}
   setBusy(true);try{onImported(await skillRequest<Imported>('importLink',projectId,{url:url.trim(),paths:ticked}));}catch(e){setError(e instanceof Error?e.message:'没有导入，请重试。');}finally{setBusy(false);}return;}
  else if(mode==='link'&&!link?.files){setError('请先贴链接并点“读取”');return;}
  setBusy(true);try{const r=mode==='form'?await skillRequest<{skill:Skill}>('create',projectId,{name:name.trim().toLowerCase(),description,body}):await skillRequest<{skill:Skill}>('import',projectId,mode==='link'?{files:link!.files,source:link!.source}:{files:picked!.files});onCreated(r.skill);}
  catch(e){setError(e instanceof Error?e.message:'没有存进去，请重试。');}finally{setBusy(false);}}
 const others=picked?picked.files.filter(f=>!/(^|\/)skill\.md$/i.test(f.path)).length:0;
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-2xl">
  <DialogHeader><DialogTitle>新建 Skill</DialogTitle><DialogDescription>Skill 写清某类事情怎么做，格式是通用的 SKILL.md，Claude Code 等工具都能用。</DialogDescription></DialogHeader>
  <div className="flex flex-col gap-3">
   <div className="nr-tabs" role="group" aria-label="新建方式">{([['form','填写'],['folder','上传文件夹'],['link','填链接']] as const).map(([k,v])=><button key={k} type="button" aria-pressed={mode===k} onClick={()=>{setMode(k);setError('');}}>{v}</button>)}</div>
   {mode==='form'?<>
    <label className="nr-field">名称<input value={name} maxLength={64} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="seo-title" className="font-mono"/><span className="text-xs text-muted-foreground">英文小写字母、数字和连字符（SKILL.md 的规定）</span></label>
    <label className="nr-field">什么时候用<textarea rows={2} maxLength={1024} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)} placeholder="写或改页面标题、描述时用：长度、关键词位置、品牌后缀"/><span className="text-xs text-muted-foreground">Agent 靠这一句判断什么时候用它</span></label>
    <label className="nr-field">怎么做<textarea rows={10} disabled={busy} value={body} onChange={e=>setBody(e.target.value)} className="font-mono text-xs" placeholder={'## 标题\n- 30–60 个字符，主关键词放前面\n- 结尾加“ | 品牌名”'}/></label>
   </>:mode==='link'?<>
    <div className="flex flex-col gap-1"><label className="nr-field">Skill 的链接<span className="flex gap-2"><input value={url} disabled={busy||reading} onChange={e=>{setUrl(e.target.value);setLink(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void readLink();}}} placeholder="https://github.com/owner/repo/tree/main/skills/brand-voice" className="min-w-0 flex-1"/>
     <Button type="button" variant="outline" disabled={busy||reading} onClick={()=>void readLink()}>{reading?'正在读取…':'读取'}</Button></span></label>
     <span className="text-xs text-muted-foreground">GitHub 上 Skill 文件夹、SKILL.md 或仓库的链接（只支持公开仓库），也可以是直接指向 SKILL.md 的网址</span></div>
    {link?.choices&&<fieldset className="flex flex-col gap-1.5" disabled={busy}><legend className="mb-1 flex w-full flex-wrap items-center gap-2 text-sm"><span className="flex-1">这个链接里有 {choices.length} 个 Skill，勾选要导入的{choices.some(c=>c.exists)?'（已有的不能重复导入）':''}</span>
     {selectable.length>0&&<button type="button" className="text-xs text-primary hover:underline" onClick={()=>{setError('');setTicked(allTicked?ticked.filter(p=>!selectable.includes(p)):[...new Set([...ticked,...selectable])]);}}>{allTicked?'全不选':find.trim()?'全选筛出的':'全选'}</button>}</legend>
     {choices.length>8&&<div className="nr-field"><input aria-label="筛选链接里的 Skill" value={find} onChange={e=>setFind(e.target.value)} placeholder="按名称或用途筛选"/></div>}
     <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border" aria-label="链接里的 Skill">{shown.map(c=><li key={c.path}><label className={cn('flex gap-2.5 px-3 py-2',c.exists?'opacity-60':'cursor-pointer hover:bg-muted/40')}>
      <input type="checkbox" className="mt-1" disabled={c.exists} checked={!c.exists&&ticked.includes(c.path)} onChange={e=>{setError('');setTicked(e.target.checked?[...ticked,c.path]:ticked.filter(p=>p!==c.path));}}/>
      <span className="flex min-w-0 flex-col gap-0.5"><span className="flex items-center gap-2 font-mono text-sm font-medium">{c.name}{c.exists&&<Tag tone="grey">已有</Tag>}</span><span className="line-clamp-2 text-xs text-muted-foreground">{c.description}</span></span></label></li>)}
      {!shown.length&&<li className="px-3 py-4 text-center text-xs text-muted-foreground">没有匹配的 Skill</li>}</ul></fieldset>}
    {busy&&link?.choices&&<p role="status" className="text-sm text-muted-foreground">正在读取并导入 {ticked.length} 个 Skill，数量多时要等一会儿…</p>}
    {link?.files&&<div role="status" className="flex flex-col gap-0.5 rounded-lg border p-3 text-sm"><p><span className="font-mono font-medium">{link.name}</span><span className="text-muted-foreground"> · {link.files.length-1?`${link.files.length-1} 个附带文件`:'没有附带文件'}{link.skipped?.length?`，跳过 ${link.skipped.length} 个不是文字或太大的文件（${link.skipped.slice(0,3).join('、')}${link.skipped.length>3?'…':''}）`:''}</span></p><p className="line-clamp-3 text-xs text-muted-foreground">{link.description}</p></div>}
    <p className="nr-footnote">来源会记在 Skill 上；附带的脚本只保存，不会运行。普通文章网页以后可以交给 AI 整理成 Skill。</p>
   </>:<>
    <label className="nr-field">Skill 文件夹（里面有 SKILL.md）<input type="file" multiple disabled={busy} {...{webkitdirectory:''}} onChange={e=>void pick(e.target.files,true)}/></label>
    <label className="nr-field">或者只选一个 SKILL.md 文件<input type="file" accept=".md,.markdown" disabled={busy} onChange={e=>void pick(e.target.files,false)}/></label>
    {picked&&<p role="status" className="text-sm">读到 SKILL.md{others?`和 ${others} 个附带文件`:''}{picked.skipped.length?`；跳过 ${picked.skipped.length} 个不是文字或太大的文件（${picked.skipped.slice(0,3).join('、')}${picked.skipped.length>3?'…':''}）`:''}。</p>}
    <p className="nr-footnote">名称和“什么时候用”从 SKILL.md 开头读取；附带的脚本只保存，不会运行。</p>
   </>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy||reading} onClick={()=>void save()}>{busy?(mode==='link'&&link?.choices?'正在导入…':'正在保存…'):mode==='form'?'保存':mode==='link'&&link?.choices?`导入 ${ticked.length} 个`:'导入'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
// One Skill: turn it on here, read and edit SKILL.md in place, look at, add and remove its files, delete it. What an action
// did is said in the drawer (the page behind it is covered); deleting closes it and the page says so.
function SkillDrawer({projectId,skill,usage,onClose,onToggle,onChanged}:{projectId:number;skill:Skill|null;usage:string[];onClose:()=>void;onToggle:(v:boolean)=>void;onChanged:(msg:string,closed?:boolean)=>void}):ReactElement{
 const [content,setContent]=useState<{body:string;files:{path:string;text:string}[]}>(),[draft,setDraft]=useState<{name:string;description:string;body:string}|null>(null),[shown,setShown]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
 const read=()=>{if(skill)void skillRequest<{body:string;files:{path:string;text:string}[]}>('get',projectId,{skillId:skill.id}).then(r=>setContent({body:r.body,files:r.files})).catch(()=>setError('读取 Skill 失败。'));};
 useEffect(()=>{setContent(undefined);setDraft(null);setShown('');setError('');read();},[skill?.id,skill?.updatedAt]);
 useEffect(()=>setDone(''),[skill?.id]);
 useUnsavedWarning(Boolean(draft&&content&&skill&&(draft.name!==skill.name||draft.description!==skill.description||draft.body!==content.body)));
 async function act(action:'edit'|'remove'|'removeFile'|'addFiles',body:object,message:string,closed=false){if(!skill)return;setBusy(true);setError('');setDone('');
  try{await skillRequest(action,projectId,{skillId:skill.id,...body});setDraft(null);if(!closed)setDone(message);onChanged(message,closed);}catch(e){setError(e instanceof Error?e.message:'没有完成，请重试。');}finally{setBusy(false);}}
 async function addFiles(list:FileList|null){if(!list?.length)return;const r=await readSkillFiles(list,false);if(!r.files.length){setError('这些文件不是文字文件，或者太大了');return;}
  await act('addFiles',{files:r.files},`已添加 ${r.files.length} 个文件${r.skipped.length?`，跳过 ${r.skipped.length} 个`:''}`);}
 function remove(){if(!skill)return;if(!confirm(usage.length?`删除 ${skill.name}？做法里这些步骤会不再用它：${usage.join('、')}`:`删除 ${skill.name}？`))return;void act('remove',{},`已删除 ${skill.name}`,true);}
 return <Sheet open={Boolean(skill)} onOpenChange={o=>{if(!o&&!(draft&&!confirm('放弃未保存的修改？')))onClose();}}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
  <SheetHeader className="sr-only"><SheetTitle>{skill?.name||'Skill'}</SheetTitle></SheetHeader>
  {skill&&<div className="flex flex-col gap-4 p-4 pt-12" aria-label="Skill 详情" role="region">
   <div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-base font-semibold">{skill.name}</h2>{skill.enabled?<Tag tone="green">本项目已启用</Tag>:<Tag tone="grey">本项目未启用</Tag>}
    <span className="ml-auto flex items-center gap-2">{!draft&&<Button size="sm" variant="outline" disabled={busy||!content} onClick={()=>content&&setDraft({name:skill.name,description:skill.description,body:content.body})}><PencilIcon/>编辑</Button>}
</span></div>
   <label className="flex items-center gap-2 text-sm"><Switch aria-label="在本项目启用" checked={skill.enabled} onCheckedChange={onToggle}/>在本项目启用<span className="text-xs text-muted-foreground">（每个任务都交给 Agent，按需使用）</span></label>
   {error&&<p role="alert" className="nr-error">{error}</p>}{done&&<p role="status" className="nr-success">{done}</p>}
   {draft?<div className="flex flex-col gap-3">
    <label className="nr-field">名称<input value={draft.name} maxLength={64} className="font-mono" onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label className="nr-field">什么时候用<textarea rows={2} maxLength={1024} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
    <label className="nr-field">怎么做<textarea rows={16} value={draft.body} className="font-mono text-xs" onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
    <div className="flex gap-2"><Button size="sm" disabled={busy||!draft.name.trim()||!draft.description.trim()||!draft.body.trim()} onClick={()=>void act('edit',{name:draft.name.trim().toLowerCase(),description:draft.description,body:draft.body},'已保存。之后的任务会用新的说明。')}>保存</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>取消</Button></div>
   </div>:<>
    <div><h3 className="text-xs font-medium text-muted-foreground">什么时候用</h3><p className="mt-1 whitespace-pre-wrap text-sm">{skill.description}</p></div>
    <div><h3 className="text-xs font-medium text-muted-foreground">怎么做（SKILL.md 正文）</h3><div className="mt-1 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">{content?content.body:'正在读取…'}</div></div>
   </>}
   <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">附带文件</h3>
    {content?.files.length?<ul className="flex flex-col divide-y rounded-lg border" aria-label="附带文件">{content.files.map(f=><li key={f.path} className="px-3 py-2">
     <div className="flex items-center gap-2 text-sm"><FileIcon className="size-3.5 text-muted-foreground" aria-hidden="true"/><button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline" aria-expanded={shown===f.path} onClick={()=>setShown(shown===f.path?'':f.path)}>{f.path}</button><span className="text-xs text-muted-foreground tabular-nums">{f.text.length.toLocaleString()} 字</span>
      <Button size="icon-sm" variant="ghost" aria-label={`删除 ${f.path}`} disabled={busy} onClick={()=>{if(confirm(`删除附带文件 ${f.path}？`))void act('removeFile',{path:f.path},`已删除 ${f.path}`);}}><XIcon/></Button></div>
     {shown===f.path&&<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{f.text}</pre>}</li>)}</ul>
    :<p className="text-xs text-muted-foreground">{content?'没有附带文件。模板、示例和较长的参考内容可以放在这里。':''}</p>}
    <label className={cn('flex w-fit cursor-pointer items-center gap-1 text-xs text-primary hover:underline',busy&&'pointer-events-none opacity-50')}><PlusIcon className="size-3.5"/>添加文件<input type="file" multiple className="sr-only" aria-label="添加附带文件" disabled={busy} onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/></label>
   </div>
   <div className="flex items-start gap-2 border-t pt-3"><div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground"><p>{usage.length?`用在做法：${usage.join('、')}`:'还没有做法指定它'} · {day(skill.updatedAt)} 更新{skill.builtIn?' · 自带的示例':''}</p>
    {skill.source&&<a href={skill.source} target="_blank" rel="noopener noreferrer" className="flex w-fit max-w-full items-center gap-1 hover:underline"><ExternalLinkIcon className="size-3 shrink-0"/><span className="truncate">来源：{skill.source}</span></a>}</div>
    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={remove}><Trash2Icon/>删除</Button></div>
  </div>}
 </SheetContent></Sheet>;
}
