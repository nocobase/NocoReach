import { $t } from "@/i18n";
import {useState} from 'react';
import {Rows2,Rows3} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
// Density preset (NocoSolution frontend standard §4.1): compact by default, comfortable on request; stored per browser.
export type Density='compact'|'default';
const KEY='nocoreach:density';
export function readDensity():Density{try{return localStorage.getItem(KEY)==='default'?'default':'compact';}catch{return 'compact';}}
export function applyDensity(d:Density=readDensity()){document.documentElement.dataset.theme=d;}
export function DensityToggle({className}:{className?:string}){
 const [density,setDensity]=useState<Density>(readDensity);
 const next:Density=density==='compact'?'default':'compact',label=density==='compact'?$t("切换到宽松"):$t("切换到紧凑");
 return <Button variant="outline" size="icon" title={label} aria-label={label} className={cn('rounded-xl border-border/70 bg-background/60 h-10 w-10',className)}
  onClick={()=>{try{localStorage.setItem(KEY,next);}catch{/* private mode */}applyDensity(next);setDensity(next);}}>{density==='compact'?<Rows3/>:<Rows2/>}</Button>;
}
