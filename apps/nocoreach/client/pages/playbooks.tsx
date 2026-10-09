import { $t, $tj } from "@/i18n";
import {useEffect,useState,type ReactElement} from 'react';
import {useSearchParams} from 'react-router';
import {ArrowDownIcon,ArrowUpIcon,FileSearchIcon,GitPullRequestIcon,MoreHorizontal,PencilIcon,PlusIcon,SettingsIcon,SparklesIcon,UserCheckIcon,XIcon} from 'lucide-react';
import {AdminOnlyNote,useMe} from './me';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/reach-ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/reach-ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/reach-ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {useProject} from './reach-data';
import {skillRequest,type Skill,type SkillList} from './skill-model';
import {playbookRequest,categories,categoryName,stepKinds,type Category,type Playbook,type PlaybookList,type Step,type StepKind} from './playbook-model';
import {confirmAction} from '@/components/reach/confirm';
type Draft=Pick<Playbook,'name'|'category'|'description'|'steps'|'next'>&{id?:string};
type Saved=PlaybookList&{playbook?:Playbook|null};
const NEW='new';
const source=(p:Playbook)=>p.system?(p.edited?$t("内置 · 已修改"):$t("内置")):$t("自己建的");
const icons:Record<StepKind,ReactElement>={analyze:<FileSearchIcon className="size-3.5"/>,change:<GitPullRequestIcon className="size-3.5"/>,review:<UserCheckIcon className="size-3.5"/>};
// 做法 (SPEC §6.0): every kind of work as a few steps the Agent does and you review, grouped by the work it is. Built-in
// playbooks are edited in place and can be restored; new ones start from one sentence the online AI turns into a draft.
export default function PlaybooksPage(){
 const {project,error:projectError}=useProject(),{isAdmin}=useMe();const [params,setParams]=useSearchParams();
 const [list,setList]=useState<PlaybookList>(),[skills,setSkills]=useState<Skill[]>([]),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[creating,setCreating]=useState(false);
 useEffect(()=>{if(!project)return;void playbookRequest<PlaybookList>('list',project.id).then(setList).catch(()=>setError($t("读取做法失败，请刷新后重试。")));void skillRequest<SkillList>('list',project.id).then(r=>setSkills(r.skills)).catch(()=>undefined);},[project?.id]);
 const id=params.get('id'),selected=list?.playbooks.find(p=>p.id===id)||(id===NEW?undefined:list?.playbooks[0]);
 const editing=Boolean(draft);
 async function pick(next:string){if(editing&&!(await confirmAction({title:$t("放弃未保存的修改？"),action:'放弃'})))return;setDraft(null);setError('');setNotice('');const p=new URLSearchParams(params);p.set('id',next);setParams(p,{replace:true});}
 async function call(action:'save'|'copy'|'remove'|'restore',body:object,done:string){if(!project||!list)return;setBusy(true);setError('');setNotice('');
  try{const r=await playbookRequest<Saved>(action,project.id,{revision:list.revision,...body});setList(r);setDraft(null);setNotice(done);const p=new URLSearchParams(params);p.set('id',r.playbook?.id||r.playbooks[0]?.id||'');setParams(p,{replace:true});}
  catch(e){setError(e instanceof Error?e.message:$t("没有保存，请重试。"));}finally{setBusy(false);}}
 function save(){if(!draft)return;const {id:playbookId,...rest}=draft;void call('save',{...(playbookId?{playbookId}:{}),...rest},playbookId?$t("已保存。已经开始的任务不受影响。"):$t("已新建做法。"));}
 function startNew(d:Draft){setCreating(false);setDraft(d);setError('');setNotice('');const p=new URLSearchParams(params);p.set('id',NEW);setParams(p,{replace:true});}
 return <PageContainer className="nr-page"><PageHeader title={$t("做法",undefined,"title")} description={$t("每种工作怎么做：Agent 分几步做、你在哪一步把关。修改不影响已经开始的任务。")}
  actions={isAdmin&&<Button disabled={!list||busy} onClick={async()=>{if(editing&&!(await confirmAction({title:$t("放弃未保存的修改？"),action:'放弃'})))return;setCreating(true);}}><SparklesIcon/>{$t("新建做法")}</Button>}/><AdminOnlyNote/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  {!list?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取做法…")}</p>:<div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
   <nav className="flex flex-col gap-1" aria-label={$t("做法列表")}>{categories.map(([c,label])=>{const items=list.playbooks.filter(p=>p.category===c);return items.length?<div key={c} className="flex flex-col gap-1.5">
    <h2 className="mt-2 px-1 text-xs font-medium text-muted-foreground">{label}</h2>
    {items.map(p=><button key={p.id} type="button" aria-current={!draft?.id&&id===NEW?false:selected?.id===p.id} onClick={()=>pick(p.id)} className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 text-left text-card-foreground transition-colors hover:border-ring aria-[current=true]:border-primary aria-[current=true]:ring-1 aria-[current=true]:ring-primary">
     <span className="text-sm font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{source(p)}</span></button>)}
   </div>:null;})}</nav>
   {draft?<Editor draft={draft} list={list} skills={skills} busy={busy} onChange={setDraft} onSave={save} onCancel={()=>{setDraft(null);setError('');if(id===NEW)pick(list.playbooks[0]?.id||'');}}/>
   :selected?<Detail p={selected} list={list} skills={skills} busy={busy} readOnly={!isAdmin} onEdit={()=>setDraft({id:selected.id,name:selected.name,category:selected.category,description:selected.description,steps:structuredClone(selected.steps),next:[...selected.next]})}
     onCopy={()=>void call('copy',{playbookId:selected.id},$t("已复制一份，可以接着修改。"))} onRestore={async()=>{if(await confirmAction({title:$t("把“{0}”恢复为默认？",{0:selected.name}),description:$t("你的修改会丢弃，已经开始的任务不受影响。"),action:'恢复默认'}))void call('restore',{playbookId:selected.id},$t("已恢复默认。"));}}
     onRemove={async()=>{if(await confirmAction({title:$t("删除做法“{0}”？",{0:selected.name}),description:$t("已经开始的任务不受影响。"),action:'删除'}))void call('remove',{playbookId:selected.id},$t("已删除。"));}}/>:null}
  </div>}
  {project&&list&&<NewPlaybook open={creating} projectId={project.id} onClose={()=>setCreating(false)} onDraft={startNew}/>}
 </PageContainer>;
}
// The steps in order, then 上线 and 观察 when a step changes the repository.
function Steps({steps,skills}:{steps:Step[];skills:Skill[]}){
 const system=steps.some(s=>s.kind==='change')?[[$t("上线"),$t("合并 PR，确认改动出现在线上")],[$t("观察效果"),$t("第 7、28 天对比上线前的数据")]]:[];
 return <ol className="flex flex-col divide-y" aria-label={$t("步骤")}>{steps.map((s,i)=><li key={s.key||i} className="flex gap-3 py-2.5">
   <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-md',s.kind==='review'?'bg-nr-tint-violet text-nr-ink-violet':'bg-nr-tint-blue text-nr-ink-blue')}>{icons[s.kind]}</span>
   <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 text-sm font-medium">{i+1}. {s.kind==='review'?$t("你{0}",{0:s.name}):`Agent ${s.name}`}{s.kind!=='review'&&<Tag tone={s.kind==='change'?'blue':'grey'}>{stepKinds[s.kind].hint}</Tag>}</p>
    {s.kind==='review'?s.checklist?.length?<p className="mt-0.5 text-xs text-muted-foreground">{$tj("确认：{0}",{0:s.checklist.map(c=>c.label).join(' · ')})}</p>:null:<><p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{s.instruction}</p><StepSkills ids={s.skills} skills={skills}/></>}</div></li>)}
  {system.map(([n,d],i)=><li key={n} className="flex gap-3 py-2.5"><span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><SettingsIcon className="size-3.5"/></span>
   <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-medium">{steps.length+i+1}. {n}<Tag tone="grey">{$t("系统")}</Tag></p><p className="mt-0.5 text-xs text-muted-foreground">{d}</p></div></li>)}
 </ol>;
}
function Detail({p,list,skills,busy,readOnly=false,onEdit,onCopy,onRestore,onRemove}:{p:Playbook;list:PlaybookList;skills:Skill[];busy:boolean;readOnly?:boolean;onEdit:()=>void;onCopy:()=>void;onRestore:()=>void;onRemove:()=>void}){
 const next=p.next.map(id=>list.playbooks.find(x=>x.id===id)?.name).filter(Boolean);
 return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t("做法详情")}>
  <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold leading-snug">{p.name}</h2><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Tag tone="grey">{categoryName(p.category)}</Tag>{$tj("由 Agent 执行 · {0}",{0:source(p)})}</p></div>
   {!readOnly&&<><Button size="sm" variant="outline" disabled={busy} onClick={onEdit}><PencilIcon/>{$t("编辑")}</Button>
   <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={$t("更多操作")} disabled={busy}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max">
    <DropdownMenuItem onClick={onCopy}>{$t("复制一份")}</DropdownMenuItem>{p.edited&&<DropdownMenuItem onClick={onRestore}>{$t("恢复默认")}</DropdownMenuItem>}{!p.system&&<DropdownMenuItem variant="destructive" onClick={onRemove}>{$t("删除")}</DropdownMenuItem>}
   </DropdownMenuContent></DropdownMenu></>}</div>
  {p.description&&<p className="text-sm text-muted-foreground">{p.description}</p>}
  <div><h3 className="text-xs font-medium text-muted-foreground">{$t("步骤")}</h3><Steps steps={p.steps} skills={skills}/></div>
  {next.length>0&&<p className="text-xs text-muted-foreground">{$tj("完成后可以接着做：{0}",{0:next.join('、')})}</p>}
 </section>;
}
// In-place editing: name, category, one line of description, and the steps — move, remove, add; a review's items one per line.
function Editor({draft,list,skills,busy,onChange,onSave,onCancel}:{draft:Draft;list:PlaybookList;skills:Skill[];busy:boolean;onChange:(d:Draft)=>void;onSave:()=>void;onCancel:()=>void}){
 const set=(patch:Partial<Draft>)=>onChange({...draft,...patch});
 const step=(i:number,patch:Partial<Step>)=>set({steps:draft.steps.map((s,j)=>j===i?{...s,...patch}:s)});
 const move=(i:number,d:number)=>{const s=[...draft.steps],[x]=s.splice(i,1);s.splice(i+d,0,x);set({steps:s});};
 const changes=draft.steps.some(s=>s.kind==='change'),buildable=list.playbooks.filter(p=>p.kind==='build'&&p.id!==draft.id);
 return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t("编辑做法")}>
  <div className="flex items-center gap-2"><h2 className="flex-1 text-sm font-semibold">{draft.id?$t("编辑做法"):$t("新做法（还没保存）")}</h2><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{$t("取消")}</Button><Button size="sm" disabled={busy||!draft.name.trim()||!draft.steps.length} onClick={onSave}>{$t("保存")}</Button></div>
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="nr-field">{$t("名称")}<input value={draft.name} maxLength={40} onChange={e=>set({name:e.target.value})}/></label>
   <label className="nr-field">{$t("分类")}<select value={draft.category} onChange={e=>set({category:e.target.value as Category})}>{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  <label className="nr-field">{$t("一句话说明")}<input value={draft.description} maxLength={200} onChange={e=>set({description:e.target.value})}/></label>
  <div className="flex flex-col gap-2"><h3 className="text-xs font-medium text-muted-foreground">{$t("步骤")}</h3>
   <ol className="flex flex-col gap-2" aria-label={$t("编辑步骤")}>{draft.steps.map((s,i)=><li key={i} className="flex gap-2 rounded-lg border p-3">
    <span className={cn('mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md',s.kind==='review'?'bg-nr-tint-violet text-nr-ink-violet':'bg-nr-tint-blue text-nr-ink-blue')}>{icons[s.kind]}</span>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
     <div className="flex items-center gap-2 text-sm font-medium">{i+1}. {stepKinds[s.kind].label}<input aria-label={$t("第 {0} 步的名称",{0:i+1})} value={s.name} maxLength={20} onChange={e=>step(i,{name:e.target.value})} className="w-36"/></div>
     {s.kind==='review'?<label className="nr-field text-xs">{$t("审核时确认（一行一项，可不填）")}<textarea rows={2} value={(s.checklist||[]).map(c=>c.label).join('\n')} onChange={e=>step(i,{checklist:e.target.value.split('\n').map(l=>({key:'',label:l,required:true}))})}/></label>
     :<><label className="nr-field text-xs">{$t("给 Agent 的说明")}<textarea rows={3} value={s.instruction||''} onChange={e=>step(i,{instruction:e.target.value})}/></label><PickSkills index={i} ids={s.skills||[]} skills={skills} onChange={ids=>step(i,{skills:ids})}/></>}
    </div>
    <div className="flex flex-col gap-1"><Button size="icon-sm" variant="ghost" aria-label={$t("上移")} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUpIcon/></Button><Button size="icon-sm" variant="ghost" aria-label={$t("下移")} disabled={i===draft.steps.length-1} onClick={()=>move(i,1)}><ArrowDownIcon/></Button><Button size="icon-sm" variant="ghost" aria-label={$t("删除这一步")} onClick={()=>set({steps:draft.steps.filter((_,j)=>j!==i)})}><XIcon/></Button></div>
   </li>)}</ol>
   <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-xs text-muted-foreground">{$t("添加步骤：")}</span>{(['analyze','change','review'] as StepKind[]).map(k=><Button key={k} size="sm" variant="outline" disabled={draft.steps.length>=10} onClick={()=>set({steps:[...draft.steps,{key:'',name:stepKinds[k].name,kind:k,...(k==='review'?{checklist:[]}:{instruction:''})}]})}><PlusIcon/>{stepKinds[k].label}</Button>)}</div>
   <p className="nr-footnote">{changes?$t("有“Agent 修改”时，系统会在最后接上“上线 → 观察效果”；最后一步不是审核时会自动加上“看效果并发布”。"):$t("最后一步不是审核时，会自动加上“审核”。")}</p>
  </div>
  {!changes&&buildable.length>0&&<fieldset className="flex flex-col gap-1.5 text-sm"><legend className="mb-1 text-xs font-medium text-muted-foreground">{$t("完成后可以接着做（审核通过时选一个，建成新任务）")}</legend><div className="flex flex-wrap gap-x-4 gap-y-1">{buildable.map(p=><label key={p.id} className="flex items-center gap-1.5"><input type="checkbox" checked={draft.next.includes(p.id)} disabled={!draft.next.includes(p.id)&&draft.next.length>=3} onChange={e=>set({next:e.target.checked?[...draft.next,p.id]:draft.next.filter(x=>x!==p.id)})}/>{p.name}</label>)}</div></fieldset>}
 </section>;
}
// 新建做法: one sentence → the online AI drafts it (one call) → it opens in the editor to check and save. Or start blank.
function NewPlaybook({open,projectId,onClose,onDraft}:{open:boolean;projectId:number;onClose:()=>void;onDraft:(d:Draft)=>void}){
 const [request,setRequest]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setError('');}},[open]);
 async function ask(){if(!request.trim()){setError($t("先用一句话说说这个做法要做什么"));return;}setBusy(true);setError('');
  try{const r=await playbookRequest<{draft:Draft}>('draft',projectId,{request:request.trim()});onDraft({...r.draft,next:r.draft.next||[]});setRequest('');}catch(e){setError(e instanceof Error?e.message:$t("没有起草成功，请重试。"));}finally{setBusy(false);}}
 const blank:Draft={name:'',category:'research',description:'',steps:[{key:'',name:$t("分析"),kind:'analyze',instruction:''},{key:'',name:$t("审核"),kind:'review',checklist:[]}],next:[]};
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle>{$t("新建做法")}</DialogTitle><DialogDescription>{$t("用一句话说说这个做法要做什么，AI 会起草分类、名称和每一步的说明，你改好再保存。")}</DialogDescription></DialogHeader>
  <label className="nr-field">{$t("这个做法要做什么？")}<textarea rows={3} value={request} maxLength={500} disabled={busy} onChange={e=>setRequest(e.target.value)} placeholder={$t("例如：每个新版本发布后，把更新内容同步到中英文更新日志页面")}/></label>
  <p className="nr-footnote">{$t("起草会调用一次在线 AI；没有起草成功不会自动重试。")}</p>
  {error&&<p role="alert" className="nr-error">{error}</p>}
  <DialogFooter className="sm:justify-between"><Button variant="ghost" disabled={busy} onClick={()=>onDraft(blank)}>{$t("不用 AI，直接新建")}</Button><Button disabled={busy} onClick={()=>void ask()}><SparklesIcon/>{busy?$t("正在起草…"):$t("让 AI 起草")}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
// The Skills a step names, by name (Skills deleted since are left out). They always go to the Agent for this step.
function StepSkills({ids,skills}:{ids?:string[];skills:Skill[]}){
 const named=(ids||[]).map(id=>skills.find(s=>s.id===id)).filter((s):s is Skill=>Boolean(s));
 return named.length?<p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{$t("用这些 Skill：")}{named.map(s=><Tag key={s.id} tone="violet" className="font-mono">{s.name}</Tag>)}</p>:null;
}
// Picking a step's Skills from the library: chips to remove, a list to add (at most 5).
function PickSkills({index,ids,skills,onChange}:{index:number;ids:string[];skills:Skill[];onChange:(ids:string[])=>void}){
 const known=ids.filter(id=>skills.some(s=>s.id===id)),rest=skills.filter(s=>!ids.includes(s.id));
 return <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label={$t("第 {0} 步用的 Skill",{0:index+1})}><span className="text-muted-foreground">{$t("用这些 Skill：")}</span>
  {known.map(id=>{const s=skills.find(x=>x.id===id)!;return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-nr-tint-violet py-0.5 pr-1 pl-2 font-mono text-nr-ink-violet">{s.name}<button type="button" aria-label={$t("不用 {0}",{0:s.name})} className="rounded-full hover:bg-background/60" onClick={()=>onChange(ids.filter(x=>x!==id))}><XIcon className="size-3"/></button></span>;})}
  {skills.length?known.length<5&&rest.length>0&&<select aria-label={$t("给第 {0} 步添加 Skill",{0:index+1})} value="" onChange={e=>e.target.value&&onChange([...known,e.target.value])} className="h-7 min-w-28 text-xs"><option value="">{$t("＋ 选择")}</option>{rest.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
   :<span className="text-muted-foreground">{$t("还没有 Skill，可以在 Skills 页新建")}</span>}
 </div>;
}
