// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { channelOf, downloadRows, pageUrl } from './packages-source.js';
// 下载量 page, rebuilt 2026-10-14 in the shape of 访问 and GitHub (user request: the first NocoReach's 产品采用 page had
// far more to see). One figure per package (npm and PyPI downloads, Docker Hub pulls gained between daily samples) and
// one for the GitHub release files, each with its days; what was released (dist-tags, and versions, image tags and
// releases published in the period); last week's npm downloads by version; the platforms of the images and the Python
// versions and systems of the PyPI packages; and the tables of versions, image tags and release files. Downloads,
// pulls and release-file downloads are counted differently and are never added together.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const dayOf=t=>(t?String(t).slice(0,10):null);
const shares=(rows,top=6)=>{const total=rows.reduce((n,r)=>n+r.count,0),head=rows.slice(0,top),rest=rows.slice(top).reduce((n,r)=>n+r.count,0);return {total,rows:[...head,...(rest?[{name:'*other',count:rest}]:[])].map(r=>({name:r.name??r.label,count:r.count,share:total?r.count/total:null}))};};
// Gains between samples of a running total, on the day of the later sample (a withdrawn count is no negative gain).
function gains(samples){const out={};let prev=null;for(const d of Object.keys(samples||{}).sort()){const x=samples[d];if(!Number.isFinite(x))continue;if(prev!==null)out[d]=Math.max(0,x-prev);prev=x;}return out;}
const daysOf=(a,b)=>{const out=[];for(let d=a;d<=b;d=add(d,1))out.push(d);return out;};

function downloadsView(st,gh,act,v,{windowFor,netChange,end}){
 const w=windowFor(end,String(v.range||'28'),v.from,v.to),days=daysOf(w.start,w.end),prevDays=daysOf(w.previousStart,w.previousEnd),inWin=t=>{const d=dayOf(t);return Boolean(d&&d>=w.start&&d<=w.end);};
 const items=[],perDay={},notes=[systemMessageText('downloadsView.notCombined'),systemMessageText('downloadsView.noUsersOrRegions')];
 const running=(id,samples)=>{const wrap=Object.fromEntries(Object.entries(samples).map(([d,x])=>[d,{n:x}])),value=netChange(wrap,'n',w.start,w.end),previous=netChange(wrap,'n',w.previousStart,w.previousEnd),dates=Object.keys(samples).sort();perDay[id]=gains(samples);
  return {value,previous,change:value!==null&&previous?(value-previous)/previous:null,complete:value!==null,total:dates.length?samples[dates.at(-1)]:null,since:dates[0]||null};};
 for(const p of st.packages){const m=st.meta?.[p.id],base={id:p.id,registry:p.registry,name:p.name,title:p.title||p.name,url:p.url||pageUrl(p)};
  if(m?.error)notes.push(systemMessageText('downloadsView.metaFailed',{0:base.title,1:m.error}));
  if(p.registry==='docker'){const newest=(m?.tags||[]).filter(t=>t.pushed).sort((a,b)=>b.pushed.localeCompare(a.pushed))[0],r=running(p.id,st.samples?.[p.id]||{});
   if(!r.since||r.since>add(w.start,-1))notes.push(systemMessageText('messages.dockerPullsRecordedDailyEarlier',{0:r.since||systemMessageText('downloadsView.today')}));
   items.push({...base,kind:'pulls',...r,latest:newest?{version:newest.tag,published:newest.pushed}:null});continue;}
  const daily=st.daily?.[p.id]||{},present=(a,b)=>Object.keys(daily).filter(d=>d>=a&&d<=b&&Number.isFinite(daily[d])),cur=present(w.start,w.end),prev=present(w.previousStart,w.previousEnd),sum=l=>l.reduce((n,d)=>n+daily[d],0);
  const complete=cur.length===w.days,value=cur.length?sum(cur):null,previous=prev.length===w.days?sum(prev):null,tag=m?.tags?.latest,lv=(m?.versions||[]).find(x=>x.version===tag)||(tag?null:(m?.versions||[])[0]);perDay[p.id]=daily;
  items.push({...base,kind:'downloads',value,previous,change:complete&&previous?(value-previous)/previous:null,complete,total:null,since:Object.keys(daily).sort()[0]||null,latest:lv?{version:lv.version,published:lv.published}:tag?{version:tag,published:null}:null});}
 if(!downloadRows(st).length&&st.packages.some(p=>p.registry!=='docker'))notes.push(systemMessageText('dataViews.downloadsStillFirstSync'));
 if(st.packages.some(p=>p.registry==='pypi')&&w.previousStart<add(end,-179))notes.push(systemMessageText('dataViews.pypiProvidesDownloadsLast180'));
 // GitHub release files: GitHub counts each file's downloads as a running total, recorded daily with the repository
 // once its history is read (token).
 const releases=gh?.repo&&act?.repo===gh.repo?act.releases||[]:[],files=Object.fromEntries(Object.entries(gh?.daily||{}).filter(([,x])=>Number.isFinite(x?.releaseDownloads)).map(([d,x])=>[d,x.releaseDownloads]));
 if(gh?.repo&&(Object.keys(files).length||releases.some(r=>r.assets?.length))){const r=running('github:releases',files),newest=releases[0];
  items.push({id:'github:releases',registry:'github',name:gh.repo,title:gh.repo,url:`https://github.com/${gh.repo}/releases`,kind:'assets',...r,total:r.total??(releases.reduce((n,x)=>n+(x.downloads||0),0)||null),latest:newest?{version:newest.tag,published:newest.date}:null});}
 for(const it of items){const d=perDay[it.id]||{},seen=days.filter(x=>Number.isFinite(d[x]));it.average=it.value!==null&&seen.length?it.value/(it.kind==='downloads'?seen.length:w.days):null;const top=seen.reduce((a,x)=>(a===null||d[x]>d[a]?x:a),null);it.peak=top?{date:top,value:d[top]}:null;}
 const row=date=>({date,...Object.fromEntries(items.map(it=>[it.id,Number.isFinite(perDay[it.id]?.[date])?perDay[it.id][date]:null]))});
 // What was released: each dist-tag's version, and what was published in the period.
 const npmish=st.packages.filter(p=>p.registry!=='docker'&&st.meta?.[p.id]),images=st.packages.filter(p=>p.registry==='docker'&&st.meta?.[p.id]?.tags);
 const tags=npmish.flatMap(p=>Object.entries(st.meta[p.id].tags||{}).map(([tag,version])=>({id:p.id,package:p.title||p.name,registry:p.registry,tag,version,published:(st.meta[p.id].versions||[]).find(x=>x.version===version)?.published||null}))).sort((a,b)=>(a.tag==='latest'?0:1)-(b.tag==='latest'?0:1)||String(b.published||'').localeCompare(String(a.published||'')));
 const published={npm:null,pypi:null,docker:null,github:null};
 for(const p of npmish)published[p.registry]=(published[p.registry]||0)+(st.meta[p.id].versions||[]).filter(x=>inWin(x.published)).length;
 for(const p of images)published.docker=(published.docker||0)+st.meta[p.id].tags.filter(t=>inWin(t.pushed)).length;
 if(releases.length)published.github=releases.filter(r=>inWin(r.date)).length;
 // Last week's npm downloads by version, per package.
 const versions=st.packages.filter(p=>p.registry==='npm'&&st.meta?.[p.id]?.week?.groups?.length).map(p=>{const wk=st.meta[p.id].week,s=shares(wk.groups);return {id:p.id,package:p.title||p.name,at:wk.at,total:s.total,rows:s.rows};});
 // Where they run: the platforms of an image's tags (the share of tags built for each), and PyPI's last 30 days by
 // Python version and by system.
 const platforms=images.map(p=>{const t=st.meta[p.id].tags.filter(x=>x.platforms?.length),count={};for(const x of t)for(const a of new Set(x.platforms.map(y=>`${y.os}/${y.arch}`)))count[a]=(count[a]||0)+1;
  const latest=t.find(x=>x.tag==='latest')||t.find(x=>channelOf(x.tag)==='release'),pulled=t.map(x=>x.pulled).filter(Boolean).sort().at(-1)||null;
  return {id:p.id,image:p.title||p.name,tags:t.length,total:st.meta[p.id].total??null,rows:Object.entries(count).sort((a,b)=>b[1]-a[1]).map(([name,n])=>({name,count:n,share:t.length?n/t.length:null})),latest:latest?{tag:latest.tag,size:latest.size}:null,pulled};});
 // Docker 发布覆盖 (as the first NocoReach had it): per release line, how many tags and tag × platform builds, the CPUs
 // they are built for, the largest image of one platform, and the latest push.
 const ORDER=['latest','release','line','beta','alpha','rc','pre','other'];
 const coverage=images.map(p=>{const by=new Map();for(const t of st.meta[p.id].tags){const ch=channelOf(t.tag),list=t.platforms||[];let c=by.get(ch);if(!c){c={channel:ch,tags:0,builds:0,archs:{},maxSize:null,pushed:null};by.set(ch,c);}
   c.tags++;c.builds+=list.length;for(const x of list)c.archs[x.arch]=(c.archs[x.arch]||0)+1;const size=Math.max(0,...list.map(x=>x.size||0))||t.size||0;if(size&&(!c.maxSize||size>c.maxSize))c.maxSize=size;if(t.pushed&&(!c.pushed||t.pushed>c.pushed))c.pushed=t.pushed;}
  return {id:p.id,image:p.title||p.name,read:st.meta[p.id].tags.length,total:st.meta[p.id].total??null,rows:[...by.values()].sort((a,b)=>ORDER.indexOf(a.channel)-ORDER.indexOf(b.channel)).map(c=>({...c,archs:Object.entries(c.archs).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))}))};}).filter(c=>c.rows.length);
 const python=st.packages.filter(p=>p.registry==='pypi'&&(st.meta?.[p.id]?.python||st.meta?.[p.id]?.systems)).map(p=>{const m=st.meta[p.id],pick=x=>x?{from:x.from,to:x.to,...shares(x.rows.filter(r=>r.name&&r.name!=='null').map(r=>({name:r.name,count:r.count})))}:null;return {id:p.id,package:p.title||p.name,versions:pick(m.python),systems:pick(m.systems)};});
 return {connected:true,window:w,cutoff:downloadRows(st).at(-1)?.date||null,notes,sync:st.lastSync?{at:st.lastSync.at,ok:st.lastSync.ok,errors:st.lastSync.errors||[]}:null,
  items,daily:days.map(row),previousDaily:prevDays.map(row),
  releases:{tags,published},versions,environment:{platforms,python},coverage,
  tables:{
   versions:npmish.flatMap(p=>(st.meta[p.id].versions||[]).slice(0,300).map(x=>({key:`${p.id}@${x.version}`,id:p.id,package:p.title||p.name,registry:p.registry,version:x.version,channel:channelOf(x.version),tags:x.tags||[],published:x.published||null,lastWeek:x.lastWeek??null,files:x.files??null,size:x.size??null,yanked:Boolean(x.yanked)}))).sort((a,b)=>String(b.published||'').localeCompare(String(a.published||''))),
   tags:images.flatMap(p=>st.meta[p.id].tags.map(t=>({key:`${p.id}:${t.tag}`,id:p.id,image:p.title||p.name,tag:t.tag,channel:channelOf(t.tag),platforms:[...new Set((t.platforms||[]).map(x=>x.arch))],os:[...new Set((t.platforms||[]).map(x=>x.os).filter(Boolean))],size:t.size,pushed:t.pushed,pulled:t.pulled,digest:t.digest}))),
   assets:releases.slice(0,100).flatMap(r=>(r.assets||[]).map(a=>({key:`${r.tag}/${a.name}`,release:r.name||r.tag,tag:r.tag,name:a.name,downloads:a.downloads??null,size:a.size??null,published:r.date||null,url:r.url||null,prerelease:Boolean(r.prerelease)})))}};}

export { downloadsView, gains };
