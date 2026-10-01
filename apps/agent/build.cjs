// Compiles the NocoReach Agent program with the TypeScript the Portal already depends on.
const {execFileSync}=require('node:child_process');const path=require('node:path');
execFileSync(process.execPath,[path.join(__dirname,'../portal/node_modules/typescript/bin/tsc'),'-p',path.join(__dirname,'tsconfig.json')],{stdio:'inherit'});
