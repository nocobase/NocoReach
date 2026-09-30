export type Step={id?:string;title:string;owner:string;instruction:string;acceptance:string};
export type Plan={deliverable:string;verification:string;steps:Step[]};
export function parseTaskReply(text:string):{workPlan?:Plan;taskResult?:{content:string}}|null{
 const result=[...text.matchAll(/```task-result\s*\n([\s\S]*?)```/g)].at(-1);if(result?.[1].trim())return {taskResult:{content:result[1].trim()}};
 const blocks=[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m=>m[1]);
 const raw=text.trim();if(raw.startsWith('{')){let depth=0,quoted=false,escaped=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){blocks.push(raw.slice(0,i+1));break;}}}
 for(const b of blocks.reverse())try{const v=JSON.parse(b);if(v.workPlan&&typeof v.workPlan.deliverable==='string'&&typeof v.workPlan.verification==='string'&&Array.isArray(v.workPlan.steps)&&v.workPlan.steps.length>0&&v.workPlan.steps.length<=6&&v.workPlan.steps.every((s:Record<string,unknown>)=>['title','owner','instruction','acceptance'].every(k=>typeof s[k]==='string')))return v;if(typeof v.taskResult?.content==='string')return v;}catch{/* Incomplete model output never becomes approved content. */}return null;
}
