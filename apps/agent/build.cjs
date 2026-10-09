// Compiles the NocoReach Agent program. Uses the TypeScript the application already depends on when it is installed; on a
// computer that only runs the Agent (no application dependencies), installs TypeScript and Node types into apps/agent once.
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const project=path.join(__dirname,'tsconfig.json'),application=path.join(__dirname,'../nocoreach/node_modules');
const own=path.join(__dirname,'node_modules');
let tsc=path.join(application,'typescript/bin/tsc'),types=path.join(application,'@types');
if(!fs.existsSync(tsc)){
 tsc=path.join(own,'typescript/bin/tsc');types=path.join(own,'@types');
 if(!fs.existsSync(tsc))execFileSync(process.platform==='win32'?'npm.cmd':'npm',['install','--no-save','--no-package-lock','--no-audit','--no-fund','typescript@5','@types/node@20'],{cwd:__dirname,stdio:'inherit'});
}
execFileSync(process.execPath,[tsc,'-p',project,'--typeRoots',types],{stdio:'inherit'});
