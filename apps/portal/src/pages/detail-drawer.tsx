import { $t } from "@/i18n";
import type {ReactNode} from 'react';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import './reach-refinement.css';
// The right-hand detail panel of the data pages (a page, a keyword, an audit issue): title, a short description, the body and an optional footer.
export function DetailDrawer({open,onClose,title,description,children,footer}:{open:boolean;onClose:()=>void;title:string;description:string;children:ReactNode;footer?:ReactNode}){return <Sheet open={open} onOpenChange={v=>{if(!v)onClose();}}><SheetContent className="nr-drawer" showCloseButton={false}><SheetHeader className="nr-drawer-head"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription><Button aria-label={$t("关闭详情")} variant="ghost" size="icon" className="nr-drawer-close" onClick={onClose}><X size={18}/></Button></SheetHeader><div className="nr-drawer-body nr-app">{children}</div>{footer&&<div className="nr-drawer-footer">{footer}</div>}</SheetContent></Sheet>;}
