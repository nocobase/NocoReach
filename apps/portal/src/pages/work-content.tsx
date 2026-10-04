import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import type {ContentEntry} from './content-index';
import {Reveal} from '@/components/reach/reveal';
// `compact` is the task page's property column: a small heading, no frame, no link to the content page.
export function ContentAssociation({projectId,contentId,disabled,onLink,compact=false}:{projectId:number;contentId?:string;disabled:boolean;onLink:(id:string)=>void;compact?:boolean}){
 const [entries,setEntries]=useState<ContentEntry[]>([]),[error,setError]=useState(''),[selected,setSelected]=useState('');const navigate=useNavigate();
 useEffect(()=>{let active=true;api.action<ContentEntry[]>('nrContentIndex','list',{method:'POST',body:{projectId:String(projectId)},unwrap:'data'}).then(rows=>{if(active)setEntries(Array.isArray(rows)?rows:[]);}).catch(()=>{if(active)setError('内容映射暂时无法读取');});return()=>{active=false;};},[projectId]);
 const entry=entries.find(e=>e.id===contentId);
 return <section className={compact?'space-y-1 text-sm nr-content-compact':'p-5 border-b space-y-3 text-sm'}>{compact?<h3>关联页面</h3>:<h2 className="font-semibold">关联内容</h2>}{error&&<p role="alert">{error}</p>}{entry?<><a href={entry.url} target="_blank" rel="noopener noreferrer" className="nr-link break-all">{entry.title}</a><p className="break-all">{entry.repository||'仓库待关联'}{entry.paths.length?' · '+entry.paths.join('、'):''}</p></>:<p>尚未关联页面</p>}
 <Reveal label="选择页面"><select aria-label="关联内容" className="w-full border rounded p-2 my-2" value={selected} disabled={disabled} onChange={e=>setSelected(e.target.value)}><option value="">选择已有页面</option>{entries.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select><Button variant="outline" size="sm" disabled={disabled||!selected} onClick={()=>onLink(selected)}>保存关联</Button>{!compact&&<p className="text-xs">在确认工作范围前关联页面。</p>}</Reveal>{!compact&&<Button variant="link" size="sm" onClick={()=>navigate('/content')}>管理内容映射</Button>}</section>;
}
