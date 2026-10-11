import { getCurrentLocale, $t } from "#i18n";
// Parts shared by the data pages: a metric with its change against the previous period, as a tile or a small change line.
import {StatTile} from '#components/seo/stat-tile';
import {help} from './glossary';
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null;format?:'percent'|'decimal';lowerIsBetter?:boolean;unit?:string};
export const fmt=(v:number|null)=>v===null?'—':Math.abs(v)>=100000?`${(v/1000).toFixed(0)}K`:v.toLocaleString(getCurrentLocale());
export function Change({m}:{m:Metric}){if(m.change===null)return m.complete||m.value===null?null:<small className="nr-muted">{$t("数据不完整")}</small>;const up=m.change>=0;return <small className={up?'nr-up':'nr-down'}>{up?'+':''}{(m.change*100).toFixed(0)}%</small>;}
export function MetricTile({m}:{m:Metric}){
 const value=m.value===null?'—':m.format==='percent'?`${(m.value*100).toFixed(1)}%`:m.format==='decimal'?m.value.toFixed(1):`${fmt(m.value)}${m.unit||''}`;
 // Position falls as it improves: show the difference in places, like 搜索表现.
 const delta=m.lowerIsBetter?(m.change!==null&&m.previous!==null&&m.value!==null?{change:m.previous-m.value,better:m.previous>=m.value,points:true}:null):m.change!==null?{change:m.change,better:m.change>=0}:null;
 return <StatTile label={m.label} value={value} delta={delta} help={help(m.label)} hint={m.change===null&&!m.complete&&m.value!==null?$t("数据不完整"):undefined}/>;
}
