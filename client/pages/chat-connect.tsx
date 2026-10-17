import { useBusinessAccess } from '#hooks/use-business-access';
import { translateSourceError, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
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
const getSteps = () => ({discord:[$t('chat.discordDeveloperPortalDiscordCom'),$t('chat.pasteBelowClickCheckIf'),$t('chat.pickChannelsReadClickConnect')],slack:[$t('chat.apiSlackComAppsCreate'),$t('chat.oauthPermissionsAddBotScopes'),$t('chat.pasteBelowClickCheckPick')]});
export function ChatConnect({projectId,platform,onChange}:{projectId:number;platform:'discord'|'slack';onChange:()=>void}){
 const {can:canInspect}=useBusinessAccess('nrChat.inspect',projectId);
 const {can:canConnect}=useBusinessAccess('nrChat.connect',projectId);
 const {can:canSync}=useBusinessAccess('nrChat.sync',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrChat.disconnect',projectId);
 const [status,setStatus]=useState<ChatStatus>(),[token,setToken]=useState(''),[info,setInfo]=useState<Info>(),[guild,setGuild]=useState(''),[picked,setPicked]=useState<string[]>([]),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<ChatStatus>(projectId,'status').then(s=>{setStatus(s);return s;});
 useEffect(()=>{void load().catch(()=>setError(() => ($t('chat.notLoadStatus'))));},[projectId]);
 useEffect(()=>{if(!status?.syncing)return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.syncing]);
 async function run<T>(fn:()=>Promise<T>,done:(r:T)=>void){setBusy(true);setError('');try{done(await fn());}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 const inspect=(guildId=guild)=>run(()=>call<Info>(projectId,'inspect',{platform,token,guildId}),i=>{setInfo(i);setGuild(i.guildId||'');const saved=status?.[platform].channels?.map(c=>c.id)||[];setPicked(i.channels.filter(c=>saved.includes(c.id)).map(c=>c.id));});
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
 const side=status[platform],label=platform==='discord'?'Discord':'Slack';
 if(side.connected&&(!editing||!canInspect||!canConnect))return <><div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>{$tj('chat.connectionBot',{0:label,1:side.name,2:side.bot})}</h3><p>{$tj('chat.read',{0:side.channels!.map(c=>`#${c.name}`).join('、')})}</p>
  {(side.lastRun||status.lastRun)?<p className="nr-footnote">{$tj('chat.lastReadMessagesReadsOnce',{0:new Date((side.lastRun||status.lastRun)!.at).toLocaleString(getCurrentLocale()),1:(side.lastRun||status.lastRun)!.read})}{(side.lastRun||status.lastRun)!.errors.map(e=><span key={e} className="nr-block">{$tj('chat.notFullyRead',{0:translateSourceError(e)})}</span>)}</p>:<p role="status">{$t('chat.readingFirstTimeLast14')}</p>}
  <div className="nr-step-actions">{canSync&&<Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<ChatStatus>(projectId,'sync',{platform}),s=>{setStatus(s);onChange();})}>{busy?$t('common.loadingLoading'):$t('common.readNow')}</Button>}{canInspect&&canConnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setEditing(true);void inspect();}}>{$t('chat.changeChannels')}</Button>}{canDisconnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('chat.disconnect',{0:label})),description:() => ($t('chat.savedTokenDeletedMessagesAlready')),action:'common.disconnect'}))void run(()=>call<ChatStatus>(projectId,'disconnect',{platform}),s=>{setStatus(s);onChange();});}}>{$t('common.disconnect')}</Button>}</div></div></>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!canInspect&&!info&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {!editing&&canInspect&&<ol className="nr-footnote list-decimal pl-5">{getSteps()[platform].map(s=><li key={s}>{s}</li>)}</ol>}
  {!editing&&canInspect&&<label className="nr-field">{platform==='discord'?$t('chat.botToken'):'Bot User OAuth Token'}<input aria-label={`${label} token`} type="password" autoComplete="off" value={token} disabled={busy} placeholder={side.tokenSaved?$t('common.savedLeaveEmptyKeep'):platform==='slack'?'xoxb-…':''} onChange={e=>{setToken(e.target.value);setInfo(undefined);}}/></label>}
  {!info&&canInspect&&<div className="nr-step-actions"><Button disabled={busy||!(token.trim()||side.tokenSaved)} onClick={()=>void inspect()}>{busy?$t('common.checking'):$t('common.check')}</Button></div>}
  {info&&<div className="flex flex-col gap-3" data-chat-channels>
   <p className="nr-footnote">{$tj('chat.botIdentity',{0:info.bot,1:info.team?$t('chat.workspace',{0:info.team}):''})}</p>
   {info.platform==='discord'&&!info.guilds?.length?<p className="nr-footnote">{$t('chat.botNotJoinedServerYet')}<a className="nr-link" href={info.invite} target="_blank" rel="noreferrer">{$t('chat.inviteBotServer')}</a>{$t('chat.clickCheckAgain')}</p>:null}
   {info.platform==='discord'&&(info.guilds?.length||0)>1?<label className="nr-field">{$t('common.server')}<select aria-label={$t('common.server')} value={guild} disabled={busy||!canInspect} onChange={e=>{setGuild(e.target.value);void inspect(e.target.value);}}><option value="">{$t('chat.pickServer')}</option>{info.guilds!.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>:null}
   {info.channels.length?<fieldset className="flex flex-col gap-1.5"><legend className="mb-1 text-sm">{$tj('chat.channelsReadUp10Selected',{0:picked.length})}</legend>{info.channels.map(c=><label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(c.id)} disabled={busy||!canConnect||(!picked.includes(c.id)&&picked.length>=10)} onChange={e=>setPicked(p=>e.target.checked?[...p,c.id]:p.filter(x=>x!==c.id))}/>#{c.name}{c.kind==='forum'?$t('chat.forum'):''}{c.members?<span className="text-xs text-muted-foreground">{$tj('chat.people',{0:c.members,1:c.member===false?$t('chat.joinsAutomaticallyWhenConnected'):''})}</span>:null}</label>)}</fieldset>:info.guildId||info.platform==='slack'?<p className="nr-footnote">{$t('chat.noChannelsBotRead')}</p>:null}
   <p className="nr-footnote">{$t('chat.readsOnceDayFirstTime')}</p>
   <div className="nr-step-actions">{canConnect&&<Button disabled={busy||!picked.length} onClick={()=>void run(()=>call<ChatStatus>(projectId,'connect',{platform,token,guildId:guild,channels:picked}),s=>{setStatus(s);setEditing(false);setInfo(undefined);setToken('');onChange();})}>{busy?$t('common.connecting'):editing?$t('common.save'):$t('common.connect')}</Button>}{canInspect&&<Button variant="ghost" disabled={busy} onClick={()=>void inspect()}>{$t('common.checkAgain')}</Button>}{editing&&<Button variant="ghost" disabled={busy} onClick={()=>{setEditing(false);setInfo(undefined);}}>{$t('common.cancel')}</Button>}</div>
  </div>}</>;
}
