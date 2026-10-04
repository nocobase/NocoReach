const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// NocoBase checks every request to an action named update or destroy for a filter or filterByTk and turns it away
// otherwise, so our own resources (which take ids in the body) never use those two names.
test('custom resources do not name actions update or destroy',()=>{
 const dir=path.join(__dirname,'../../plugins/connections/server'),bad=[];
 for(const f of fs.readdirSync(dir).filter(f=>/\.(js|ts)$/.test(f))){const s=fs.readFileSync(path.join(dir,f),'utf8');
  if(/\b(update|destroy):wrap\(/.test(s)||/acl\.allow\([^)]*'(update|destroy)'/.test(s))bad.push(f);}
 assert.deepEqual(bad,[]);
});
