import { $t } from "#i18n";
import type {Tone} from '#components/reach/tag';
import {closedLabel,type BoardState,type Work} from './task-execution-types';
import {effectItems,effectPages,latestEffect,type EffectResult} from './effect-model';
// The task list (SPEC §5 任务, as NocoProject's issue list): status, the current step, owner, executor and update time.
export const stateTone:Record<BoardState,Tone>={todo:'grey',doing:'blue',review:'violet',done:'green'};
export type Step={text:string;tone?:Tone};
const effectTone:Record<EffectResult['conclusion'],Tone>={up:'green',down:'red',flat:'grey',insufficient:'grey'};
// The effect in a few characters: "第 7 天：点击 ↑ 26%".
export function effectChip(r:EffectResult):Step{
 if(r.conclusion==='insufficient'||!r.primary||r.change===null)return {text:$t("第 {0} 天：数据不足",{0:r.day}),tone:'grey'};
 if(r.conclusion==='flat')return {text:$t("第 {0} 天：无明显变化",{0:r.day}),tone:'grey'};
 return {text:$t("第 {0} 天：{1} {2} {3}%",{0:r.day,1:r.primary==='clicks'?$t("点击"):$t("浏览"),2:r.change>=0?'↑':'↓',3:Math.round(Math.abs(r.change)*100)}),tone:effectTone[r.conclusion]};
}
// "当前一步": what waits for you (amber), who is working (plain), or what the change did after going live.
export function stepOf(w?:Work):Step|null{
 if(!w)return null;
 const closed=closedLabel(w);if(closed)return {text:closed,tone:'slate'};
 const st=w.flow?.stages[w.stageIndex||0];
 if(w.observeFrom&&(w.stage==='done'||st?.kind==='observe')){
  const r=latestEffect(w);if(r)return effectChip(r);
  if(!effectPages(w).length)return {text:$t("观察中 · 没有关联页面")};
  const next=effectItems(w).find(i=>!i.result);return {text:next?$t("观察中 · 约 {0} 出结果",{0:next.expected}):$t("观察中")};
 }
 if(!w.flow||w.stage==='done'||!st)return null;
 if(st.kind==='agent'||st.kind==='ai'){const who=st.kind==='agent'?'Agent':'AI',run=w.latestRun?.status;
  if(run==='failed')return {text:$t("{0} 执行失败",{0:who}),tone:'red'};
  if(run==='queued')return {text:$t("等{0} 接手",{0:st.kind==='agent'?$t("Agent"):$t("在线 AI")})};
  return {text:$t("{0} 正在{1}",{0:who,1:st.name})};}
 if(st.kind==='review')return {text:st.name,tone:'amber'};
 if(st.kind==='publish')return {text:$t("确认发布"),tone:'amber'};
 if(st.kind==='release'){const s=w.release?.state;return s==='merge_failed'?{text:$t("合并失败"),tone:'red'}:s==='not_seen'?{text:$t("确认是否上线"),tone:'amber'}:{text:s==='verifying'?$t("正在确认上线"):$t("正在合并")};}
 return null;
}
// Who does the work: the Agent; tasks started with online AI steps before every task went to the Agent say so.
export function executorOf(w?:Work):'agent'|'ai'|null{
 if(!w?.flow)return null;
 return w.flow.stages.some(s=>s.kind==='agent')||!w.flow.stages.some(s=>s.kind==='ai')?'agent':'ai';
}
export const getExecutorNames = () => ({agent:$t("Agent"),ai:$t("在线 AI")} as const);
// Avatar letters as in NocoProject: "Super Admin" → SA, "zeke" → ZE, 中文名取第一个字.
export function initials(name?:string){const p=String(name||'').trim().split(/\s+/).filter(Boolean);if(!p.length)return '';return (p.length>1?p[0][0]+p[1][0]:/^[\x20-\x7e]/.test(p[0])?p[0].slice(0,2):p[0].slice(0,1)).toUpperCase();}
// Update time: minutes and hours while fresh, then 昨天, then the date.
export function ago(iso?:string,now=Date.now()){
 if(!iso)return '';const t=Date.parse(iso);if(!Number.isFinite(t))return '';const m=Math.max(0,Math.round((now-t)/60000));
 if(m<1)return $t("刚刚");if(m<60)return $t("{0} 分钟前",{0:m});if(m<24*60)return $t("{0} 小时前",{0:Math.round(m/60)});if(m<48*60)return $t("昨天");
 const d=new Date(t);return `${d.getMonth()+1}/${d.getDate()}`;
}
