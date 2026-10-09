import { $t, $tj } from "@/i18n";
import { Button } from '@/components/reach-ui/button';
import { Badge } from '@/components/reach-ui/badge';
import { Bot, UserRound } from 'lucide-react';
import type { TaskData } from './task-execution-types';
import { runLabels, workColumns, workState } from './task-execution-types';
import {Reveal} from '@/components/reach/reveal';
export function TaskProperties({data,disabled,onOwn}:{data:TaskData;disabled:boolean;onOwn:()=>void}){
 const w=data.work,s=w.plan?.steps[w.step];
 return <div className="p-5 space-y-6 text-sm">
  <section className="space-y-3"><h2 className="font-semibold">{$t("任务属性")}</h2><Badge variant="outline">{workColumns[workState(w)]}</Badge><div><p className="text-muted-foreground mb-1">{$t("负责人")}</p><p className="flex gap-2 items-center"><UserRound size={16}/>{w.humanOwnerName||$t("未指定")}</p><Button className="mt-2" variant="outline" size="sm" disabled={disabled} onClick={onOwn}>{$t("由我负责")}</Button></div>
  <div><p className="text-muted-foreground mb-1">{$t("当前执行者")}</p><p className="flex gap-2 items-center">{s?.owner==='ai'?<Bot size={16}/>:<UserRound size={16}/>}{{ai:$t("在线 AI · Atlas"),human:$t("人工处理"),local:$t("本地 Agent · 待接入")}[s?.owner||'']||$t("尚未确认")}</p></div><p className="text-muted-foreground">{$tj("方案版本 {0}",{0:w.planVersion||'—'})}</p></section>
  <section className="space-y-3"><h2 className="font-semibold">{$t("执行记录")}</h2>{!data.runs.length&&<p className="text-muted-foreground">{$t("尚无在线执行记录")}</p>}{[...data.runs].reverse().map(r=><div key={r.id} className="rounded-md border p-3"><p className="font-medium">{runLabels[r.status]||r.status} · {r.model?.model||'Atlas'}</p><div className="space-y-2 mt-3 text-xs break-words"><p>{new Date(r.createdAt).toLocaleString()}</p><p>{$tj("方案 v{0}",{0:r.planVersion})}</p><p>{$tj("运行编号 {0}",{0:r.id})}</p>{r.error&&<p>{r.error==='candidate_only_context_changed'?$t("任务已有修改，本次结果保留为候选，未覆盖当前成果。"):r.error==='context_changed'?$t("执行前任务已改变，未调用模型。"):$t("本次未获得可用结果或结果未知。已有稿件保留；核对后可人工重新发起。")}</p>}{r.usage?<p>{$tj("输入 {0} / 输出 {1} tokens",{0:r.usage.inputTokens??$t("未知"),1:r.usage.outputTokens??$t("未知")})}</p>:<p>{$t("未返回用量")}</p>}</div></div>)}</section>
 </div>;
}
const actions:Record<string,string>={moveWork:$t("调整工作位置"),startSimple:$t("确认本次工作范围"),linkContent:$t("关联内容页面"),takeOwnership:$t("指定真人负责人"),savePlan:$t("保存方案版本"),approvePlan:$t("确认方案"),saveResult:$t("保存人工成果版本"),approveResult:$t("审核通过"),requestChanges:$t("打回修改"),startRun:$t("提交在线执行"),runStarted:$t("开始执行"),runSucceeded:$t("生成候选成果"),runFailed:$t("执行未完成"),recordExecution:$t("记录实际执行"),verify:$t("记录验证"),replan:$t("调整方案")};
export function TaskTimeline({data}:{data:TaskData}){return <section className="space-y-4"><h2 className="font-semibold">{$t("活动时间线")}</h2><ol className="space-y-3">{[...data.work.history].reverse().map((h,i)=><li key={i} className="border-l-2 pl-4 text-sm"><p>{actions[h.action]||h.action}</p><p className="text-xs text-muted-foreground">{h.at?new Date(h.at).toLocaleString():$t("历史记录")} · {h.actor==='system'?$t("系统"):h.actor||$t("历史用户")}</p>{h.comment&&<p className="mt-1 whitespace-pre-wrap">{h.comment}</p>}{h.previous!==undefined&&<Reveal label={$t("此前保存的内容")}><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(h.previous,null,2)}</pre></Reveal>}</li>)}</ol></section>;}
