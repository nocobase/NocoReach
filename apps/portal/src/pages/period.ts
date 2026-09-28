export const periods=[['7','7 天'],['28','28 天'],['3m','3 个月'],['6m','半年'],['12m','12 个月'],['16m','16 个月']];
export function windowFor(end:string,key:string){
 const day=86400000, finish=new Date(end+'T00:00:00Z');
 let start=new Date(+finish+day);
 if(key.endsWith('m')){const d=start.getUTCDate();start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-parseInt(key));const last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();start.setUTCDate(Math.min(d,last));}
 else start=new Date(+finish-(Number(key)-1)*day);
 const days=Math.round((+finish-+start)/day)+1;
 return {start:start.toISOString().slice(0,10),end,days,previousStart:new Date(+start-days*day).toISOString().slice(0,10),previousEnd:new Date(+start-day).toISOString().slice(0,10)};
}
export function covered(rows:{date:string}[],start:string,end:string){return new Set(rows.filter(r=>r.date>=start&&r.date<=end).map(r=>r.date)).size===Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;}
