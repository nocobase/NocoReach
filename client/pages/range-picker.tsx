import { $t } from "#i18n";
import {useSearchParams} from 'react-router';
// Shared time range for data pages (like GA): kept in the URL so it survives reloads and page switches.
export const getRanges = (): [string,string][] => ([['7',$t("近 7 天")],['28',$t("近 28 天")],['90',$t("近 90 天")],['3m',$t("近 3 个月")],['6m',$t("近半年")],['12m',$t("近 12 个月")],['16m',$t("近 16 个月")],['custom',$t("自定义")]]);
// Shown when a page does not pass its own options.
export const defaultRanges=['7','28','90','3m','12m','custom'];
export type Range={range:string;from?:string;to?:string};
export function useRange():[Range,(r:Range)=>void]{
 const [params,setParams]=useSearchParams();const range=getRanges().some(([k])=>k===params.get('days'))?params.get('days')!:'28';
 const value:Range={range,...(range==='custom'?{from:params.get('from')||undefined,to:params.get('to')||undefined}:{})};
 const set=(r:Range)=>{const p=new URLSearchParams(params);p.set('days',r.range);if(r.range==='custom'&&r.from&&r.to){p.set('from',r.from);p.set('to',r.to);}else{p.delete('from');p.delete('to');}setParams(p,{replace:true});};
 return [value,set];
}
export function RangePicker({value,onChange,summary,options}:{value:Range;onChange:(r:Range)=>void;summary?:string;options?:string[]}){
 const today=new Date().toISOString().slice(0,10);
 return <div className="nr-range" role="group" aria-label={$t("时间范围")}>{getRanges().filter(([k])=>(options||defaultRanges).includes(k)).map(([k,label])=><button key={k} type="button" aria-pressed={value.range===k} onClick={()=>onChange(k==='custom'?{range:'custom',from:value.from||new Date(Date.now()-27*86400000).toISOString().slice(0,10),to:value.to||today}:{range:k})}>{label}</button>)}
  {value.range==='custom'&&<span className="nr-range-custom"><input type="date" aria-label={$t("开始日期")} max={value.to||today} value={value.from||''} onChange={e=>onChange({...value,from:e.target.value})}/>–<input type="date" aria-label={$t("结束日期")} max={today} value={value.to||''} onChange={e=>onChange({...value,to:e.target.value})}/></span>}
  {summary&&<span className="nr-range-summary">{summary}</span>}</div>;
}
