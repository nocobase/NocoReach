import { useNavigationGuard } from '@nocobase/app-client';
import { CollectorConnection } from '#components/collector-connection';
import { isCollectorPlatform } from '#lib/collector-platforms';
import {BilibiliConnect} from './bilibili-connect';
import {bilibiliRequest,type BilibiliStatus} from './bilibili-api';
import { ConnectionNetwork } from '#components/connection-network';
import { ConnectionError } from '#components/connection-error';
import { useMessageState, $t, $tj } from '#i18n';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {useSourceAccess} from './source-access';
import {sourceConnection} from './proxy-profiles/api';
import {PageContainer,PageHeader} from '#components/reach/page';
import {useNavigate,useSearchParams} from 'react-router';
import {nocobaseClient as api} from '#lib/nocoreach-api';
import {Button} from '#components/ui/button';
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from '#components/ui/sheet';
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
import {ArticleTargetsConnect} from './article-targets-connect';
import {articleRequest,type TargetList} from './article-targets-api';
import {agentRequest,type AgentStatus} from './repo-connect-api';
import {DiscoveryBox} from './discovery-box';
import {HealthPanel,HealthLine,loadHealth,type HealthItem} from './data-health';
import {useProject} from './reach-data';
import {useWorkspaceCache} from './workspace-cache';
import {collectorReportKey} from './collector-report';
import {getCatalog,categories,sourceState,getStateLabels,getUseLabels,type CatalogSource,type StatusInput} from './data-sources';
import './reach-workspace.css';
import './strategy/strategy.css';
import './source-connections.css';
type Item={type:string;title:string;url:string;text:string};
type Source={id:string;kind:string;url:string;title:string;capturedAt:string;items:Item[];warnings:string[];status:string;error?:string;previewId?:string};
const collectorActions = ['nrCollectors.status','nrCollectors.save'] as const;
const call=<T,>(id:number,action:string,body:object={})=>api.action<T>('nrSources',action,{method:'POST',body:{projectId:id,...body},unwrap:'data'});
export default function SourceConnections(){const {project,error:projectError}=useProject(),navigate=useNavigate();const [sources,setSources]=useState<Source[]>([]),[status,setStatus]=useState<StatusInput>({}),[error,setError]=useMessageState(''),[loaded,setLoaded]=useState(false),[health,setHealth]=useState<HealthItem[]>([]),[healthKey,setHealthKey]=useState(0);const [collectorVersion,setCollectorVersion]=useState(0);const [params,setParams]=useSearchParams();const open=getCatalog().find(source=>source.id===params.get('source')&&source.availability==='available')||null;const collectorPlatform=open&&isCollectorPlatform(open.id)?open.id:null;
 const projectId=project?.id;
 const {can:canManageOpen}=useSourceAccess(open?.id,projectId);
 const {can:canDiscover}=useBusinessAccess('nrDiscovery.discover',projectId??null);
 const {can:canSelectNetwork}=useBusinessAccess('nrProxyProfiles.select',projectId??null);
 const {can:canTestNetwork}=useBusinessAccess('nrProxyProfiles.testConnection',projectId??null);
 const {can:canSelectAllNetworks}=useBusinessAccess('nrProxyProfiles.selectAll');
 const canOpenNetwork=canSelectNetwork||canTestNetwork||canSelectAllNetworks;
 const {can:canSaveCollector}=useBusinessAccess('nrCollectors.save',projectId??null);
 const {can:canConfigureCollector}=useBusinessAccess(collectorActions,projectId??null);
 const savingOwnersRef = useRef(new Set<string>());
 const [connectionSaving, setConnectionSaving] = useState(false);
 useNavigationGuard(() => savingOwnersRef.current.size === 0);
 function setSaving(owner: string, saving: boolean) {
   if (saving) savingOwnersRef.current.add(owner);
   else savingOwnersRef.current.delete(owner);
   setConnectionSaving(savingOwnersRef.current.size > 0);
 }
 const load=useCallback(async()=>{if(!projectId)return;const [list,google,site,keyword,github,community,repo,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu,bilibili,youtube]=await Promise.all([call<{sources:Source[]}>(projectId,'list'),api.action<StatusInput['google']>('nrGoogle','status',{method:'POST',body:{projectId:String(projectId)},unwrap:'data'}).catch(()=>null),api.action<{pages:number}>('nrSiteContent','summary',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),keywordRequest<KeywordConnectionState>('status').catch(()=>null),api.action<GitHubStatus>('nrGitHub','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<CommunityStatus>('nrCommunity','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),agentRequest<AgentStatus>('status',projectId).catch(()=>null),api.action<PackagesStatus>('nrPackages','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrHackerNews','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrReddit','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrTrends','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrCompetitors','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrX','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<StatusInput['chat']>('nrChat','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),api.action<StatusInput['xiaohongshu']>('nrXiaohongshu','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null),bilibiliRequest<BilibiliStatus>(projectId,'status').catch(()=>null),api.action<YouTubeStatus>('nrYouTube','status',{method:'POST',body:{projectId:projectId},unwrap:'data'}).catch(()=>null)]);const articles=await articleRequest<TargetList>('targets',projectId).catch(()=>null);setSources(list.sources);setStatus({google,publicSources:list.sources,site,keyword,github,community,repo:repo?.repo||null,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu,bilibili,youtube,articles:articles?{targets:articles.targets.length}:null});refreshNavBadges();setHealthKey(k=>k+1);void loadHealth(projectId).then(h=>setHealth(h.items)).catch(()=>undefined);setLoaded(true);},[projectId]);
 // Saved collector reports are reused for the day; a change made here makes the data pages read them again.
 const cache=useWorkspaceCache();const collectorChanged=(resource:'nrXiaohongshu'|'nrBilibili'|'nrYouTube',id:number)=>{cache.invalidate(key=>key.startsWith(collectorReportKey(resource,id)));void load();};
 useEffect(()=>{void Promise.resolve().then(load).catch(()=>setError(() => ($t('sourceConnections.notLoadDataSourceStatus'))));},[load,setError]);
 function run(fn:()=>Promise<void>){setError('');void fn().catch(e=>setError(() => (e instanceof Error?e.message:$t('common.operationFailedRetry'))));}
 function closePanel() {
   const source = open?.id;
   const p = new URLSearchParams(params);
   p.delete('source');
   setParams(p);
   void load().catch(() => undefined);
   requestAnimationFrame(() => {
     const trigger = document.querySelector<HTMLElement>(`[data-source-trigger="${source}"]`);
     if (trigger) {
       trigger.focus();
       return;
     }
     const heading = document.querySelector<HTMLElement>('h1');
     if (!heading) return;
     if (!heading.hasAttribute('tabindex')) {
       heading.tabIndex = -1;
       heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
     }
     heading.focus();
   });
 }
 function show(s:CatalogSource){if(savingOwnersRef.current.size)return;setError('');const p=new URLSearchParams(params);p.set('source',s.id);setParams(p);}

 return <PageContainer className='nr-page nr-discovery nr-sources'><PageHeader title={$t('sourceConnections.dataSources')} description={$t('sourceConnections.moreConnectMoreSignalsFind')}/>
 {(projectError||error)&&!open&&<p className='nr-error' role='alert'>{projectError||error} <Button variant='outline' onClick={()=>run(load)}>{$t('common.retry')}</Button></p>}
 {project&&canDiscover&&<DiscoveryBox key={project.id} projectId={project.id} projectName={project.name} refreshKey={healthKey} defaultUrl={project.domains?.[0]?`https://${project.domains[0]}`:undefined} open={id=>{const s=getCatalog().find(x=>x.id===id);if(s)show(s);}} onDone={()=>void load().catch(()=>undefined)}/>}
 {project&&<HealthPanel projectId={project.id} reloadKey={healthKey} onChange={()=>void load().catch(()=>undefined)}/>}
 {!loaded&&!error&&<p role='status'>{$t('sourceConnections.checkingDataSources')}</p>}
 {categories.map(cat=><section key={cat.id} className='nr-source-group'><h2>{$t(cat.label)}</h2><div className='nr-source-catalog'>{getCatalog().filter(s=>s.category===cat.id).map(s=>{const st=sourceState(s,status);const actionable=s.availability==='available';return <article key={s.id} className='nr-catalog-card' data-source-id={s.id} data-state={st}>
  <div className='nr-catalog-top'><h3>{s.name}</h3><Tag tone={stateToneOf(st)} dot>{getStateLabels()[st]}</Tag></div>
  <p>{s.uses.includes('modify')?$t('sourceConnections.onceConnected'):$t('sourceConnections.onceConnectedFind')}{s.detects}</p><div className='flex flex-wrap gap-1.5' data-uses>{s.uses.map(u=><Tag key={u} tone={u==='modify'?'violet':'grey'}>{getUseLabels()[u]}</Tag>)}</div>{(()=>{const h=health.find(x=>x.id===s.id);return h&&(st==='connected'||st==='partial')?<HealthLine item={h}/>:null;})()}
  <div className='nr-catalog-bottom'><span className='nr-footnote'>{s.signals.join(' · ')}</span>{actionable?<SourceAction source={s} projectId={projectId} canOpenNetwork={canOpenNetwork&&Boolean(sourceConnection[s.id])} outlined={st==='connected'||st==='done'} connected={st==='connected'||st==='partial'||(s.id==='xiaohongshu'&&Boolean(status.xiaohongshu?.connected))} onOpen={()=>show(s)}/>:<span className='nr-footnote'>{s.availability==='soon'?$t('sourceConnections.development'):s.priority}</span>}</div>
 </article>;})}</div></section>)}
 <Sheet open={Boolean(open)} onOpenChange={(o,details)=>{if(!o&&savingOwnersRef.current.size){details.cancel();return;}if(!o)closePanel();}}><SheetContent side='right' className='nr-guide-sheet' showCloseButton={!connectionSaving}>{open&&<><SheetHeader><SheetTitle>{$tj('common.connectValue',{0:open.name})}</SheetTitle></SheetHeader><div className='nr-guide-body'>
  {/* The intro describes how the connection works; no AI speaks here, so it carries no Agent avatar. It scrolls with
      the body: only the title stays pinned, since some intros run to several lines. */}
  {open.guide&&<SheetDescription className='leading-relaxed'>{open.guide.intro}</SheetDescription>}
  {open.guide&&<section className='nr-guide-needs'><h3>{$t('sourceConnections.needProvide')}</h3><ul>{open.guide.needs.map(n=><li key={n}>{n}</li>)}</ul></section>}
  {error&&<ConnectionError message={error}/>}
  {project&&canConfigureCollector&&collectorPlatform&&<CollectorConnection onClose={closePanel} projectId={project.id} platform={collectorPlatform} disabled={connectionSaving||!canSaveCollector} onSavingChange={saving=>setSaving(`collector:${project.id}:${open.id}`,saving)} onSaved={()=>{setCollectorVersion(v=>v+1);void load().catch(()=>undefined);}}/>}
  <fieldset disabled={connectionSaving} key={`${project?.id}:${open.id}`} className='min-w-0 shrink-0 border-0 p-0'><section className='nr-guide-form'>{canManageOpen||collectorPlatform?<>{open.id==='youtube'&&project&&<YouTubeConnect projectId={project.id} refreshKey={collectorVersion} readOnly={!canManageOpen} onChange={()=>collectorChanged('nrYouTube',project.id)}/>} {open.id==='bilibili'&&project&&<BilibiliConnect projectId={project.id} refreshKey={collectorVersion} isAdmin={canManageOpen} onChange={()=>collectorChanged('nrBilibili',project.id)} onSavingChange={saving=>setSaving(`bilibili:${project.id}`,saving)}/>}{open.id==='xiaohongshu'&&project&&<XiaohongshuConnect key={project.id} projectId={project.id} refreshKey={collectorVersion} onChange={()=>collectorChanged('nrXiaohongshu',project.id)}/>}{(open.id==='gsc'||open.id==='ga4')&&project&&<GoogleConnection projectId={String(project.id)}/>}{(open.id==='github'||open.id==='github-traffic'||open.id==='github-discussions')&&project&&<GitHubConnect projectId={project.id} focus={open.id==='github-traffic'||open.id==='github-discussions'?'traffic':'repo'} suggestedUrl={sources.find(x=>x.kind==='github'&&x.status!=='disconnected')?.url} onChange={()=>void load()}/>}{open.id==='site'&&project&&<SiteContentConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='repo'&&project&&<RepoConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='articles'&&project&&<ArticleTargetsConnect projectId={project.id} onChange={()=>void load()} onSavingChange={saving=>setSaving(`articles:`,saving)}/>}{open.id==='keywords'&&project&&<KeywordConnection projectId={project.id}/>}{open.id==='discourse'&&project&&<CommunityConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='packages'&&project&&<PackagesConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='mentions'&&project&&<HackerNewsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='reddit'&&project&&<RedditConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='trends'&&project&&<TrendsConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='competitors'&&project&&<CompetitorsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='social'&&project&&<XConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{(open.id==='discord'||open.id==='slack')&&project&&<ChatConnect key={open.id} projectId={project.id} platform={open.id} onChange={()=>void load()}/>}{open.id==='ai-visibility'&&<section className='nr-guide-step'>{status?.keyword?.verifiedAt?<><h3>{$t('sourceConnections.readyUse')}</h3><p>{$t('sourceConnections.dataforseoConnectedCheckBrandMentions')}</p><div className='nr-step-actions'><Button onClick={()=>void navigate('/ai-search')}>{$t('sourceConnections.goAiSearch')}</Button></div></>:<><h3>{$t('common.connectDataforseoFirst')}</h3><p>{$t('sourceConnections.aiSearchUsesDataforseoWorks')}</p><div className='nr-step-actions'><Button onClick={()=>{const k=getCatalog().find(x=>x.id==='keywords');if(k)show(k);}}>{$t('common.connectDataforseo')}</Button></div></>}</section>}</>:<p>{$t('accessMembers.errors.denied')}</p>}</section>
  </fieldset>
  {/* The connection's network sits under its form: a live deployment shows one switch here. */}
  {project&&canOpenNetwork&&<ConnectionNetwork projectId={project.id} source={open.id}/>}
 </div></>}</SheetContent></Sheet>
 </PageContainer>;
}

function SourceAction({source,projectId,canOpenNetwork,outlined,connected,onOpen}:{source:CatalogSource;projectId:number|undefined;canOpenNetwork:boolean;outlined:boolean;connected:boolean;onOpen:()=>void}){
 const {can}=useSourceAccess(source.id,projectId);
 if(!can)return canOpenNetwork||isCollectorPlatform(source.id)?<Button size='sm' variant='outline' data-source-trigger={source.id} onClick={onOpen}>{$t('common.view')}</Button>:null;
 return <Button size='sm' variant={outlined?'outline':'default'} data-source-trigger={source.id} onClick={onOpen}>{$t(connected?'sourceConnections.manage':'common.connect')}</Button>;
}
