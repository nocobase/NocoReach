import {BilibiliConnect} from './bilibili-connect';
import {bilibiliRequest,type BilibiliStatus} from './bilibili-api';
import { useOnlineChat } from '../online-agent/context.js';
import { ConnectionNetwork } from "#components/connection-network";
import { useMessageState, $t, $tj } from "#i18n";
import {useEffect,useState} from 'react';
import {AdminOnlyNote,useMe} from './me';
import {PageContainer,PageHeader} from '#components/reach/page';
import {useNavigate,useSearchParams} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {ActorAvatar} from '#components/reach/actor';
import {Tag,stateToneOf} from '#components/reach/tag';
import {GoogleConnection} from './google-connection';
import {KeywordConnection} from './keyword-connection';
import {keywordRequest,type KeywordConnectionState} from './keyword-api';
import {SiteContentConnect} from './site-content-connect';
import {GitHubConnect,type GitHubStatus} from './github-connect';
import {CommunityConnect,type CommunityStatus} from './community-connect';
import {PackagesConnect,type PackagesStatus} from './packages-connect';
import {HackerNewsConnect} from './hackernews-connect';
import {XiaohongshuConnect} from './xiaohongshu-connect';
import {RedditConnect} from './reddit-connect';
import {TrendsConnect} from './trends-connect';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {CompetitorsConnect} from './competitor-watch';
import {YouTubeConnect,type YouTubeStatus} from './youtube-connect';
import {XConnect} from './x-connect';
import {ChatConnect} from './chat-connect';
import {RepoConnect} from './repo-connect';
import {agentRequest,type AgentStatus} from './repo-connect-api';
import {DiscoveryBox} from './discovery-box';
import {HealthPanel,HealthLine,loadHealth,type HealthItem} from './data-health';
import {useProject} from './reach-data';
import {getCatalog,categories,sourceState,getStateLabels,getUseLabels,type CatalogSource,type StatusInput} from './data-sources';
import './reach-workspace.css';
import './strategy/strategy.css';
import './source-connections.css';
type Item={type:string;title:string;url:string;text:string};
type Source={id:string;kind:string;url:string;title:string;capturedAt:string;items:Item[];warnings:string[];status:string;error?:string;previewId?:string};
const call=<T,>(id:number,action:string,body:object={})=>api.action<T>('nrSources',action,{method:'POST',body:{projectId:id,...body},unwrap:'data'});
export default function SourceConnections(){const {project,error:projectError}=useProject(),navigate=useNavigate(),{isAdmin}=useMe();const [sources,setSources]=useState<Source[]>([]),[status,setStatus]=useState<StatusInput>({}),[openId,setOpenId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[loaded,setLoaded]=useState(false),[health,setHealth]=useState<HealthItem[]>([]),[healthKey,setHealthKey]=useState(0);const [bilibiliSavingProject,setBilibiliSavingProject]=useState<number|null>(null);const chatPanel=useOnlineChat();const open=getCatalog().find(source=>source.id===openId)||null;const [params,setParams]=useSearchParams();
 const load=async()=>{if(!project)return;const [list,google,site,keyword,github,community,repo,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu,bilibili,youtube]=await Promise.all([call<{sources:Source[]}>(project.id,'list'),api.action<StatusInput['google']>('nrGoogle','status',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).catch(()=>null),api.action<{pages:number}>('nrSiteContent','summary',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),keywordRequest<KeywordConnectionState>('status').catch(()=>null),api.action<GitHubStatus>('nrGitHub','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<CommunityStatus>('nrCommunity','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),agentRequest<AgentStatus>('status',project.id).catch(()=>null),api.action<PackagesStatus>('nrPackages','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrHackerNews','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrReddit','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrTrends','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrCompetitors','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrX','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<StatusInput['chat']>('nrChat','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<StatusInput['xiaohongshu']>('nrXiaohongshu','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),bilibiliRequest<BilibiliStatus>(project.id,'status').catch(()=>null),api.action<YouTubeStatus>('nrYouTube','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null)]);setSources(list.sources);setStatus({google,publicSources:list.sources,site,keyword,github,community,repo:repo?.repo||null,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu,bilibili,youtube});refreshNavBadges();setHealthKey(k=>k+1);void loadHealth(project.id).then(h=>setHealth(h.items)).catch(()=>undefined);setLoaded(true);};
 useEffect(()=>{void load().catch(()=>setError(() => ($t('sourceConnections.notLoadDataSourceStatus'))));},[project?.id]);
 function run(fn:()=>Promise<void>){setBusy(true);setError('');void fn().catch(e=>setError(() => (e instanceof Error?e.message:$t('common.operationFailedRetry')))).finally(()=>setBusy(false));}
 function show(s:CatalogSource){setError('');setOpenId(s.id);}
 useEffect(()=>{const id=params.get('source'),s=getCatalog().find(x=>x.id===id&&x.availability==='available');if(s&&project){show(s);const p=new URLSearchParams(params);p.delete('source');setParams(p,{replace:true});}},[project?.id]);
 return <PageContainer className="nr-page nr-discovery nr-sources"><PageHeader title={$t('sourceConnections.dataSources')} description={$t('sourceConnections.moreConnectMoreSignalsFind')}/><AdminOnlyNote/>
 {(projectError||error)&&!open&&<p className="nr-error" role="alert">{projectError||error} <Button variant="outline" onClick={()=>run(load)}>{$t('common.retry')}</Button></p>}
 {project&&isAdmin&&<DiscoveryBox key={project.id} projectId={project.id} refreshKey={healthKey} defaultUrl={project.domains?.[0]?`https://${project.domains[0]}`:undefined} open={id=>{const s=getCatalog().find(x=>x.id===id);if(s)show(s);}} onDone={()=>void load().catch(()=>undefined)}/>}
 {project&&<HealthPanel projectId={project.id} canRetry={item=>item.id!=='youtube'||isAdmin} reloadKey={healthKey} onChange={()=>void load().catch(()=>undefined)}/>}
 {!loaded&&!error&&<p role="status">{$t('sourceConnections.checkingDataSources')}</p>}
 {categories.map(cat=><section key={cat.id} className="nr-source-group"><h2>{$t(cat.label)}</h2><div className="nr-source-catalog">{getCatalog().filter(s=>s.category===cat.id).map(s=>{const st=sourceState(s,status);const actionable=s.availability==='available';return <article key={s.id} className="nr-catalog-card" data-source-id={s.id} data-state={st}>
  <div className="nr-catalog-top"><h3>{s.name}</h3><Tag tone={stateToneOf(st)} dot>{getStateLabels()[st]}</Tag></div>
  <p>{s.uses.includes('modify')?$t('sourceConnections.onceConnected'):$t('sourceConnections.onceConnectedFind')}{s.detects}</p><div className="flex flex-wrap gap-1.5" data-uses>{s.uses.map(u=><Tag key={u} tone={u==='modify'?'violet':'grey'}>{getUseLabels()[u]}</Tag>)}</div>{(()=>{const h=health.find(x=>x.id===s.id);return h&&(st==='connected'||st==='partial')?<HealthLine item={h}/>:null;})()}
  <div className='nr-catalog-bottom'><span className='nr-footnote'>{s.signals.join(' · ')}</span>{actionable?!isAdmin?(['xiaohongshu','bilibili','youtube'].includes(s.id)?<Button size='sm' variant='outline' onClick={()=>show(s)}>{$t('common.view')}</Button>:null):<Button size='sm' variant={st==='connected'||st==='done'?'outline':'default'} onClick={()=>show(s)}>{st==='connected'||st==='partial'||(s.id==='xiaohongshu'&&status.xiaohongshu?.connected)?$t('sourceConnections.manage'):$t('common.connect')}</Button>:<span className='nr-footnote'>{s.availability==='soon'?$t('sourceConnections.development'):s.priority}</span>}</div>
 </article>;})}</div></section>)}
 <Sheet open={Boolean(open)} onOpenChange={(o,details)=>{if(!o&&open?.id==='bilibili'&&bilibiliSavingProject===project?.id){details.cancel();return;}if(!o){setOpenId(null);void load().catch(()=>undefined);}}}><SheetContent side="right" className="nr-guide-sheet" showCloseButton={!(open?.id==='bilibili'&&bilibiliSavingProject===project?.id)}>{open&&<><SheetHeader><SheetTitle>{$tj('common.connectValue',{0:open.name})}</SheetTitle></SheetHeader><div className="nr-guide-body">
  <div className="nr-guide-message"><ActorAvatar type="agent" size="default"/><div><p>{open.guide.intro}</p><p className="nr-guide-needs">{$t('sourceConnections.needProvide')}</p><ul>{open.guide.needs.map(n=><li key={n}>{n}</li>)}</ul></div></div>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  <section className='nr-guide-form'>{open.id==='youtube'&&project&&<YouTubeConnect projectId={project.id} readOnly={!isAdmin} onChange={()=>void load()}/>} {open.id==='bilibili'&&project&&<BilibiliConnect projectId={project.id} isAdmin={isAdmin} onChange={()=>void load()} onSavingChange={saving=>setBilibiliSavingProject(current=>saving?project.id:current===project.id?null:current)}/>}{open.id==='xiaohongshu'&&project&&<XiaohongshuConnect key={project.id} projectId={project.id} onChange={()=>void load()}/>}{(open.id==='gsc'||open.id==='ga4')&&project&&<GoogleConnection projectId={String(project.id)}/>}{(open.id==='github'||open.id==='github-traffic'||open.id==='github-discussions')&&project&&<GitHubConnect projectId={project.id} focus={open.id==='github-traffic'||open.id==='github-discussions'?'traffic':'repo'} suggestedUrl={sources.find(x=>x.kind==='github'&&x.status!=='disconnected')?.url} onChange={()=>void load()}/>}{open.id==='site'&&project&&<SiteContentConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='repo'&&project&&<RepoConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='keywords'&&<KeywordConnection/>}{open.id==='discourse'&&project&&<CommunityConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='packages'&&project&&<PackagesConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='mentions'&&project&&<HackerNewsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='reddit'&&project&&<RedditConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='trends'&&project&&<TrendsConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='competitors'&&project&&<CompetitorsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='social'&&project&&<XConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{(open.id==='discord'||open.id==='slack')&&project&&<ChatConnect key={open.id} projectId={project.id} platform={open.id} onChange={()=>void load()}/>}{open.id==='ai-visibility'&&<section className='nr-guide-step'>{status?.keyword?.verifiedAt?<><h3>{$t('sourceConnections.readyUse')}</h3><p>{$t('sourceConnections.dataforseoConnectedCheckBrandMentions')}</p><div className='nr-step-actions'><Button onClick={()=>navigate('/ai-search')}>{$t('sourceConnections.goAiSearch')}</Button></div></>:<><h3>{$t('common.connectDataforseoFirst')}</h3><p>{$t('sourceConnections.aiSearchUsesDataforseoWorks')}</p><div className='nr-step-actions'><Button onClick={()=>{const k=getCatalog().find(x=>x.id==='keywords');if(k)show(k);}}>{$t('common.connectDataforseo')}</Button></div></>}</section>}</section>
  {/* The connection's network sits under its form: a live deployment shows one switch here. */}
  {project&&isAdmin&&<ConnectionNetwork projectId={project.id} source={open.id}/>}
  <section className="nr-guide-ask"><h3>{$t('sourceConnections.questions')}</h3>{project&&<div className="flex flex-wrap gap-2">{open.guide.questions.map(question=><Button key={question} variant="outline" disabled={open.id==='bilibili'&&bilibiliSavingProject===project.id} onClick={()=>{chatPanel.open({draft:question,projectId:String(project.id)});setOpenId(null);}}>{question}</Button>)}</div>}</section>
 </div></>}</SheetContent></Sheet>
 </PageContainer>;
}
