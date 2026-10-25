import { $t } from '#i18n';
// Parts shared by the data pages: a metric with its change against the previous period, as a tile or a small change line.
import {StatTile} from '#components/seo/stat-tile';
import {help} from './glossary';
import {Delta} from '#components/reach/delta';
import {formatCount,formatDuration,formatPercent} from '#lib/format';
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null;format?:'percent'|'decimal'|'duration';lowerIsBetter?:boolean;unit?:string};
export const fmt=(v:number|null)=>formatCount(v);
// Seconds as GA4 shows engagement time: 1 分 42 秒 / 1 min 42 s.
export const duration=(seconds:number)=>formatDuration(seconds);
export function Change({m}:{m:Metric}){if(m.change===null)return m.complete||m.value===null?null:<small className='nr-muted'>{$t('dataParts.incompleteData')}</small>;return <small><Delta value={m.change} good={m.lowerIsBetter?'down':'up'}/></small>;}
export function MetricTile({m}:{m:Metric}){
 const value=m.value===null?'—':m.format==='percent'?formatPercent(m.value):m.format==='decimal'?m.value.toFixed(1):m.format==='duration'?duration(m.value):`${fmt(m.value)}${m.unit||''}`;
 // Position falls as it improves: show the difference in places, like 搜索表现.
 const delta=m.lowerIsBetter?(m.change!==null&&m.previous!==null&&m.value!==null?{change:m.previous-m.value,better:m.previous>=m.value,points:true}:null):m.change!==null?{change:m.change,better:m.change>=0}:null;
 return <StatTile label={m.label} value={value} delta={delta} help={help(m.label)} hint={m.change===null&&!m.complete&&m.value!==null?$t('dataParts.incompleteData'):undefined}/>;
}

// Metric rows hold at most four tiles; two, three or five fill the row instead of leaving a gap (UI review A8).
export const metricGrid = (count: number) =>
  count <= 2
    ? 'grid grid-cols-2 gap-3'
    : count === 3
      ? 'grid grid-cols-2 gap-3 lg:grid-cols-3'
      : count === 5
        ? 'grid grid-cols-2 gap-3 lg:grid-cols-5'
        : 'grid grid-cols-2 gap-3 lg:grid-cols-4';
