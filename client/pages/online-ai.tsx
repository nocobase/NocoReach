import { $t } from "@/i18n";
import {useEffect,useState,type ReactElement} from 'react';
import {useHref} from 'react-router';
import {ExternalLinkIcon} from 'lucide-react';
import {AgentCard} from '@/components/reach/agent-card';
import {nocobaseClient as api} from "@/lib/nocoreach-api";
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
// 在线 AI on the Agent page (SPEC §10): which model the online AI uses, how today's daily analysis went, and one dialog to
// choose it. On NocoBase 3 the model services and their keys are set up in config.yml (ai.llmServices); the dialog
// offers the models enabled there, so no key is typed here.
export type OnlineChoice={llmService:string;title:string;providerTitle:string;models:{value:string;title:string}[]};
export type OnlineStatus={connected:boolean;model:string|null;error:string;service:{name:string;title:string;provider:string;providerTitle:string;enabled:boolean}|null;analysis:{today:{at:string;ok:boolean;trigger:string;error:string}|null;last:{at:string;ok:boolean;trigger:string}|null}|null;choices:OnlineChoice[]};
export const onlineRequest=<T,>(action:string,projectId:number,body:object={})=>api.action<T>('nrOnlineAI',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});
// Month/day and time, written out so it never reads as day/month: 10/2 09:00.
const time=(iso:string)=>{const d=new Date(iso),p=(n:number)=>String(n).padStart(2,'0');return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;};
// NocoBase's own page for model services, for settings this page does not cover.
// NocoBase 3’s new settings pages (the old /admin/settings/… opens the previous interface). A plain link opened in a new
// tab, so it goes through useHref for the app's base path (/main).
export const ADVANCED_URL='/settings/ai/llm-services';
export function OnlineAICard({status,busy,onConnect,onCheck,readOnly=false}:{status:OnlineStatus;busy:boolean;onConnect:()=>void;onCheck:()=>void;readOnly?:boolean}):ReactElement{
 const s=status.service,today=status.analysis?.today,last=status.analysis?.last,advanced=useHref(ADVANCED_URL);
 return <AgentCard aria-label={$t("在线 AI")} name={$t("在线 AI")}
  status={status.connected?<Tag tone="green" dot>{$t("可用")}</Tag>:s?<Tag tone="amber" dot>{$t("不可用")}</Tag>:<Tag tone="grey" dot>{$t("未接入")}</Tag>}
  detail={s&&status.model?`${s.providerTitle} · ${status.model}`:$t(status.error)||$t("接入后才能做每日分析")}
  facts={status.analysis?[
   {label:$t("今天的每日分析"),value:!today?$t("还没运行"):today.ok?$t("{0} 完成",{0:time(today.at)}):<Tag tone="amber" title={$t(today.error)}>{$t("{0} 没有完成",{0:time(today.at)})}</Tag>},
   {label:$t("最近一次"),value:!last?'—':last.ok?`${time(last.at)} ${$t("成功")}`:<Tag tone="amber">{`${time(last.at)} ${$t("失败")}`}</Tag>},
  ]:[]}
  actions={readOnly?[]:[
   ...(s?[<Button key="check" size="sm" variant="outline" disabled={busy} onClick={onCheck}>{$t("测试连接")}</Button>,<Button key="model" size="sm" variant="outline" disabled={busy} onClick={onConnect}>{$t("更换模型")}</Button>]:[<Button key="connect" size="sm" disabled={busy} onClick={onConnect}>{$t("接入在线 AI")}</Button>]),
   <Button key="advanced" size="sm" variant="ghost" render={<a href={advanced} target="_blank" rel="noreferrer"/>}>{$t("高级设置")}<ExternalLinkIcon/></Button>,
  ]}/>;
}
// One dialog: a model enabled in NocoBase's model services → 测试并保存. With none enabled yet it says where they are set up.
const choiceKey=(llmService:string,model:string)=>JSON.stringify([llmService,model]);
export function ConnectOnlineAI({open,projectId,status,onClose,onSaved}:{open:boolean;projectId:number;status:OnlineStatus;onClose:()=>void;onSaved:(s:OnlineStatus)=>void}):ReactElement{
 const current=status.service&&status.model?choiceKey(status.service.name,status.model):'';
 const first=status.choices[0]?choiceKey(status.choices[0].llmService,status.choices[0].models[0]?.value||''):'';
 const [value,setValue]=useState(current||first),[busy,setBusy]=useState(false),[error,setError]=useState(''),advanced=useHref(ADVANCED_URL);
 useEffect(()=>{if(open){setValue(current||first);setError('');}},[open]);
 async function save(){if(!value){setError($t("请选择模型"));return;}const [llmService,model]=JSON.parse(value) as [string,string];setBusy(true);setError('');
  try{onSaved(await onlineRequest<OnlineStatus>('save',projectId,{llmService,model}));}catch(e){setError(e instanceof Error?e.message:$t("没有保存，请重试"));}finally{setBusy(false);}}
 const none=!status.choices.length;
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="sm:max-w-md">
  <DialogHeader><DialogTitle>{$t("接入在线 AI")}</DialogTitle><DialogDescription>{$t("每日分析和起草新做法会用这里选的模型。先测试，能用才保存。")}</DialogDescription></DialogHeader>
  <div className="flex flex-col gap-4">
   {none?<p role="status" className="nr-footnote">{$t("还没有可用的模型。模型服务和 API Key 由管理员在服务器的 config.yml 里配置（ai.llmServices），重启后到")}<a className="nr-link" href={advanced} target="_blank" rel="noreferrer">{$t("高级设置")}</a>{$t("里启用模型，再回来选择。")}</p>
   :<label className="nr-field">{$t("模型")}<select value={value} onChange={e=>setValue(e.target.value)}>{status.choices.map(c=><optgroup key={c.llmService} label={`${c.title} · ${c.providerTitle}`}>{c.models.map(m=><option key={m.value} value={choiceKey(c.llmService,m.value)}>{m.title}</option>)}</optgroup>)}</select></label>}
   {!none&&<p className="nr-footnote">{$t("这里列出已启用的模型。要加模型服务或换 API Key，请管理员改服务器的 config.yml；要启用更多模型，请到")}<a className="nr-link" href={advanced} target="_blank" rel="noreferrer">{$t("高级设置")}</a>。</p>}
   {error&&<p role="alert" className="nr-error">{error}</p>}
  </div>
  <DialogFooter><Button variant="ghost" disabled={busy} onClick={onClose}>{$t("取消")}</Button>{!none&&<Button disabled={busy} onClick={()=>void save()}>{busy?$t("正在测试…"):$t("测试并保存")}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}
