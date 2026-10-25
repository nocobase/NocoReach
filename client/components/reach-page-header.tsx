import type { ReactNode } from 'react';
export function ReachPageHeader({title,description,actions}:{title:string;description?:string;actions?:ReactNode}){
 return <header className='flex flex-wrap items-start justify-between gap-4 border-b pb-5 mb-5'><div className='min-w-0'><h1 className='text-xl font-semibold tracking-tight break-words'>{title}</h1>{description&&<p className='mt-2 text-sm text-muted-foreground'>{description}</p>}</div>{actions&&<div className='flex flex-wrap gap-2'>{actions}</div>}</header>;
}
