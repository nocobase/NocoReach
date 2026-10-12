import { translateSourceError, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
// 下载量 (SPEC §11 使用量): npm, PyPI and Docker Hub packages from public data; read first, then confirm.
export type PackagesStatus={connected:boolean;syncing?:boolean;lastSync?:{at:string;ok:boolean;errors:string[]}|null;packages:{id:string;registry:string;registryName:string;name:string;title:string;description:string;url:string;downloads28:number|null;pulls:number|null;since:string|null}[]};
type Preview={id:string;registry:string;name:string;title:string;description:string;version:string|null;url:string;recent7:number|null;pulls?:number|null};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrPackages',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
const registries:[string,string][]=[['npm','npm'],['pypi','PyPI'],['docker','Docker Hub']];
const n=(v:number|null|undefined)=>v==null?'—':v.toLocaleString(getCurrentLocale());
export function PackagesConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const [status,setStatus]=useState<PackagesStatus>(),[registry,setRegistry]=useState('npm'),[name,setName]=useState(''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<PackagesStatus>(projectId,'status').then(setStatus);
 useEffect(()=>{void load().catch(()=>setError(() => ($t('packages.notLoadDownloadStatus'))));},[projectId]);
 // The first read runs in the background; poll until it has finished.
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<PackagesStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {status.connected&&<div className="nr-guide-connected">
   {status.packages.map(p=><div key={p.id} className="nr-package-row" data-package={p.id}><div><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title||p.name}</a><span className="nr-footnote"> · {p.registryName}</span>
    <p className="nr-footnote">{p.registry==='docker'?$t('packages.totalPullsRecordedDailyDifference',{0:n(p.pulls)}):p.downloads28!=null?$t('packages.downloadsLast28Days',{0:n(p.downloads28)}):$t('packages.readingDownloads')}{p.since?$t('packages.since',{0:p.since}):''}</p></div>
    <Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('packages.stopRecordingDownloads',{0:p.title||p.name})),description:() => ($t('packages.recordedDataDeletedToo')),action:'common.remove'}))void run(()=>call<PackagesStatus>(projectId,'remove',{id:p.id}));}}>{$t('common.remove')}</Button></div>)}
   {status.lastSync?<p className="nr-footnote">{$tj('common.lastSyncedSyncsAutomaticallyEvery',{0:new Date(status.lastSync.at).toLocaleString(getCurrentLocale())})}{status.lastSync.errors.map(e=><span key={e} className="nr-block">{$tj('common.partlyNotUpdated',{0:translateSourceError(e)})}</span>)}</p>:<p role="status" className="nr-footnote">{$t('packages.readingDownloadsFirstTime')}</p>}
   <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<PackagesStatus>(projectId,'sync'))}>{busy?$t('common.syncing'):$t('common.syncNow')}</Button></div>
  </div>}
  <h3 className="nr-guide-subtitle">{status.connected?$t('packages.addAnotherPackage'):$t('packages.connectPackage')}</h3>
  <div className="nr-package-form">
   <label className="nr-field">{$t('common.platform')}<select aria-label={$t('common.platform')} value={registry} disabled={busy} onChange={e=>{setRegistry(e.target.value);setPreview(undefined);}}>{registries.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="nr-field">{$t('packages.packageNamePageUrl')}<input aria-label={$t('packages.packageNamePageUrl')} value={name} disabled={busy} placeholder={registry==='docker'?$t('packages.nocobaseNocobase'):registry==='pypi'?$t('packages.requests'):$t('packages.nocobaseClient')} onChange={e=>{setName(e.target.value);setPreview(undefined);}}/></label>
  </div>
  <div className="nr-step-actions"><Button disabled={busy||!name.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{registry,name}));})}>{busy&&!preview?$t('common.loadingLoading'):$t('common.read')}</Button></div>
  {preview&&<div className="nr-guide-preview"><p><strong>{preview.title}</strong> · {registries.find(([k])=>k===preview.registry)?.[1]}{preview.version?$t('packages.latest',{0:preview.version}):''}</p>{preview.description&&<p className="nr-footnote">{preview.description}</p>}
   <p className="nr-footnote">{preview.registry==='docker'?$t('packages.totalPullsDockerHubGives',{0:n(preview.pulls)}):preview.recent7!=null?$t('packages.downloadsLast7Days',{0:n(preview.recent7)}):$t('packages.noDownloadsReadYetTries')}{preview.registry==='pypi'?$t('packages.pypiProvidesDownloadsLast180'):''}</p>
   <div className="nr-step-actions"><Button disabled={busy} onClick={()=>void run(async()=>{const s=await call<PackagesStatus>(projectId,'add',{registry:preview.registry,name:preview.name});setPreview(undefined);setName('');return s;})}>{$t('common.confirmConnect')}</Button></div></div>}</>;
}
