import {useEffect,useState,type ReactElement} from 'react';
import {ExternalLinkIcon,SparklesIcon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
// 在线 AI on the Agent page (SPEC §10): which model the online AI uses, how today's daily analysis went, and one dialog to
// connect or change it. The key is typed here, sent once to the server and never shown again.
export type OnlineStatus={connected:boolean;model:string|null;error:string;service:{title:string;provider:string;providerTitle:string;managed:boolean;enabled:boolean}|null;analysis:{today:{at:string;ok:boolean;trigger:string;error:string}|null;last:{at:string;ok:boolean;trigger:string}|null}|null;providers:{value:string;title:string}[]};
export const onlineRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrOnlineAI',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// Month/day and time, written out so it never reads as day/month: 10/2 09:00.
const time=(iso:string)=>{const d=new Date(iso),p=(n:number)=>String(n).padStart(2,'0');return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;};
// NocoBase's own page for model services, for settings this page does not cover.
export const ADVANCED_URL='/admin/settings/ai/llm-services';
export function OnlineAICard({status,busy,onConnect,onCheck}:{status:OnlineStatus;busy:boolean;onConnect:()=>void;onCheck:()=>void}):ReactElement{
 const s=status.service,today=status.analysis?.today;
 return <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground" aria-label="在线 AI">
  <div className="flex items-center gap-3"><span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-nr-tint-violet text-nr-ink-violet"><SparklesIcon className="size-4"/></span>
   <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 text-sm font-medium">在线 AI{status.connected?<Tag tone="green" dot>可用</Tag>:s?<Tag tone="amber" dot>不可用</Tag>:<Tag tone="grey" dot>未接入</Tag>}</p>
    <p className="truncate text-xs text-muted-foreground">{s&&status.model?`${s.providerTitle} · ${status.model}${s.managed?'':' · 在 NocoBase 后台配置'}`:status.error||'接入后才能做每日分析和方案类任务'}</p></div></div>
  {status.analysis&&<div className="flex flex-wrap gap-x-8 gap-y-2 border-t pt-3 text-sm">
   <div><p className="text-xs text-muted-foreground">今天的每日分析</p>{today?today.ok?<Tag tone="green">{time(today.at)} 完成</Tag>:<Tag tone="amber" title={today.error}>{time(today.at)} 没有完成</Tag>:<Tag tone="grey">还没运行</Tag>}</div>
   <div><p className="text-xs text-muted-foreground">最近一次</p><p>{status.analysis.last?`${time(status.analysis.last.at)} ${status.analysis.last.ok?'成功':'失败'}`:'—'}</p></div>
  </div>}
  <div className="flex flex-wrap items-center gap-2">
   {s?<><Button size="sm" variant="outline" disabled={busy} onClick={onCheck}>测试连接</Button><Button size="sm" variant="outline" disabled={busy} onClick={onConnect}>更换模型</Button></>:<Button size="sm" disabled={busy} onClick={onConnect}>接入在线 AI</Button>}
   <Button size="sm" variant="ghost" render={<a href={ADVANCED_URL} target="_blank" rel="noreferrer"/>}>高级设置<ExternalLinkIcon/></Button>
  </div>
 </section>;
}
// One dialog: provider, API key, model → 测试并保存. A saved key of the same provider can be kept by leaving the field empty.
export function ConnectOnlineAI({open,projectId,status,onClose,onSaved}:{open:boolean;projectId:number;status:OnlineStatus;onClose:()=>void;onSaved:(s:OnlineStatus)=>void}):ReactElement{
 const current=status.service?.managed?status.service.provider:'';
 const [provider,setProvider]=useState(current||status.providers[0]?.value||''),[key,setKey]=useState(''),[model,setModel]=useState(status.service?.managed?status.model||'':''),[models,setModels]=useState<{value:string;title:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const keepKey=provider===current&&Boolean(current);
 useEffect(()=>{if(open){setProvider(current||status.providers[0]?.value||'');setKey('');setModel(status.service?.managed?status.model||'':'');setModels([]);setError('');}},[open]);
 async function loadModels(){if(!provider||(!key.trim()&&!keepKey))return;setLoading(true);setError('');try{setModels(await onlineRequest<{value:string;title:string}[]>('models',projectId,{provider,apiKey:key}));}catch(e){setModels([]);setError(e instanceof Error?e.message:'没有取到模型列表');}finally{setLoading(false);}}
 useEffect(()=>{if(open&&keepKey)void loadModels();},[open,provider]);
 async function save(){if(!provider||!model.trim()){setError('请选择服务商和模型');return;}if(!key.trim()&&!keepKey){setError('请填写 API Key');return;}setBusy(true);setError('');
  try{onSaved(await onlineRequest<OnlineStatus>('save',projectId,{provider,apiKey:key,model:model.trim()}));setKey('');}catch(e){setError(e instanceof Error?e.message:'没有保存，请重试');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-md">
  <DialogHeader><DialogTitle>接入在线 AI</DialogTitle><DialogDescription>每日分析和方案类任务会用这里选的模型。先测试，能用才保存。</DialogDescription></DialogHeader>
  <div className="flex flex-col gap-4">
   <label className="nr-field">服务商<select value={provider} onChange={e=>{setProvider(e.target.value);setModels([]);setModel('');}}>{status.providers.map(p=><option key={p.value} value={p.value}>{p.title}</option>)}</select></label>
   <label className="nr-field">API Key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} onBlur={()=>void loadModels()} placeholder={keepKey?'留空则沿用已保存的 Key':'粘贴服务商提供的 API Key'}/></label>
   <label className="nr-field">模型<input list="nr-online-models" value={model} onChange={e=>setModel(e.target.value)} placeholder={loading?'正在读取模型…':models.length?'选择或输入模型名称':'填好 Key 后会列出可用模型，也可以直接输入'}/><datalist id="nr-online-models">{models.map(m=><option key={m.value} value={m.value}>{m.title}</option>)}</datalist></label>
   <p className="nr-footnote">Key 只保存在服务端，保存后不再显示。需要配置多个模型服务等更细的设置，请到<a className="nr-link" href={ADVANCED_URL} target="_blank" rel="noreferrer">高级设置</a>。</p>
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>取消</Button><Button disabled={busy} onClick={()=>void save()}>{busy?'正在测试…':'测试并保存'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
