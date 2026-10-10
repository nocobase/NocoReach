import { $t, $tj } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
// Discord or Slack (SPEC §11 社区; separate panels since 2026-10-04): the team's own bot token; it is checked and the
// channels listed first, then the chosen channels (up to ten) are read once a day.
type Run={at:string;ok:boolean;errors:string[];read:number};
type Side={connected:boolean;tokenSaved:boolean;name?:string;bot?:string;channels?:{id:string;name:string;kind:string}[];lastRun?:Run|null};
export type ChatStatus={connected:boolean;syncing?:boolean;discord:Side;slack:Side;lastRun:{at:string;ok:boolean;errors:string[];read:number}|null;total?:number;nextSyncAt?:string|null};
type Info={platform:'discord'|'slack';bot:string;team?:string;invite?:string;guilds?:{id:string;name:string}[];guildId?:string;channels:{id:string;name:string;kind:string;member?:boolean;members?:number}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrChat',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
const STEPS={discord:[$t("在 Discord 开发者后台（discord.com/developers）新建应用，进 Bot 页，打开 Message Content Intent，点 Reset Token 复制 token。"),$t("粘贴到下面点“检查”；如果机器人还没进服务器，会给你邀请链接（只要“查看频道”和“读取消息历史”）。"),$t("选要读的频道，点“接入”。")],slack:[$t("在 api.slack.com/apps 用 From scratch 新建应用，选你们的工作区（内部应用，读取不限速）。"),$t("在 OAuth & Permissions 加 Bot 权限 channels:read、channels:history、channels:join，安装到工作区，复制 Bot User OAuth Token（xoxb- 开头）。"),$t("粘贴到下面点“检查”，选要读的公开频道，点“接入”。")]};
export function ChatConnect({projectId,platform,onChange}:{projectId:number;platform:'discord'|'slack';onChange:()=>void}){
 const [status,setStatus]=useState<ChatStatus>(),[token,setToken]=useState(''),[info,setInfo]=useState<Info>(),[guild,setGuild]=useState(''),[picked,setPicked]=useState<string[]>([]),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<ChatStatus>(projectId,'status').then(s=>{setStatus(s);return s;});
 useEffect(()=>{void load().catch(()=>setError($t("读取状态失败。")));},[projectId]);
 useEffect(()=>{if(!status?.syncing)return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.syncing]);
 async function run<T>(fn:()=>Promise<T>,done:(r:T)=>void){setBusy(true);setError('');try{done(await fn());}catch(e){setError(e instanceof Error?e.message:$t("操作未完成，请重试。"));}finally{setBusy(false);}}
 const inspect=(guildId=guild)=>run(()=>call<Info>(projectId,'inspect',{platform,token,guildId}),i=>{setInfo(i);setGuild(i.guildId||'');const saved=status?.[platform].channels?.map(c=>c.id)||[];setPicked(i.channels.filter(c=>saved.includes(c.id)).map(c=>c.id));});
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t("正在读取…")}</p>;
 const side=status[platform],label=platform==='discord'?'Discord':'Slack';
 if(side.connected&&!editing)return <><div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj("{0}：{1}（机器人 {2}）",{0:label,1:side.name,2:side.bot})}</h3><p>{$tj("读 {0}",{0:side.channels!.map(c=>`#${c.name}`).join('、')})}</p>
  {(side.lastRun||status.lastRun)?<p className="nr-footnote">{$tj("上次读取 {0}，读到 {1} 条，之后每天一次。",{0:new Date((side.lastRun||status.lastRun)!.at).toLocaleString(),1:(side.lastRun||status.lastRun)!.read})}{(side.lastRun||status.lastRun)!.errors.map(e=><span key={e} className="nr-block">{$tj("没有读完：{0}",{0:e})}</span>)}</p>:<p role="status">{$t("正在第一次读取（最近 14 天），可以先关闭面板。")}</p>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<ChatStatus>(projectId,'sync',{platform}),s=>{setStatus(s);onChange();})}>{busy?$t("正在读取…"):$t("立即读取")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setEditing(true);void inspect();}}>{$t("改频道")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:$t("断开 {0}？",{0:label}),description:$t("保存的 token 会删除，已读到的消息保留 30 天。"),action:'断开'}))void run(()=>call<ChatStatus>(projectId,'disconnect',{platform}),s=>{setStatus(s);onChange();});}}>{$t("断开")}</Button></div></div></>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!editing&&<ol className="nr-footnote list-decimal pl-5">{STEPS[platform].map(s=><li key={s}>{s}</li>)}</ol>}
  {!editing&&<label className="nr-field">{platform==='discord'?$t("机器人 token"):'Bot User OAuth Token'}<input aria-label={`${label} token`} type="password" autoComplete="off" value={token} disabled={busy} placeholder={side.tokenSaved?$t("已保存，不改可以留空"):platform==='slack'?'xoxb-…':''} onChange={e=>{setToken(e.target.value);setInfo(undefined);}}/></label>}
  {!info&&<div className="nr-step-actions"><Button disabled={busy||!(token.trim()||side.tokenSaved)} onClick={()=>void inspect()}>{busy?$t("正在检查…"):$t("检查")}</Button></div>}
  {info&&<div className="flex flex-col gap-3" data-chat-channels>
   <p className="nr-footnote">{$tj("机器人 {0}{1}",{0:info.bot,1:info.team?$t(" · 工作区 {0}",{0:info.team}):''})}</p>
   {info.platform==='discord'&&!info.guilds?.length?<p className="nr-footnote">{$t("机器人还没进任何服务器。")}<a className="nr-link" href={info.invite} target="_blank" rel="noreferrer">{$t("邀请机器人进服务器")}</a>{$t("，然后点“重新检查”。")}</p>:null}
   {info.platform==='discord'&&(info.guilds?.length||0)>1?<label className="nr-field">{$t("服务器")}<select aria-label={$t("服务器")} value={guild} onChange={e=>{setGuild(e.target.value);void inspect(e.target.value);}}><option value="">{$t("选一个服务器")}</option>{info.guilds!.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>:null}
   {info.channels.length?<fieldset className="flex flex-col gap-1.5"><legend className="mb-1 text-sm">{$tj("要读的频道（最多 10 个，已选 {0}）",{0:picked.length})}</legend>{info.channels.map(c=><label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(c.id)} disabled={!picked.includes(c.id)&&picked.length>=10} onChange={e=>setPicked(p=>e.target.checked?[...p,c.id]:p.filter(x=>x!==c.id))}/>#{c.name}{c.kind==='forum'?$t("（论坛）"):''}{c.members?<span className="text-xs text-muted-foreground">{$tj("{0} 人{1}",{0:c.members,1:c.member===false?$t(" · 接入时自动加入"):''})}</span>:null}</label>)}</fieldset>:info.guildId||info.platform==='slack'?<p className="nr-footnote">{$t("没有找到机器人能读的频道。")}</p>:null}
   <p className="nr-footnote">{$t("每天读一次：第一次读最近 14 天，之后读新消息。消息内容保存 30 天，不保存作者；token 只存在这台服务器上。")}</p>
   <div className="nr-step-actions"><Button disabled={busy||!picked.length} onClick={()=>void run(()=>call<ChatStatus>(projectId,'connect',{platform,token,guildId:guild,channels:picked}),s=>{setStatus(s);setEditing(false);setInfo(undefined);setToken('');onChange();})}>{busy?$t("正在接入…"):editing?$t("保存"):$t("接入")}</Button><Button variant="ghost" disabled={busy} onClick={()=>void inspect()}>{$t("重新检查")}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>{setEditing(false);setInfo(undefined);}}>{$t("取消")}</Button>}</div>
  </div>}</>;
}
