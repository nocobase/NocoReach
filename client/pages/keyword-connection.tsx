import { formatDateTime } from '#lib/format';
import { useMessageState, $t, $tj, $legacyText } from '#i18n';
import {ConnectionError} from '#components/connection-error';
import {useEffect,useState} from 'react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {useNavigate} from 'react-router';
import {Button} from '#components/ui/button';
import {Input} from '#components/ui/input';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '#components/ui/dialog';
import {toast} from '#lib/toast';
import {Tag} from '#components/reach/tag';
import {confirmAction} from '#components/reach/confirm';
import {InfoTip,WithInfo} from '#components/reach/info-tip';
import {help} from './glossary';
import {useUnsavedWarning} from './reach-data';
import {keywordRequest,type KeywordConnectionState,type Spend} from './keyword-api';
export function KeywordConnection({projectId}:{projectId:number}){
 const {can:canConfigure}=useBusinessAccess('nrKeywords.configure',projectId);
 const {can:canCheck}=useBusinessAccess('nrKeywords.check',projectId);
 const {can:canSetBudget}=useBusinessAccess('nrKeywords.setBudget',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrKeywords.disconnect',projectId);
 const navigate=useNavigate();const [state,setState]=useState<KeywordConnectionState>(),[spend,setSpend]=useState<Spend>(),[login,setLogin]=useState(''),[password,setPassword]=useState(''),[budget,setBudget]=useState('5'),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[notice,setNotice]=useMessageState(''),[editing,setEditing]=useState(false),[budgetOpen,setBudgetOpen]=useState(false);
 useUnsavedWarning(Boolean(login||password));
 async function load(){const s=await keywordRequest<KeywordConnectionState>('status');setState(s);setBudget(String(s.monthlyBudgetUsd));void keywordRequest<Spend>('spend').then(setSpend).catch(()=>undefined);}
 useEffect(()=>{void load().catch(e=>setError(() => ($legacyText(String(e)))));},[setError]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();await load();}catch(e){setError(() => ($legacyText(String(e))));}finally{setBusy(false);}}
 return <section className='nr-panel' id='dataforseo'><div className='nr-panel-title'><h2>{$t('keyword.dataforseoKeywordsCompetitorsAiSearch')}</h2><Tag tone={state?.verifiedAt?'green':state?.configured?'amber':'grey'} dot>{state?.verifiedAt?$t('keyword.verified'):state?.configured?$t('common.notVerified'):$t('keyword.notConnected')}</Tag></div><p>{$t('keyword.usedResearchMarketSearchDemand')}</p>{error&&<ConnectionError message={error}/>}{notice&&<p role='status' className='nr-success'>{notice}</p>}
 {canConfigure&&(!state?.configured||editing)&&<div className='nr-guide-step' data-credentials><p>{$t('keyword.locationPrefix')} <a className='nr-link' href='https://app.dataforseo.com/api-access' target='_blank' rel='noreferrer'>DataForSEO API Access ↗</a>  {$t('keyword.getApiLoginApiPassword')}</p><label className='nr-field'>API Login<input aria-label='DataForSEO API Login' autoComplete='off' value={login} onChange={e=>setLogin(e.target.value)}/></label><label className='nr-field'>API Password<input aria-label='DataForSEO API Password' type='password' autoComplete='new-password' value={password} onChange={e=>setPassword(e.target.value)}/></label><label className='nr-field'><WithInfo help={$t('keyword.credentialsAndBudgetHelp')}>{$t('keyword.monthlyBudgetProjectUsd')}</WithInfo><input aria-label={$t('keyword.keywordResearchMonthlyBudget')} type='number' min='0.05' max='100' step='0.05' value={budget} onChange={e=>setBudget(e.target.value)}/></label><div className='nr-actions'><Button disabled={busy||!login.trim()||!password} onClick={()=>void run(async()=>{const bytes=new TextEncoder().encode(JSON.stringify({login,password}));await keywordRequest('configure',{monthlyBudgetUsd:Number(budget)},{'x-noreach-research-credentials':btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))});setLogin('');setPassword('');setEditing(false);setNotice(() => ($t('keyword.credentialsSavedVerifyConnectionNo')));})}>{$t('common.save')}</Button>{state?.configured&&<Button variant='ghost' disabled={busy} onClick={()=>{setEditing(false);setLogin('');setPassword('');}}>{$t('common.collapse')}</Button>}</div></div>}
 {state?.configured&&<div className='nr-actions'>{canCheck&&<Button variant={state.verifiedAt?'outline':'default'} disabled={busy} onClick={()=>void run(async()=>{await keywordRequest('check');setNotice(() => ($t('keyword.accountCredentialsVerified')));})}>{busy?$t('common.working'):$t('keyword.verifyConnection')}</Button>}{canSetBudget&&!editing&&<Button variant='outline' disabled={busy} onClick={()=>setBudgetOpen(true)}>{$t('keyword.changeBudget')}</Button>}{canConfigure&&!editing&&<Button variant='outline' disabled={busy} onClick={()=>setEditing(true)}>{$t('keyword.changeCredentialsBudget')}</Button>}<Button variant='outline' onClick={()=>void navigate('/keywords')}>{$t('keyword.openKeywords')}</Button>{canDisconnect&&<Button variant='ghost' className='text-destructive' disabled={busy} onClick={()=>void confirmAction({title:() => ($t('keyword.disconnectDataforseo')),description:() => ($t('keyword.credentialsSavedProjectDeletedSaved')),action:'common.disconnect'}).then(ok=>{if(ok)void run(async()=>{await keywordRequest('disconnect');setNotice(() => ($t('keyword.disconnectedQueryHistoryKept')));});})}>{$t('common.disconnect')}</Button>}</div>}

 {spend&&state?.configured&&<div className='nr-spend' data-spend><div><span className='inline-flex items-center gap-1'>{$t('keyword.spentMonth')}<InfoTip label={$t('keyword.whatMonthlyBudget')}>{$tj('keyword.queriesNoLongerShowCost',{0:help($t('keyword.monthlyBudget'))})}</InfoTip></span><strong>${spend.monthUsd.toFixed(2)}</strong><small>{$tj('keyword.budgetQueries',{0:spend.budgetUsd,1:spend.monthRuns})}</small></div><div><span>{$t('keyword.total')}</span><strong>${spend.totalUsd.toFixed(2)}</strong><small>{$tj('keyword.queries',{0:spend.totalRuns})}</small></div>{spend.uncertain>0&&<p className='flex items-center gap-1 text-xs text-muted-foreground' data-uncertain>{$tj('keyword.uncertainResultsMayCharged',{0:spend.uncertain})}<InfoTip label={$t('keyword.whatResultUncertainMeans')}>{help($t('common.resultUncertain'))}</InfoTip></p>}</div>}
 {canSetBudget&&budgetOpen&&state?<BudgetDialog current={state.monthlyBudgetUsd} onClose={()=>setBudgetOpen(false)} onDone={()=>{setBudgetOpen(false);void load();}}/>:null}
 {state?.verifiedAt&&<p className='nr-footnote'>{$tj('keyword.verifiedMonthlyBudgetProject',{0:formatDateTime(state.verifiedAt),1:state.monthlyBudgetUsd})}</p>}</section>;
}
// 修改预算 (2026-10-15): the monthly budget on its own, so raising it does not mean typing the API credentials again.
function BudgetDialog({current,onClose,onDone}:{current:number;onClose:()=>void;onDone:()=>void}){
 const [value,setValue]=useState(String(current)),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[tried,setTried]=useState(false);
 const n=Number(value),valid=value.trim()!==''&&Number.isFinite(n)&&n>=0.05&&n<=100;
 async function save(){setTried(true);if(!valid){setError(() => ($t('keyword.budgetRange')));return;}setBusy(true);setError('');try{await keywordRequest('setBudget',{monthlyBudgetUsd:n});toast.success(() => ($t('keyword.budgetChanged',{0:n})));onDone();}catch(e){setError(() => ($legacyText(e instanceof Error?e.message:String(e))));}finally{setBusy(false);}}
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className='sm:max-w-md'><DialogHeader><DialogTitle>{$t('keyword.changeBudgetTitle')}</DialogTitle><DialogDescription>{$t('keyword.changeBudgetHelp')}</DialogDescription></DialogHeader>
  <form className='flex flex-col gap-2' onSubmit={e=>{e.preventDefault();void save();}}><label className='text-sm font-medium' htmlFor='dataforseo-budget'>{$t('keyword.monthlyBudgetProjectUsd')}</label><Input id='dataforseo-budget' type='number' min='0.05' max='100' step='0.05' value={value} aria-invalid={tried&&!valid||undefined} onChange={e=>{setValue(e.target.value);if(tried)setError('');}}/>{error?<p role='alert' className='text-sm text-destructive'>{error}</p>:null}
   <DialogFooter><Button type='button' variant='outline' disabled={busy} onClick={onClose}>{$t('common.cancel')}</Button><Button type='submit' disabled={busy}>{busy?$t('common.saving'):$t('common.save')}</Button></DialogFooter></form></DialogContent></Dialog>;
}
