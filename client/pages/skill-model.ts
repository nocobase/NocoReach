import {nocobaseClient as api} from "@/lib/nocoreach-api";
// Skills (SPEC §6.0), mirrored from plugins/connections/server/skills.js: one library for every project, turned on or off
// per project; a 做法 step can name Skills it always uses.
export type SkillFile={path:string;chars:number};
export type Skill={id:string;name:string;description:string;files:SkillFile[];chars:number;builtIn?:boolean;source?:string;enabled:boolean;createdAt:string;updatedAt:string};
// 填链接: either the Skill that was read (to look at, then import) or every Skill a repository holds (to tick and import).
export type LinkRead={source:string;name?:string;description?:string;files?:{path:string;text:string}[];skipped?:string[];choices?:{path:string;name:string;description:string;exists?:boolean}[]};
export type SkillList={revision:number;skills:Skill[]};
export type SkillAction='list'|'get'|'create'|'import'|'readLink'|'importLink'|'edit'|'addFiles'|'removeFile'|'remove'|'setEnabled';
export function skillRequest<T>(action:SkillAction,projectId:number|string,body:object={}){return api.action<T>('nrSkills',action,{method:'POST',body:{projectId:String(projectId),...body},unwrap:'data'});}
export const SKILL_NAME=/^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_FILE=200000;
// Files picked in the browser (a folder or single files) read as text: hidden files, non-text and very large files are
// skipped and counted. A folder's own name is dropped from each path, so SKILL.md sits at the top.
export async function readSkillFiles(list:FileList|File[],folder:boolean):Promise<{files:{path:string;text:string}[];skipped:string[]}>{
 const files:{path:string;text:string}[]=[],skipped:string[]=[];
 for(const f of Array.from(list)){
  const rel=(folder&&(f as File&{webkitRelativePath?:string}).webkitRelativePath)||f.name,path=folder?rel.split('/').slice(1).join('/')||f.name:f.name;
  if(path.split('/').some(s=>s.startsWith('.')||s==='__MACOSX'))continue;
  if(f.size>MAX_FILE*4){skipped.push(path);continue;}
  const text=await f.text();if(text.includes('\u0000')||text.length>MAX_FILE){skipped.push(path);continue;}
  files.push({path,text});
 }
 return {files,skipped};
}
