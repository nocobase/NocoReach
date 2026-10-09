import {resolveAppUrl} from '@nocobase/app-client';
import { $t, $tj } from "@/i18n";
import {useEffect,useState} from 'react';
import {AdminOnlyNote,useMe} from './me';
import {PageContainer,PageHeader,SectionHeading} from '@/components/reach/page';
import {useNavigate} from 'react-router';
import {Monitor,Plus,Check,ChevronDown} from 'lucide-react';
import {RuntimeIcon} from '@/components/reach/actor';
import {Button} from '@/components/reach-ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/reach-ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/reach-ui/dropdown-menu';
import {OnlineAICard,ConnectOnlineAI,onlineRequest,type OnlineStatus} from './online-ai';
import {useProject} from './reach-data';
import {agentRequest} from './repo-connect';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-execution.css';
import './agents.css';
import {confirmAction} from '@/components/reach/confirm';
import {Tag} from '@/components/reach/tag';
import {AgentCard} from '@/components/reach/agent-card';
import {InfoTip} from '@/components/reach/info-tip';
type Computer={id:string;name:string;createdAt:string;lastSeenAt?:string;version?:string;tools?:Record<string,string>;mode?:'service'|'terminal';online:boolean};
type Status={revision:number;repo:{repo:string}|null;computers:Computer[]};
const toolNames:Record<string,string>={claude:'Claude Code'};
function ago(iso?:string){if(!iso)return '—';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?$t("刚刚"):m<60?$t("{0} 分钟前",{0:m}):m<1440?$t("{0} 小时前",{0:Math.round(m/60)}):new Date(iso).toLocaleDateString();}
// Agent (SPEC §10, after NocoProject's Agent page): every AI that does the work, in one place — the local Agent on your
// computers (it runs every task) and the online AI (daily analysis and opportunities). Both are added from one 添加 menu;
// forms open in dialogs.
// Which repository the local Agent changes is a data source (数据接入 → 网站源码).
export default function AgentsPage(){
 const {project,error:projectError}=useProject(),navigate=useNavigate(),{isAdmin}=useMe();const [st,setSt]=useState<Status>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[adding,setAdding]=useState(false),[reconnecting,setReconnecting]=useState<{id:string;background?:boolean}>(),[online,setOnline]=useState<OnlineStatus>(),[connecting,setConnecting]=useState(false),[notice,setNotice]=useState('');
 async function load(){if(!project)return;try{setSt(await agentRequest<Status>('status',project.id));}catch{setError($t("读取电脑状态失败，请刷新后重试。"));}}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),adding||reconnecting?3000:10000);return()=>clearInterval(t);},[project?.id,adding,reconnecting]);
 async function loadOnline(){if(!project)return;try{setOnline(await onlineRequest<OnlineStatus>('status',project.id));}catch(e){setError(e instanceof Error?e.message:$t("读取在线 AI 状态失败。"));}}
 useEffect(()=>{void loadOnline();},[project?.id]);
 async function check(){if(!project)return;setBusy(true);setNotice('');setError('');try{const r=await onlineRequest<{ok:boolean;message?:string}>('check',project.id);if(r.ok)setNotice($t("在线 AI 连接正常。"));else setError(r.message||$t("连接没有成功。"));}catch(e){setError(e instanceof Error?e.message:$t("测试没有完成，请重试。"));}finally{setBusy(false);}}
 async function remove(c:Computer){const seen=Boolean(c.lastSeenAt);if(!(await confirmAction(seen?{title:$t("断开“{0}”？",{0:c.name}),description:$t("它将不能再领取任务，需要重新添加才能使用。"),action:'断开'}:{title:$t("删除“{0}”？",{0:c.name}),description:$t("它还没有连上过。"),action:'删除'})))return;setBusy(true);setError('');void agentRequest('revoke',project!.id,{computerId:c.id}).then(load).catch(()=>setError($t("操作没有完成，请重试。"))).finally(()=>setBusy(false));}
 return <PageContainer className="nr-page nr-discovery nr-agents-page">
  <PageHeader title="Agent" description={$t("帮你干活的 AI：在线 AI 每天分析数据、提出机会；所有任务交给本机 Agent 去做。")}
   actions={isAdmin&&<DropdownMenu><DropdownMenuTrigger render={<Button disabled={!project}/>}><Plus/>{$t("添加")}<ChevronDown/></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-max whitespace-nowrap">
    <DropdownMenuItem onClick={()=>setAdding(true)}><RuntimeIcon type="computer"/>{$t("连接一台电脑（本机 Agent）")}</DropdownMenuItem>
    <DropdownMenuItem disabled={!online} onClick={()=>setConnecting(true)}><RuntimeIcon type="online"/>{$t("接入在线 AI")}</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>}/><AdminOnlyNote/>
  {(projectError||error)&&<p role="alert" className="nr-error">{projectError||error}</p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <SectionHeading title={<><RuntimeIcon type="computer" className="size-4 text-muted-foreground"/>{$t("本机 Agent")}</>} description={<>{$t("所有任务：在你的电脑上分析、写文档、改网站源码并开 PR。修改哪个仓库在")}<Button variant="link" size="sm" className="nr-inline-link" onClick={()=>navigate('/connections?source=repo')}>{$t("数据接入 → 网站源码")}</Button>{$t("里设置。")}</>}/>
  {!st?<p role="status">{$t("正在读取…")}</p>:!st.computers.length?<section className="nr-panel nr-agents-empty"><Monitor aria-hidden="true"/><h2>{$t("还没有添加电脑")}</h2><p className="nr-muted">{$t("添加后，任务会交给这台电脑上的 Agent 执行。")}</p>{isAdmin&&<Button variant="outline" onClick={()=>setAdding(true)}><Plus/>{$t("添加电脑")}</Button>}</section>
  :<section className="nr-computer-list" aria-label={$t("电脑")}>{st.computers.map(c=>{
   // Same card as the online AI (AgentCard). 可用 means it can take work: online with a coding tool. How it runs (2026-10-08
   // user feedback: the page did not show whether a computer comes back by itself) is a fact; 设为后台运行 and 重新连接 are buttons.
   const state=c.online?'online':c.lastSeenAt?'offline':'never',tools=Object.entries(c.tools||{}).map(([k,v])=>`${toolNames[k]||k} ${v}`);
   return <AgentCard key={c.id} className="nr-computer" data-state={state} name={c.name}
    status={state==='never'?<Tag tone="grey" dot>{$t("尚未连上")}</Tag>:state==='offline'?<Tag tone="amber" dot>{$t("离线")}</Tag>:tools.length?<Tag tone="green" dot>{$t("可用")}</Tag>:<Tag tone="amber" dot>{$t("不可用")}</Tag>}
    detail={state==='never'?$t("在这台电脑上运行连接命令后，这里会显示检测到的编码工具。"):[tools.length?tools.join(' · '):$t("没有检测到编码工具，请先安装 Claude Code。"),c.version?$t("程序 {0}",{0:c.version}):''].filter(Boolean).join(' · ')}
    facts={state==='never'?[]:[{label:$t("运行方式"),value:c.mode==='service'?<>{$t("后台运行")}<InfoTip>{$t("关掉终端、重启电脑后会自动连上。")}</InfoTip></>:$t("在终端里运行")},{label:$t("最近在线"),value:ago(c.lastSeenAt)}]}
    actions={[
     state==='online'&&c.mode!=='service'&&<Button key="bg" size="sm" variant="outline" onClick={()=>setReconnecting({id:c.id,background:true})}>{$t("设为后台运行")}</Button>,
     state==='offline'&&<Button key="re" size="sm" variant="outline" onClick={()=>setReconnecting({id:c.id})}>{$t("重新连接")}</Button>,
     isAdmin&&<Button key="rm" size="sm" variant="ghost" disabled={busy} onClick={()=>remove(c)}>{state==='never'?$t("删除"):$t("断开")}</Button>,
    ]}/>;})}</section>}
  <SectionHeading className="mt-2" title={<><RuntimeIcon type="online" className="size-4 text-muted-foreground"/>{$t("在线 AI")}</>} description={$t("每日分析和机会，由 NocoBase AI 插件提供；新建做法时也由它帮你起草。")}/>
  {!online?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取…")}</p>:<OnlineAICard status={online} busy={busy} readOnly={!isAdmin} onConnect={()=>setConnecting(true)} onCheck={()=>void check()}/>}
  {project&&online&&<ConnectOnlineAI open={connecting} projectId={project.id} status={online} onClose={()=>setConnecting(false)} onSaved={s=>{setOnline(s);setConnecting(false);setError('');setNotice($t("已接入在线 AI：{0} · {1}",{0:s.service?.providerTitle||'',1:s.model||''}));}}/>}
  {reconnecting&&<Reconnect computer={st?.computers.find(c=>c.id===reconnecting.id)} background={reconnecting.background} onClose={()=>{setReconnecting(undefined);void load();}}/>}
  {project&&<AddComputer open={adding} projectId={project.id} computers={st?.computers||[]} onClose={()=>{setAdding(false);void load();}}/>}
 </PageContainer>;
}
// The Agent program as a background service (2026-10-08 user feedback: it went offline whenever its terminal window
// closed or the Mac restarted): install-service is the recommended command, after NocoProject's `daemon install`;
// start in a window that stays open is the alternative for computers other than a Mac.
const CLI='node apps/agent/dist/cli.js',START=`${CLI} start`,SERVICE=`${CLI} install-service`;
const notMac=()=><p className="nr-footnote">{$tj("不是 Mac：运行 {0}，窗口别关。",{0:<code>{START}</code>})}</p>;
// 重新连接 (2026-10-08 user feedback: an offline computer had no way back): the Agent program stopped on that computer
// (its terminal window closed, a restart). Installing it as a background service starts it now and keeps it running —
// the key is saved there — and the page shows when it is back. A computer reinstalled (no saved key) is removed and
// added again. 设为后台运行 is the same dialog for an online computer whose Agent runs in a terminal window; it is done
// once the program reports running as the background service.
function Reconnect({computer,background,onClose}:{computer?:Computer;background?:boolean;onClose:()=>void}){
 const [copied,setCopied]=useState(false),command=SERVICE,back=Boolean(computer?.online&&(!background||computer.mode==='service'));
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="nr-add-computer">
  <DialogHeader><DialogTitle>{background?$t("把“{0}”设为后台运行",{0:computer?.name||''}):$t("重新连接“{0}”",{0:computer?.name||''})}</DialogTitle><DialogDescription>{background?$t("现在 Agent 在这台电脑的终端里运行，关掉窗口就会离线。运行下面这行把它装成后台程序：关掉终端、重启电脑后也会自动运行。装好后原来的终端窗口可以关掉。"):$t("这台电脑上的 Agent 程序停了（比如运行它的终端窗口关了、电脑重启过）。运行下面这行把它装成后台程序：马上连上，以后关掉终端或重启电脑也会自动运行。不用重新生成密钥。")}</DialogDescription></DialogHeader>
  <ol className="nr-add-steps">
   <li><b>{$t("在这台电脑的 NocoReach 源码目录运行")}</b><pre aria-label={$t("启动命令")}>{command}</pre><div className="nr-step-actions"><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard?.writeText(command).then(()=>setCopied(true))}>{copied?$t("已复制"):$t("复制命令")}</Button></div>{background?<p className="nr-footnote">{$t("目前只支持 Mac。")}</p>:notMac()}</li>
   <li><b>{background?$t("等它变成后台运行"):$t("等它连上")}</b>{back?<p className="nr-add-ok"><Check aria-hidden="true"/>{background?$t("已设为后台运行"):$t("已连上")}</p>:<p role="status" className="nr-footnote">{background?$t("等待…运行后几秒内变成后台运行。"):$t("等待连接…运行后几秒内连上。")}</p>}</li>
  </ol>
  {!background&&<p className="nr-footnote">{$t("如果提示密钥无效，或这台电脑重装过：先断开它，再用“添加 → 连接电脑”重新连接。")}</p>}
  <div className="nr-step-actions"><Button variant={back?'default':'outline'} onClick={onClose}>{back?$t("完成"):$t("关闭")}</Button></div>
 </DialogContent></Dialog>;
}
// Three steps after NocoProject's “添加电脑”: name it and issue a key (shown once), run the commands, see it connect.
function AddComputer({open,projectId,computers,onClose}:{open:boolean;projectId:number;computers:Computer[];onClose:()=>void}){
 const [name,setName]=useState($t("我的电脑")),[issued,setIssued]=useState<{key:string;computerId:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{if(open){setIssued(undefined);setError('');setCopied(false);}},[open]);
 const commands=issued?`node apps/agent/build.cjs\n${CLI} login --server ${new URL(resolveAppUrl('/'),window.location.origin).href.replace(/\/$/,'')} --project ${projectId} --key ${issued.key}\n${SERVICE}`:'';
 const mine=computers.find(c=>c.id===issued?.computerId),connected=Boolean(mine?.online);
 async function issue(){setBusy(true);setError('');try{setIssued(await agentRequest<{key:string;computerId:string}>('connect',projectId,{name}));}catch(e){setError(e instanceof Error?e.message:$t("没有生成连接命令，请重试。"));}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="nr-add-computer">
  <DialogHeader><DialogTitle>{$t("添加电脑")}</DialogTitle><DialogDescription>{$t("在装有 Claude Code 和 GitHub CLI（已运行 gh auth login）的电脑上完成下面三步。")}</DialogDescription></DialogHeader>
  <ol className="nr-add-steps">
   <li><b>{$t("给这台电脑起个名字")}</b>{issued?<p>{name}</p>:<div className="nr-connect-row"><input aria-label={$t("电脑名称")} value={name} maxLength={60} disabled={busy} placeholder={$t("例如 工作室 Mac")} onChange={e=>setName(e.target.value)}/><Button disabled={busy||!name.trim()} onClick={()=>void issue()}>{$t("生成连接命令")}</Button></div>}{error&&<p role="alert" className="nr-error">{error}</p>}</li>
   <li data-pending={!issued||undefined}><b>{$t("在这台电脑的 NocoReach 源码目录运行")}</b>{issued?<><pre aria-label={$t("连接命令")}>{commands}</pre><div className="nr-step-actions"><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard?.writeText(commands).then(()=>setCopied(true))}>{copied?$t("已复制"):$t("复制命令")}</Button></div><p className="nr-footnote">{$t("命令里的密钥只显示这一次，只能用来领取任务，可以随时断开。最后一行把 Agent 装成后台程序：关掉终端、重启电脑后也会自动运行。")}</p>{notMac()}</>:<p className="nr-footnote">{$t("生成后显示。")}</p>}</li>
   <li data-pending={!issued||undefined}><b>{$t("等它连上")}</b>{!issued?<p className="nr-footnote">{$t("运行后几秒钟内会自动连上。")}</p>:connected?<p className="nr-add-ok"><Check aria-hidden="true"/>{$tj("已连上{0}",{0:mine?.tools?.claude?$t("，检测到 Claude Code {0}",{0:mine.tools.claude}):''})}</p>:<p role="status" className="nr-footnote">{$t("等待连接…运行第三行命令后几秒内连上。")}</p>}</li>
  </ol>
  <div className="nr-step-actions"><Button variant={connected?'default':'outline'} onClick={onClose}>{connected?$t("完成"):issued?$t("稍后再连"):$t("取消")}</Button></div>
 </DialogContent></Dialog>;
}
