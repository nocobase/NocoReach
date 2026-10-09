const {test}=require('node:test'),assert=require('node:assert/strict');
const {projectId,secretKey,requireAccess,roleOf,adminOnly,callbackUri}=require('../../apps/nocoreach/server/providers/reach/domain/policy.cjs');
const g=require('../../apps/nocoreach/server/providers/reach/domain/google-client.cjs');
test('connection secrets are project scoped and reject path/SQL-like identifiers',()=>{assert.notEqual(secretKey('1'),secretKey('2'));for(const id of ['../1','1 OR 1=1','0','abc','1.0'])assert.throws(()=>projectId(id));});
test('callback origins reject remote plaintext, credentials, paths and query injection',()=>{assert.equal(callbackUri('http://127.0.0.1:13004'),'http://127.0.0.1:13004/api/reach/nrGoogle/callback');for(const url of ['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com?x=1'])assert.throws(()=>callbackUri(url));});
// Roles (2026-10-08): NocoBase admins are always 管理员; others need a role picked in 设置 · 成员; settings are 管理员 only.
const rolesDb=(users,assigned={})=>({repository:n=>n==='users'?{findOne:async({filterByTk})=>users.find(u=>String(u.id)===String(filterByTk))||null}:{findOne:async()=>({get:()=>({users:assigned})})}});
const ctxOf=(id,db,action=['nrDataViews','overview'],roles=['member'])=>({auth:{user:id?{id}:null},state:{currentRoles:roles},db,action:{resourceName:action[0],actionName:action[1]},throw:(status,message)=>{throw Object.assign(new Error(message),{status});}});
test('reused connector requests read-only scopes, explicit consent and unpredictable state',()=>{assert.notEqual(g.createOAuthState(),g.createOAuthState());const url=new URL(g.buildAuthorizationUrl({clientId:'test',redirectUri:'http://localhost/cb',state:'abc'}));assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('state'),'abc');assert.ok(g.GOOGLE_SCOPES.filter(s=>s.startsWith('https:')).every(s=>s.endsWith('.readonly')));});

test('an AI suggestion that fails says so plainly when online AI is not connected yet',()=>{
 const {aiFail}=require('../../apps/nocoreach/server/providers/reach/domain/policy.cjs');
 assert.throws(()=>aiFail(Object.assign(new Error('在线 AI 员工未启用'),{status:409}),'在线 AI 这次没有回答'),e=>e.status===409&&/还没有接入在线 AI/.test(e.message));
 assert.throws(()=>aiFail(new Error('timeout'),'在线 AI 这次没有回答'),e=>e.status===502&&e.message==='在线 AI 这次没有回答');
});
