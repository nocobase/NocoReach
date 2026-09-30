export type Step={id?:string;title:string;owner:string;instruction:string;acceptance:string};
export type Plan={deliverable:string;verification:string;steps:Step[]};
export function parseTaskReply(text:string):{workPlan?:Plan;taskResult?:{content:string}}|null{
 const result=[...text.matchAll(/```task-result\s*\n([\s\S]*?)```/g)].at(-1);if(result?.[1].trim())return {taskResult:{content:result[1].trim()}};
 const blocks=[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m=>m[1]);
 const raw=text.trim();if(raw.startsWith('{')){let depth=0,quoted=false,escaped=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){blocks.push(raw.slice(0,i+1));break;}}}
 for(const b of blocks.reverse())try{const v=JSON.parse(b);if(v.workPlan&&typeof v.workPlan.deliverable==='string'&&typeof v.workPlan.verification==='string'&&Array.isArray(v.workPlan.steps)&&v.workPlan.steps.length>0&&v.workPlan.steps.length<=6&&v.workPlan.steps.every((s:Record<string,unknown>)=>['title','owner','instruction','acceptance'].every(k=>typeof s[k]==='string')))return v;if(typeof v.taskResult?.content==='string')return v;}catch{/* Incomplete model output never becomes approved content. */}return null;
}
export type StepKey='scope'|'change'|'review'|'publish'|'observe';
export function stepsFor(kind?:string):[StepKey,string][]{return kind==='research'?[['scope','确认范围'],['change','调研'],['review','审核'],['publish','完成']]:[['scope','确认范围'],['change','修改'],['review','审核'],['publish','发布'],['observe','观察']];}
// One current step per work item: the page shows only this step's content and primary action.
export function currentStep(w:{stage:string;step:number;kind?:string;results:({rejectedAt?:string}|null)[]},runActive:boolean,done:boolean):{key:StepKey;complete:boolean}{
 if(w.stage==='plan')return {key:'scope',complete:false};
 if(w.stage==='work'){const a=w.results[w.step];return {key:runActive||!a||a.rejectedAt?'change':'review',complete:false};}
 if(w.kind==='research')return {key:'publish',complete:done};
 if(w.stage==='execution')return {key:'publish',complete:false};
 return {key:'observe',complete:w.stage==='done'};
}
// Work converted from a suggestion stores "建议：…" first; use that line as the editable scope draft.
export function scopeDraft(brief:string,title:string):string{const first=(brief||'').split(/\n\s*\n/)[0]?.trim()||'';const m=first.match(/^建议[:：]\s*([\s\S]+)$/);return (m?m[1]:brief||title).trim().slice(0,5000);}
