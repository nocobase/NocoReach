'use strict';
// Builds the plugin and packs it as a .tgz that `nb plugin import` accepts: node plugins/connections/scripts/pack.cjs [out dir]
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'../..'));
execFileSync(process.execPath,[path.join(__dirname,'build-client.cjs')],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(__dirname,'build-server.cjs')],{stdio:'inherit'});
fs.mkdirSync(out,{recursive:true});
const npm=process.platform==='win32'?'npm.cmd':'npm';
const name=execFileSync(npm,['pack','--pack-destination',out],{cwd:root,encoding:'utf8'}).trim().split('\n').pop();
console.log(path.join(out,name));
