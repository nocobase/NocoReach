import { formatDateTime, formatDate } from '#lib/format';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
import {ConnectionError,NetworkSettingsLink} from '#components/connection-error';
import {useEffect,useState} from 'react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {nocobaseClient as api} from '#lib/nocoreach-api';
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {InfoTip,WithInfo} from '#components/reach/info-tip';
type History={complete:boolean;total:number|null;from:string|null;at:string|null;error:string|null;failedAt:string|null;note:string}|null;
export type GitHubStatus={connected:boolean;history?:{running:boolean;stars:History;forks:History};repo?:string;url?:string;description?:string;lastSync?:{at:string;ok:boolean;errors:string[]}|null;token?:{verifiedAt:string;error:string|null;since:string|null}|null;latest?:{stars:number;forks:number;openIssues:number}|null;starDelta7?:number|null;views14?:number;topReferrers?:{referrer:string;count:number;uniques:number}[];issues?:{total:number;top:{title:string;url:string;comments:number}[]}|null;releases?:{tag:string;name:string;publishedAt:string;url:string}[]};
type Preview={repo:string;url:string;description:string;stars:number;forks:number};
const call=<T,>(projectId:number,action:string,body:object={},headers?:Record<string,string>)=>api.action<T>('nrGitHub',action,{method:'POST',body:{projectId,...body},headers,unwrap:'data'});
const date=(v?:string|null)=>v?formatDate(v):'—';
export function GitHubConnect({projectId,focus,suggestedUrl,onChange}:{projectId:number;focus:'repo'|'traffic';suggestedUrl?:string;onChange:()=>void}){
 const {can:canPreview}=useBusinessAccess('nrGitHub.preview',projectId);
 const {can:canConnect}=useBusinessAccess('nrGitHub.connect',projectId);
 const {can:canSync}=useBusinessAccess('nrGitHub.sync',projectId);
 const {can:canBackfill}=useBusinessAccess('nrGitHub.backfill',projectId);
 const {can:canSetToken}=useBusinessAccess('nrGitHub.setToken',projectId);
 const {can:canRemoveToken}=useBusinessAccess('nrGitHub.removeToken',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrGitHub.disconnect',projectId);
 const [status,setStatus]=useState<GitHubStatus>(),[url,setUrl]=useState(suggestedUrl||''),[preview,setPreview]=useState<Preview>(),[token,setToken]=useState(''),[replacing,setReplacing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 useEffect(()=>{void call<GitHubStatus>(projectId,'status').then(setStatus).catch(()=>setError(() => ($t('github.notLoadGithubStatus'))));},[projectId, setError]);
 useEffect(()=>{if(!status?.history?.running)return;const t=setInterval(()=>{void call<GitHubStatus>(projectId,'status').then(setStatus).catch(()=>undefined);},5000);return()=>clearInterval(t);},[projectId, status?.history?.running]);
 async function run(fn:()=>Promise<GitHubStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role='status' className='nr-footnote'>{$t('common.loadingLoading')}</p>;
 // Star and Fork history (from each star's and fork's date, with the token); Traffic cannot be read back further than 14 days.
 const historyLine=(h:History,total?:number)=>h?.complete?<>{$tj('github.rebuilt',{0:h.from||'—',1:h.total?.toLocaleString(getCurrentLocale()),2:total&&h.total!==null&&total-h.total>0?$t('github.fewerNowStarsRemovedDeleted',{0:(total-h.total).toLocaleString(getCurrentLocale())}):''})}</>:h?.error?<span className='text-destructive'>{$tj('github.notRebuilt',{0:$legacyText(h.error)})}</span>:status.token?$t('github.waitingRebuildStartsFewMinutes'):$t('github.rebuiltOnceTokenBelowConnected');
 const historySection=status.connected?<section className='nr-guide-step' data-history><h3><WithInfo help={$t('github.historyCoverageHelp')}>{$t('github.history')}</WithInfo></h3>
  <p className='nr-footnote'>{$tj('github.starHistory',{0:status.history?.running&&!status.history.stars?.complete?$t('github.rebuilding'):historyLine(status.history?.stars??null,status.latest?.stars)})}</p>
  <p className='nr-footnote'>{$tj('github.forkHistory',{0:status.history?.running&&status.history.stars?.complete&&!status.history.forks?.complete?$t('github.rebuilding'):historyLine(status.history?.forks??null,status.latest?.forks)})}</p>
  <NetworkSettingsLink messages={[status.history?.stars?.error,status.history?.forks?.error]}/>
  {status.token&&canBackfill?<div className='nr-step-actions'><Button size='sm' variant='outline' disabled={busy||status.history?.running} onClick={()=>{ void (async () => {if(await confirmAction({title:() => ($t('github.readTimesStarsForksAgain')),description:() => ($t('github.takesFewMinutesNotAffect')),action:'github.rebuildHistory',destructive:false}))void run(()=>call<GitHubStatus>(projectId,'backfill'));})(); }}>{status.history?.running?$t('github.rebuilding'):$t('github.rebuildHistory')}</Button></div>:null}
 </section>:null;
 const repoSection=!status.connected?canPreview?<section className='nr-guide-step'><h3>{$t('github.step1ConnectRepository')}</h3>
  <label className='nr-field'>{$t('common.repositoryLink')}<input aria-label={$t('common.repositoryLink')} value={url} disabled={busy} placeholder='https://github.com/org/repo' onChange={e=>{setUrl(e.target.value);setPreview(undefined);}}/></label>
  <div className='nr-step-actions'><Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{url}));})}>{busy&&!preview?$t('common.loadingLoading'):$t('github.readRepository')}</Button></div>
  {preview&&<div className='nr-guide-preview'><p><strong>{preview.repo}</strong> · ★ {preview.stars.toLocaleString(getCurrentLocale())} · Fork {preview.forks.toLocaleString(getCurrentLocale())}<InfoTip className='ml-1'>{$t('github.onceConnectedStarsForksReleases')}</InfoTip></p>{preview.description&&<p className='nr-footnote'>{preview.description}</p>}<div className='nr-step-actions'>{canConnect&&<Button disabled={busy} onClick={()=>void run(()=>call<GitHubStatus>(projectId,'connect',{url}))}>{$t('common.confirmConnect')}</Button>}</div></div>}
 </section>:null:<section className='nr-guide-connected'><h3><a className='nr-link' href={status.url} target='_blank' rel='noreferrer'>{status.repo}</a></h3>
  <p>{$tj('github.last7DaysForksIssues',{0:status.latest?.stars.toLocaleString(getCurrentLocale())??'—',1:status.starDelta7===null||status.starDelta7===undefined?$t('github.needs7DaysData'):(status.starDelta7>=0?'+':'')+status.starDelta7,2:status.latest?.forks.toLocaleString(getCurrentLocale())??'—',3:status.issues?.total??'—'})}</p>
  {status.releases?.[0]&&<p className='nr-footnote'>{$t('github.latestRelease')} <a className='nr-link' href={status.releases[0].url} target='_blank' rel='noreferrer'>{status.releases[0].tag}</a> · {date(status.releases[0].publishedAt)}</p>}
  {!!status.issues?.top.length&&<div><p className='nr-guide-subtitle'>{$t('github.mostDiscussedIssues')}</p>{status.issues.top.slice(0,3).map(i=><p key={i.url} className='nr-footnote'><a className='nr-link' href={i.url} target='_blank' rel='noreferrer'>{i.title}</a>  {$tj('github.comments',{0:i.comments})}</p>)}</div>}
  <p className='nr-footnote'>{$tj('github.lastSyncedSyncsAutomaticallyOnce',{0:status.lastSync?formatDateTime(status.lastSync.at):'—'})}{status.lastSync?.errors.map(e=><span key={e} className='nr-block'>{$tj('common.partlyNotUpdated',{0:$legacyText(e)})}</span>)}<NetworkSettingsLink messages={status.lastSync?.errors}/></p>
  <div className='nr-step-actions'>{canSync&&<Button size='sm' variant='outline' disabled={busy} onClick={()=>void run(()=>call<GitHubStatus>(projectId,'sync'))}>{$t('common.syncNow')}</Button>}{canDisconnect&&<Button size='sm' variant='ghost' disabled={busy} onClick={()=>{ void (async () => {if(await confirmAction({title:() => ($t('github.stopSyncingRepository')),description:() => ($t('github.archivedDataKeptTokenDeleted')),action:'common.disconnect'}))void run(()=>call<GitHubStatus>(projectId,'disconnect'));})(); }}>{$t('common.disconnect')}</Button>}</div></section>;
 const tokenForm=<><ol className='nr-guide-steps'>
   <li>{$t('github.openGithub')} <a className='nr-link' href='https://github.com/settings/personal-access-tokens/new' target='_blank' rel='noreferrer'>{$t('github.newFineGrainedTokenPage')}</a>{$t('github.needLeastWriteAccessRepository')}</li>
   <li>{$t('github.setTokenNameNocoreachExpiration')}</li>
   <li>{$t('github.repositoryAccessChoose')} <strong>Only select repositories</strong>{$tj('github.select',{0:status.repo||$t('github.repository')})}</li>
   <li>Permissions → Repository permissions → <strong>Administration</strong>  {$t('github.set')} <strong>Read-only</strong>{$t('github.metadataSetReadAutomaticallyLeave')}</li>
   <li>{$t('github.clickGenerateTokenCopyValue')}</li></ol>
  <label className='nr-field'><WithInfo help={$t('github.tokenEncryptedServerNeverShown')}>Token</WithInfo><input aria-label='GitHub token' type='password' autoComplete='off' value={token} disabled={busy} placeholder='github_pat_…' onChange={e=>setToken(e.target.value)}/></label>
  <div className='nr-step-actions'>{replacing&&<Button variant='ghost' disabled={busy} onClick={()=>{setReplacing(false);setToken('');}}>{$t('common.cancel')}</Button>}<Button disabled={busy||!token.trim()} onClick={()=>void run(async()=>{const s=await call<GitHubStatus>(projectId,'setToken',{},{'x-noreach-github-token':token.trim()});setToken('');setReplacing(false);return s;})}>{busy?$t('github.verifying'):$t('github.saveVerify')}</Button></div></>;
 const trafficSection=!status.token&&!canSetToken?null:<section className='nr-guide-step' data-focus={focus==='traffic'||undefined}><h3>{$tj('github.connectTrafficViewsClonesReferring',{0:status.connected?$t('github.step2'):''})}</h3>
  {!status.connected?<p className='nr-footnote'>{$t('github.connectRepositoryFirst')}</p>
  :status.token&&(!replacing||!canSetToken)?<div className='nr-guide-connected'>{status.token.error?<p role='alert' className='nr-error'>{$tj('github.replaceTokenValueMessage',{0:$legacyText(status.token.error)})}</p>:<p>{$tj('github.verifiedArchivingSinceViewsLast',{0:date(status.token.verifiedAt),1:date(status.token.since),2:status.views14?.toLocaleString(getCurrentLocale())??'—'})}<InfoTip className='ml-1'>{$t('github.githubKeepsLast14Days')}</InfoTip></p>}
   {!!status.topReferrers?.length&&<p className='nr-footnote'>{$tj('github.mainSources',{0:status.topReferrers.map(r=>`${r.referrer} ${r.count}`).join('、')})}</p>}
   <div className='nr-step-actions'>{canSetToken&&<Button size='sm' variant='outline' disabled={busy} onClick={()=>setReplacing(true)}>{$t('github.replaceToken')}</Button>}{canRemoveToken&&<Button size='sm' variant='ghost' disabled={busy} onClick={()=>{ void (async () => {if(await confirmAction({title:() => ($t('github.removeGithubToken')),description:() => ($t('github.trafficCannotArchivedAnymoreArchived')),action:'common.remove'}))void run(()=>call<GitHubStatus>(projectId,'removeToken'));})(); }}>{$t('github.removeToken')}</Button>}</div></div>
  :canSetToken?tokenForm:null}</section>;
 return <>{error&&<ConnectionError message={error}/>}{focus==='traffic'&&status.connected?<>{trafficSection}{repoSection}</>:<>{repoSection}{trafficSection}</>}{historySection}</>;
}
