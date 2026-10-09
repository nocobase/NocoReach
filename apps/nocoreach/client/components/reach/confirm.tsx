import { $t } from "@/i18n";
import {useRef,useState,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/reach-ui/alert-dialog';
// Ask before anything with consequences (NocoSolution frontend standard §9.3): the title names the thing, the line below
// says what happens, the button says the action. Replaces the browser's own confirm() box everywhere. Mounts itself once,
// so pages call `if(await confirmAction({...}))` without placing a component.
export type ConfirmAsk={title:string;description?:ReactNode;action:string;
 /** Deleting, disconnecting, discarding: red. Set false for an action that only needs a second look. */
 destructive?:boolean};
let root:Root|null=null;
export function confirmAction(ask:ConfirmAsk):Promise<boolean>{
 return new Promise(resolve=>{
  if(!root){const host=document.createElement('div');host.setAttribute('data-confirm-host','');document.body.appendChild(host);root=createRoot(host);}
  root.render(<ConfirmDialog key={Math.random()} ask={ask} onDone={resolve}/>);
 });
}
function ConfirmDialog({ask,onDone}:{ask:ConfirmAsk;onDone:(ok:boolean)=>void}){
 const [open,setOpen]=useState(true),done=useRef(false);
 const finish=(ok:boolean)=>{if(done.current)return;done.current=true;setOpen(false);onDone(ok);};
 return <AlertDialog open={open} onOpenChange={o=>{if(!o)finish(false);}}>
  <AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>{$t(ask.title)}</AlertDialogTitle>{ask.description?<AlertDialogDescription>{typeof ask.description==='string'?$t(ask.description):ask.description}</AlertDialogDescription>:null}</AlertDialogHeader>
   <AlertDialogFooter><AlertDialogCancel>{$t("取消")}</AlertDialogCancel><AlertDialogAction variant={ask.destructive===false?'default':'destructive'} onClick={()=>finish(true)}>{$t(ask.action)}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent>
 </AlertDialog>;
}
