const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
execFileSync(process.execPath,[path.join(root,'apps/portal/node_modules/typescript/bin/tsc'),'-p',path.join(__dirname,'../server/execution/tsconfig.json')],{stdio:'inherit'});
