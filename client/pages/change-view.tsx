import { $t, $tj } from '#i18n';
import {useState} from 'react';
import type {FileChange} from './task-execution-types';
export type DiffLine={type:'same'|'add'|'del';text:string};
// Line diff of before/after: common head and tail are skipped first, so a local edit in a long file stays cheap.
export function lineDiff(before:string,after:string):DiffLine[]{
 const a=before?before.split('\n'):[],b=after?after.split('\n'):[];
 let head=0;while(head<a.length&&head<b.length&&a[head]===b[head])head++;
 let tail=0;while(tail<a.length-head&&tail<b.length-head&&a[a.length-1-tail]===b[b.length-1-tail])tail++;
 const x=a.slice(head,a.length-tail),y=b.slice(head,b.length-tail),out:DiffLine[]=a.slice(0,head).map(text=>({type:'same',text}));
 if(x.length*y.length>2_000_000)out.push(...x.map(text=>({type:'del' as const,text})),...y.map(text=>({type:'add' as const,text})));
 else{
  const n=x.length,m=y.length,lcs=new Uint32Array((n+1)*(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)lcs[i*(m+1)+j]=x[i]===y[j]?lcs[(i+1)*(m+1)+j+1]+1:Math.max(lcs[(i+1)*(m+1)+j],lcs[i*(m+1)+j+1]);
  let i=0,j=0;while(i<n||j<m){if(i<n&&j<m&&x[i]===y[j]){out.push({type:'same',text:x[i]});i++;j++;}else if(i<n&&(j>=m||lcs[(i+1)*(m+1)+j]>=lcs[i*(m+1)+j+1])){out.push({type:'del',text:x[i]});i++;}else{out.push({type:'add',text:y[j]});j++;}}
 }
 out.push(...a.slice(a.length-tail).map(text=>({type:'same' as const,text})));
 return out;
}
// Only the changed lines with a little context; long unchanged stretches fold into one marker.
export function hunks(lines:DiffLine[],context=2):(DiffLine|{type:'gap';count:number})[]{
 const keep=lines.map(()=>false);lines.forEach((l,i)=>{if(l.type!=='same')for(let k=Math.max(0,i-context);k<=Math.min(lines.length-1,i+context);k++)keep[k]=true;});
 const out:(DiffLine|{type:'gap';count:number})[]=[];let gap=0;
 lines.forEach((l,i)=>{if(keep[i]){if(gap)out.push({type:'gap',count:gap});gap=0;out.push(l);}else gap++;});
 if(gap&&out.length)out.push({type:'gap',count:gap});
 return out;
}
const prose=(path:string)=>/\.(md|mdx|markdown|txt)$/i.test(path);
// 改动对比 (SPEC §6): what the change looks like as text, file by file; added lines green, removed lines red.
export function ChangeView({changes}:{changes:FileChange[]}){
 const [index,setIndex]=useState(0),c=changes[Math.min(index,changes.length-1)];
 if(!c)return null;
 const rows=hunks(lineDiff(c.before,c.after)),added=rows.filter(r=>r.type==='add').length,removed=rows.filter(r=>r.type==='del').length;
 return <div className='nr-change-view'>
  {changes.length>1&&<div className='nr-change-tabs' role='tablist' aria-label={$t('changeView.changedFiles')}>{changes.map((f,i)=><button key={f.path} type='button' role='tab' aria-selected={i===index} onClick={()=>setIndex(i)}>{f.path.split('/').slice(-2).join('/')}</button>)}</div>}
  <div className='nr-change-head'><code>{c.path}</code><span><span className='nr-add'>+{added}</span> <span className='nr-del'>−{removed}</span>{!c.before?$t('changeView.newFile'):!c.after?$t('changeView.deleted'):''}</span></div>
  {/* eslint-disable-next-line @eslint-react/no-array-index-key -- Diff rows are immutable line positions; duplicate text and gaps are valid. */}
  <div className={'nr-change-body'+(prose(c.path)?' nr-change-prose':'')}>{rows.length?rows.map((r,i)=>r.type==='gap'?<div key={i} className='nr-change-gap'>{$tj('changeView.unchangedLines',{0:r.count})}</div>:<div key={i} className='nr-change-line' data-type={r.type}><span aria-hidden='true'>{r.type==='add'?'+':r.type==='del'?'−':''}</span><span>{r.text||' '}</span></div>):<p className='nr-td-muted'>{$t('changeView.noChangesContent')}</p>}</div>
  {c.truncated&&<p className='nr-td-muted'>{$t('changeView.fileLongBeginningCompared')}</p>}
 </div>;
}
