import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {Button} from '#components/ui/button';
import {cn} from '#lib/utils';
// Something kept out of the way until asked for. Replaces the browser's ▶ disclosure box (user feedback 2026-10-04: no
// triangle boxes): a small button that says what it shows, with a chevron that turns when it is open. The button keeps
// its label once open (2026-10-24 user report: it turned into a bare Collapse and nothing else seemed to change), and
// content opened below the visible area is scrolled into view. Callers leave it out when there is nothing to show.
export function Reveal({label,children,defaultOpen=false,className}:{label:ReactNode;children:ReactNode;defaultOpen?:boolean;className?:string}){
 const [open,setOpen]=useState(defaultOpen),bodyRef=useRef<HTMLDivElement>(null),askedRef=useRef(false);
 useEffect(()=>{if(open&&askedRef.current)bodyRef.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},[open]);
 return <div className={cn('flex flex-col items-start gap-2',className)} data-open={open||undefined}>
  <Button type='button' size='sm' variant='outline' aria-expanded={open} onClick={()=>{askedRef.current=true;setOpen(o=>!o);}}>{label}<ChevronDown aria-hidden='true' className={cn('transition-transform',open&&'rotate-180')}/></Button>
  {open?<div ref={bodyRef} className='w-full min-w-0'>{children}</div>:null}
 </div>;
}
