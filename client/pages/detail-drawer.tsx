import { $t } from "#i18n";
import type {ReactNode} from 'react';
import {X} from 'lucide-react';
import {Button} from '#components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '#components/ui/sheet';
import './reach-refinement.css';
// The right-hand detail panel of the data pages (a page, a keyword, an audit issue): title, a short description, the body and an optional footer.
// `actions` sit at the top right, beside the close button: 交给 Agent for the thing shown (2026-10-08 user decision, as
// the data pages have it at the top right of the page).
export function DetailDrawer({open,onClose,title,description,children,footer,actions}:{open:boolean;onClose:()=>void;title:string;description:string;children:ReactNode;footer?:ReactNode;actions?:ReactNode}){return <Sheet open={open} onOpenChange={v=>{if(!v)onClose();}}><SheetContent className="nr-drawer" showCloseButton={false}><SheetHeader className="nr-drawer-head"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 flex-col gap-1.5"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></div>{actions?<div className="flex shrink-0 items-center gap-2" data-drawer-actions="">{actions}</div>:null}</div><Button aria-label={$t("关闭详情")} variant="ghost" size="icon" className="nr-drawer-close" onClick={onClose}><X size={18}/></Button></SheetHeader><div className="nr-drawer-body nr-app">{children}</div>{footer&&<div className="nr-drawer-footer">{footer}</div>}</SheetContent></Sheet>;}
