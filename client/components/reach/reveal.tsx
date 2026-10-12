import { $t } from "#i18n";
import {useState,type ReactNode} from 'react';
import {Button} from '#components/ui/button';
import {cn} from '#lib/utils';
// Something kept out of the way until asked for. Replaces the browser's ▶ disclosure box (user feedback 2026-10-04: no
// triangle boxes): a small button that says what it shows; once open the content follows and the button reads 收起.
export function Reveal({label,children,defaultOpen=false,className}:{label:ReactNode;children:ReactNode;defaultOpen?:boolean;className?:string}){
 const [open,setOpen]=useState(defaultOpen);
 return <div className={cn('flex flex-col items-start gap-2',className)} data-open={open||undefined}>
  <Button type="button" size="sm" variant={open?'ghost':'outline'} aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{open?$t('common.collapse'):label}</Button>
  {open?<div className="w-full min-w-0">{children}</div>:null}
 </div>;
}
