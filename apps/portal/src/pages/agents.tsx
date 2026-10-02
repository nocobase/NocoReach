import {useEffect,useState} from 'react';
import {PageContainer,PageHeader,SectionHeading} from '@/components/reach/page';
import {useNavigate} from 'react-router';
import {Monitor,Plus,Check,ChevronDown,Laptop,Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {OnlineAICard,ConnectOnlineAI,onlineRequest,type OnlineStatus} from './online-ai';
import {useProject} from './reach-data';
import {agentRequest} from './repo-connect';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-execution.css';
import './agents.css';
type Computer={id:string;name:string;createdAt:string;lastSeenAt?:string;version?:string;tools?:Record<string,string>;online:boolean};
type Status={revision:number;repo:{repo:string}|null;computers:Computer[]};
const toolNames:Record<string,string>={claude:'Claude Code'};
function ago(iso?:string){if(!iso)return '—';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?'刚刚':m<60?`${m} 分钟前`:m<1440?`${Math.round(m/60)} 小时前`:new Date(iso).toLocaleDateString();}
// Agent (SPEC §10, after NocoProject's Agent page): every AI that does the work, in one place — the local Agent on your
// computers (it runs every task) and the online AI (daily analysis and opportunities). Both are added from one 添加 menu;
// forms open in dialogs.
// Which repository the local Agent changes is a data source (数据接入 → 网站源码).
export default function AgentsPage(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [st,setSt]=useState<Status>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[adding,setAdding]=useState(false),[online,setOnline]=useState<OnlineStatus>(),[connecting,setConnecting]=useState(false),[notice,setNotice]=useState('');
 async function load(){if(!project)return;try{setSt(await agentRequest<Status>('status',project.id));}catch{setError('读取电脑状态失败，请刷新后重试。');}}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),adding?3000:10000);return()=>clearInterval(t);},[project?.id,adding]);
 async function loadOnline(){if(!project)return;try{setOnline(await onlineRequest<OnlineStatus>('status',project.id));}catch(e){setError(e instanceof Error?e.message:'读取在线 AI 状态失败。');}}
 useEffect(()=>{void loadOnline();},[project?.id]);
 async function check(){if(!project)return;setBusy(true);setNotice('');setError('');try{const r=await onlineRequest<{ok:boolean;message?:string}>('check',project.id);if(r.ok)setNotice('在线 AI 连接正常。');else setError(r.message||'连接没有成功。');}catch(e){setError(e instanceof Error?e.message:'测试没有完成，请重试。');}finally{setBusy(false);}}
 function remove(c:Computer){const seen=Boolean(c.lastSeenAt);if(!confirm(seen?`断开“${c.name}”？它将不能再领取任务，需要重新添加才能使用。`:`删除“${c.name}”？它还没有连上过。`))return;setBusy(true);setError('');void agentRequest('revoke',project!.id,{computerId:c.id}).then(load).catch(()=>setError('操作没有完成，请重试。')).finally(()=>setBusy(false));}
 return <PageContainer className="nr-page nr-discovery nr-agents-page">
  <PageHeader title="Agent" description="帮你干活的 AI：在线 AI 每天分析数据、提出机会；所有任务交给本机 Agent 去做。"
   actions={<DropdownMenu><DropdownMenuTrigger render={<Button disabled={!project}/>}><Plus/>添加<ChevronDown/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max whitespace-nowrap">
    <DropdownMenuItem onClick={()=>setAdding(true)}><Laptop/>连接一台电脑（本机 Agent）</DropdownMenuItem>
    <DropdownMenuItem disabled={!online} onClick={()=>setConnecting(true)}><Sparkles/>接入在线 AI</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>}/>
  {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <SectionHeading title={<><Laptop className="size-4 text-muted-foreground" aria-hidden="true"/>本机 Agent</>} description={<>所有任务：在你的电脑上分析、写文档、改网站源码并开 PR。修改哪个仓库在<Button variant="link" size="sm" className="nr-inline-link" onClick={()=>navigate('/connections?source=repo')}>数据接入 → 网站源码</Button>里设置。</>}/>
  {!st?<p role="status">正在读取…</p>:!st.computers.length?<section className="nr-panel nr-agents-empty"><Monitor aria-hidden="true"/><h2>还没有添加电脑</h2><p className="nr-muted">添加后，任务会交给这台电脑上的 Agent 执行。</p><Button variant="outline" onClick={()=>setAdding(true)}><Plus/>添加电脑</Button></section>
  :<section className="nr-computer-list" aria-label="电脑">{st.computers.map(c=>{const state=c.online?'online':c.lastSeenAt?'offline':'never';const tools=Object.entries(c.tools||{});return <div key={c.id} className="nr-computer" data-state={state}>
   <div className="nr-computer-head"><Monitor aria-hidden="true"/><b>{c.name}</b><span className="nr-computer-state">{state==='online'?'在线':state==='offline'?'离线':'尚未连上'}</span>{c.version&&<small>程序 {c.version}</small>}{state==='offline'&&<small>上次在线 {ago(c.lastSeenAt)}</small>}
    <Button size="sm" variant="ghost" disabled={busy} onClick={()=>remove(c)}>{state==='never'?'删除':'断开'}</Button></div>
   {tools.length?tools.map(([k,v])=><div key={k} className="nr-computer-tool"><span className="nr-tool-name">{toolNames[k]||k}</span><small>{v}</small><small className={c.online?'nr-tool-ok':''}>{c.online?'可用':'离线'}</small><small className="nr-tool-seen">{ago(c.lastSeenAt)}</small></div>)
   :<div className="nr-computer-tool"><small>{state==='never'?'在这台电脑上运行连接命令后，这里会显示检测到的编码工具。':'没有检测到编码工具，请先安装 Claude Code。'}</small></div>}
  </div>;})}</section>}
  <SectionHeading className="mt-2" title={<><Sparkles className="size-4 text-muted-foreground" aria-hidden="true"/>在线 AI</>} description="每日分析和机会，由 NocoBase AI 插件提供；新建做法时也由它帮你起草。"/>
  {!online?<p role="status" className="text-sm text-muted-foreground">正在读取…</p>:<OnlineAICard status={online} busy={busy} onConnect={()=>setConnecting(true)} onCheck={()=>void check()}/>}
  {project&&online&&<ConnectOnlineAI open={connecting} projectId={project.id} status={online} onClose={()=>setConnecting(false)} onSaved={s=>{setOnline(s);setConnecting(false);setError('');setNotice(`已接入在线 AI：${s.service?.providerTitle||''} · ${s.model||''}`);}}/>}
  {project&&<AddComputer open={adding} projectId={project.id} computers={st?.computers||[]} onClose={()=>{setAdding(false);void load();}}/>}
 </PageContainer>;
}
// Three steps after NocoProject's “添加电脑”: name it and issue a key (shown once), run the commands, see it connect.
function AddComputer({open,projectId,computers,onClose}:{open:boolean;projectId:number;computers:Computer[];onClose:()=>void}){
 const [name,setName]=useState('我的电脑'),[issued,setIssued]=useState<{key:string;computerId:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{if(open){setIssued(undefined);setError('');setCopied(false);}},[open]);
 const cli='node apps/agent/dist/cli.js',commands=issued?`node apps/agent/build.cjs\n${cli} login --server ${window.location.origin} --project ${projectId} --key ${issued.key}\n${cli} start`:'';
 const mine=computers.find(c=>c.id===issued?.computerId),connected=Boolean(mine?.online);
 async function issue(){setBusy(true);setError('');try{setIssued(await agentRequest<{key:string;computerId:string}>('connect',projectId,{name}));}catch(e){setError(e instanceof Error?e.message:'没有生成连接命令，请重试。');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="nr-add-computer">
  <DialogHeader><DialogTitle>添加电脑</DialogTitle><DialogDescription>在装有 Claude Code 和 GitHub CLI（已运行 gh auth login）的电脑上完成下面三步。</DialogDescription></DialogHeader>
  <ol className="nr-add-steps">
   <li><b>给这台电脑起个名字</b>{issued?<p>{name}</p>:<div className="nr-connect-row"><input aria-label="电脑名称" value={name} maxLength={60} disabled={busy} placeholder="例如 工作室 Mac" onChange={e=>setName(e.target.value)}/><Button disabled={busy||!name.trim()} onClick={()=>void issue()}>生成连接命令</Button></div>}{error&&<p role="alert" className="nr-error">{error}</p>}</li>
   <li data-pending={!issued||undefined}><b>在这台电脑的 NocoReach 源码目录运行</b>{issued?<><pre aria-label="连接命令">{commands}</pre><div className="nr-step-actions"><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard?.writeText(commands).then(()=>setCopied(true))}>{copied?'已复制':'复制命令'}</Button></div><p className="nr-footnote">命令里的密钥只显示这一次，只能用来领取任务，可以随时断开。最后一行会一直运行，窗口别关。</p></>:<p className="nr-footnote">生成后显示。</p>}</li>
   <li data-pending={!issued||undefined}><b>等它连上</b>{!issued?<p className="nr-footnote">运行后几秒钟内会自动连上。</p>:connected?<p className="nr-add-ok"><Check aria-hidden="true"/>已连上{mine?.tools?.claude?`，检测到 Claude Code ${mine.tools.claude}`:''}</p>:<p role="status" className="nr-footnote">等待连接…运行第三行后几秒钟内会显示在这里。</p>}</li>
  </ol>
  <div className="nr-step-actions"><Button variant={connected?'default':'outline'} onClick={onClose}>{connected?'完成':issued?'稍后再连':'取消'}</Button></div>
 </DialogContent></Dialog>;
}
