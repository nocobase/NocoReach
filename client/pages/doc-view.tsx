import { $t } from "#i18n";
import {useState,type ReactNode} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Maximize2} from 'lucide-react';
import {Button} from '#components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '#components/ui/dialog';
import './doc-view.css';
// Long documents show their beginning in place and open whole in a reading window; short ones show in full.
export const isLong=(content:string)=>content.length>1200||content.split('\n').length>24;
export function Markdown({content}:{content:string}){
 return <div className="nr-doc"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({node:_n,...p})=><a {...p} target="_blank" rel="noreferrer"/>}}>{content}</ReactMarkdown></div>;
}
export function DocReader({open,onClose,title,meta,content,children}:{open:boolean;onClose:()=>void;title:string;meta?:string;content:string;children?:ReactNode}){
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="nr-doc-reader">
  <DialogHeader><DialogTitle>{title}</DialogTitle>{meta&&<DialogDescription>{meta}</DialogDescription>}</DialogHeader>
  <div className="nr-doc-reader-body">{children}<Markdown content={content}/></div>
 </DialogContent></Dialog>;
}
export function DocView({content,title,meta}:{content:string;title:string;meta?:string}){
 const [open,setOpen]=useState(false),long=isLong(content);
 return <div className="nr-doc-view" data-long={long||undefined}>
  <div className="nr-doc-clip"><Markdown content={content}/></div>
  {long&&<div className="nr-doc-more"><Button size="sm" variant="outline" onClick={()=>setOpen(true)}><Maximize2/>{$t('docView.readMore')}</Button></div>}
  <DocReader open={open} onClose={()=>setOpen(false)} title={title} meta={meta} content={content}/>
 </div>;
}
