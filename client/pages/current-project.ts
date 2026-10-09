import { resolveAppUrl } from '@nocobase/app-client';

// Which project the Portal works on: chosen in the header, kept in this browser (default: project 1).
const KEY='nocoreach:project';
export function currentProjectId():number{try{const v=Number(localStorage.getItem(KEY));return Number.isInteger(v)&&v>0?v:1;}catch{return 1;}}
// Switching reloads the Portal so every page and cached request starts from the chosen project. The path is under the
// application's base path (`/main` locally, `/nocoreach` on Studio), which resolveAppUrl adds.
export function switchProject(id:number,path='/home'){try{localStorage.setItem(KEY,String(id));}catch{/* private mode: stays for this page */}window.location.assign(resolveAppUrl(path));}
export function rememberProject(id:number){try{localStorage.setItem(KEY,String(id));}catch{/* ignore */}}
