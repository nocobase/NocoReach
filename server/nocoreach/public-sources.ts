// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import * as https from 'node:https';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { projectId, requireAccess } from './policy.js';
import * as __node_crypto from 'node:crypto';
import type { OutboundNetwork } from './outbound-network.js';
import type { Connection, ProxyProfile } from './proxy-profiles.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function publicAddress(ip){if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);}
function normalize(kind,input){let u;try{u=new URL(String(input));}catch{fail('请填写完整 HTTPS 网址');}if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||isIP(u.hostname)||u.hostname==='localhost'||!u.hostname.includes('.'))fail('仅支持不含凭据或查询参数的公开 HTTPS 网址');u.hash='';if(kind==='github'){const m=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);if(u.hostname!=='github.com'||!m)fail('请填写 GitHub 公开仓库地址');u.pathname=`/${m[1]}/${m[2].replace(/\.git$/,'')}`;}else if(kind!=='website')fail('暂不支持此来源');return u.href.replace(/\/$/,'');}
// Resolve and pin a public IPv4 on every hop. No ambient proxy, cookies or credentials.
// NOREACH_PUBLIC_DNS on NocoBase 3 comes from configuration (server/config/nocoreach.ts), set by the NocoReach provider.
let publicDns='';
function setPublicDns(value){publicDns=String(value||'').trim();}
interface PublicTransport {
  network: OutboundNetwork;
  connection: Connection;
  signal?: AbortSignal;
}
interface PublicDownload {
  text: string;
  body: Buffer;
  type: string;
  url: string;
}
async function downloadViaProxy(
  u: URL,
  address: string,
  profile: ProxyProfile,
  hops: number,
  transport: PublicTransport,
): Promise<PublicDownload> {
  const res = await transport.network.send(
    profile,
    u,
    {
      headers: { 'User-Agent': 'NocoReach/0.1', 'Accept-Encoding': 'identity' },
      signal: transport.signal || AbortSignal.timeout(15000),
    },
    { address, hostname: u.hostname },
    2 * 1024 * 1024,
  );
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    if (hops >= 3) fail('跳转次数过多');
    const next = new URL(res.headers.get('location') || '', u);
    if (next.hostname !== u.hostname)
      fail('网页跳转至其他域名，请直接提供最终网址');
    return download(next.href, hops + 1, transport);
  }
  if (res.status !== 200) fail(`来源返回 ${res.status}`, 502);
  const body = Buffer.from(await res.arrayBuffer());
  return {
    text: body.toString('utf8'),
    body,
    type: res.headers.get('content-type') || '',
    url: u.href,
  };
}
// Optional caller deadline spans DNS, all redirect hops and body reads. Legacy
// collectors without a signal retain their existing per-request timeout.
function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('请求已取消'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
async function download(
  input: string | URL,
  hops = 0,
  transport?: PublicTransport,
): Promise<PublicDownload> {
  transport?.signal?.throwIfAborted();
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    fail('不支持该网址');
  let addresses;
  if (publicDns) {
    const resolver = new dns.Resolver({ timeout: 3000, tries: 2 });
    resolver.setServers(publicDns.split(','));
    addresses = (await abortable(resolver.resolve4(u.hostname), transport?.signal)).map((address) => ({
      address,
    }));
  } else addresses = await abortable(dns.lookup(u.hostname, { all: true, family: 4 }), transport?.signal);
  transport?.signal?.throwIfAborted();
  if (addresses.some((x) => /^198\.1[89]\./.test(x.address)))
    fail(
      '本机代理把域名解析到了保留地址（198.18.x.x），无法确认目标是公开网站。请在服务端设置 NOREACH_PUBLIC_DNS（例如 1.1.1.1,8.8.8.8）后重试。',
      503,
    );
  if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
    fail('仅允许访问公开互联网地址');
  const profile = transport?.network.selected(transport.connection);
  if (profile)
    return downloadViaProxy(u, addresses[0].address, profile, hops, transport);
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        agent: false,
        signal: transport?.signal,
        headers: {
          'User-Agent': 'NocoReach/0.1',
          Accept:
            'application/json,text/html,text/plain,application/xml,text/xml',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, opts, cb) =>
          opts.all
            ? cb(null, [{ address: addresses[0].address, family: 4 }])
            : cb(null, addresses[0].address, 4),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (hops >= 3) return reject(new Error('跳转次数过多'));
          const next = new URL(res.headers.location || '', u);
          if (next.hostname !== u.hostname)
            return reject(new Error('网页跳转至其他域名，请直接提供最终网址'));
          return download(next.href, hops + 1, transport).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(
              res.statusCode === 403 || res.statusCode === 429
                ? '来源访问受限或限流，请稍后重试'
                : `来源返回 ${res.statusCode}`,
            ),
          );
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            req.destroy(new Error('单次读取超过 2MB 限制'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            text: body.toString('utf8'),
            body,
            type: res.headers['content-type'] || '',
            url: u.href,
          });
        });
        res.on('error', reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error('来源读取超时，请重试')),
      15000,
    );
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}

function plain(html){return html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();}
async function collect(kind,url: string,read=download){const capturedAt=new Date().toISOString();if(kind==='website'){const r=await read(url);if(!/text\/html|text\/plain/.test(r.type))fail('当前仅支持 HTML 或纯文本公开页面');const body=plain(r.text);if(body.length<80)fail('页面正文不足，可能需要登录或浏览器渲染');const title=plain(r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||new URL(url).hostname).slice(0,200);return {title,capturedAt,items:[{type:'page',title,url:r.url,text:body.slice(0,16000)}],warnings:['仅采集这个页面，不代表已覆盖整个网站；动态内容可能缺失。','正文最多保留 16000 字，不提供访问量或需求趋势。']};}
 const path=new URL(url).pathname,base=`https://api.github.com/repos${path}`;const json=async suffix=>JSON.parse((await read(base+suffix)).text);const repo=await json('');if(repo.private)fail('首批仅支持公开仓库');const items=[{type:'repository',title:repo.full_name,url:repo.html_url,text:String(repo.description||''),stars:repo.stargazers_count,forks:repo.forks_count,updatedAt:repo.updated_at}],warnings=['Stars 和 Forks 是采集时点值，不是增长趋势或购买意愿。','Issues 仅包含最近更新的最多 20 个返回项中的非 PR 条目，Releases 最多 5 条；不代表全量或统计周期。','Discussions、评论与私有仓库尚未接入。'];for(const [suffix,type]of[['/issues?state=all&sort=updated&direction=desc&per_page=20','issue'],['/releases?per_page=5','release']]){try{const rows=await json(suffix);if(!Array.isArray(rows))throw new Error();for(const row of rows){if(row.pull_request)continue;items.push({type,title:String(row.title||row.name||row.tag_name).slice(0,200),url:row.html_url,text:String(row.body||'').slice(0,4000),updatedAt:row.updated_at||row.published_at,state:row.state});}}catch{warnings.push(`${type==='issue'?'Issues':'Releases'} 本次读取失败，其他可用数据已保留。`);}}return {title:repo.full_name,capturedAt,items,warnings};}
function starHistory(old,data){const samples=[...(old?.starHistory||[])];if(old?.kind==='github'&&!samples.length){const stars=old.items?.find(i=>i.type==='repository')?.stars;if(Number.isFinite(stars)&&old.capturedAt)samples.push({at:old.capturedAt,stars});}const stars=data.items?.find(i=>i.type==='repository')?.stars;if(Number.isFinite(stars)){const date=data.capturedAt.slice(0,10);return [...samples.filter(s=>s.at.slice(0,10)!==date),{at:data.capturedAt,stars}].sort((a,b)=>a.at.localeCompare(b.at)).slice(-400);}return samples;}
class PublicSources{
 constructor(plugin){this.p=plugin;this.p.network?.bind(this,['preview','refresh']);}
 read(kind){return this.p.network?(url: string)=>download(url,0,{network:this.p.network,connection:kind==='github'?'github':'site'}):download;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `sources:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||{sources:[]};}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction}),state=row?.get('payload')||{sources:[]};await fn(state);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async preview(id,v){const url=normalize(v.kind,v.url);return {kind:v.kind,url,...await collect(v.kind,url,this.read(v.kind))};}
 async save(id,v,ctx){const saved=await ctx.cache.get(`nr-source-preview:${id}:${ctx.auth.user.id}:${v.previewId}`);if(!saved)fail('预览已过期，请重新读取',409);return this.mutate(id,state=>{const key=createHash('sha256').update(saved.kind+saved.url).digest('hex').slice(0,24);const old=state.sources.find(s=>s.id===key);const next={...saved,starHistory:starHistory(old,saved),id:key,status:'ready',revision:(old?.revision||0)+1};if(old)state.sources[state.sources.indexOf(old)]=next;else{if(state.sources.length>=30)fail('当前项目最多接入 30 个公开来源');state.sources.push(next);}});}
 async refresh(id,v){const current=(await this.state(id)).sources.find(s=>s.id===v.id);if(!current||current.status==='disconnected')fail('来源不存在或已断开',404);let data;try{data=await collect(current.kind,current.url,this.read(current.kind));}catch(e){await this.mutate(id,s=>{const found=s.sources.find(x=>x.id===v.id);if(found&&found.revision===current.revision){found.error='本次更新失败，保留上次成功资料。';}});throw e;}return this.mutate(id,state=>{const old=state.sources.find(s=>s.id===v.id);if(!old||old.revision!==current.revision||old.status==='disconnected')fail('来源已变更，请刷新后重试',409);Object.assign(old,data,{starHistory:starHistory(old,data),error:null,revision:old.revision+1});});}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'来源读取未完成，请核对公开地址、网络或限流状态后重试。');}};this.p.app.resourceManager.define({name:'nrSources',actions:{list:wrap(id=>this.state(id)),preview:wrap(async(id,v,ctx)=>{const data=await this.preview(id,v),previewId=__node_crypto.randomUUID();await ctx.cache.set(`nr-source-preview:${id}:${ctx.auth.user.id}:${previewId}`,data,600000);return {...data,previewId};}),save:wrap((id,v,c)=>this.save(id,v,c)),refresh:wrap((id,v)=>this.refresh(id,v)),disconnect:wrap((id,v)=>this.mutate(id,state=>{const s=state.sources.find(x=>x.id===v.id);if(!s)fail('来源不存在',404);s.status='disconnected';s.revision++;}))}});this.p.app.acl.allow('nrSources',['list','preview','save','refresh','disconnect'],'loggedIn');}
}
export { PublicSources, normalize, publicAddress, plain, collect, starHistory, download, setPublicDns };
