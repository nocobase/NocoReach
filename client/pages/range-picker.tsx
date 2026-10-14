import { $t } from "#i18n";
import {useSearchParams} from 'react-router';
// Shared time range for data pages (like GA): kept in the URL so it survives reloads and page switches.
export const getRanges = (): [string,string][] => ([['7',$t('common.last7Days')],['28',$t('common.last28Days')],['90',$t('rangePicker.last90Days')],['3m',$t('rangePicker.last3Months')],['6m',$t('rangePicker.last6Months')],['12m',$t('rangePicker.last12Months')],['16m',$t('rangePicker.last16Months')],['all',$t('rangePicker.allTime')],['custom',$t('rangePicker.custom')]]);
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
 return <div className="nr-range" role="group" aria-label={$t('rangePicker.dateRange')}>{getRanges().filter(([k])=>(options||defaultRanges).includes(k)).map(([k,label])=><button key={k} type="button" aria-pressed={value.range===k} onClick={()=>onChange(k==='custom'?{range:'custom',from:value.from||new Date(Date.now()-27*86400000).toISOString().slice(0,10),to:value.to||today}:{range:k})}>{label}</button>)}
  {value.range==='custom'&&<span className="nr-range-custom"><input type="date" aria-label={$t('rangePicker.startDate')} max={value.to||today} value={value.from||''} onChange={e=>onChange({...value,from:e.target.value})}/>–<input type="date" aria-label={$t('rangePicker.endDate')} max={today} value={value.to||''} onChange={e=>onChange({...value,to:e.target.value})}/></span>}
  {summary&&<span className="nr-range-summary">{summary}</span>}</div>;
}
