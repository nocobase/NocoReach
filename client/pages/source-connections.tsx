import { request as strategyRequest, type Context } from './strategy/service';
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { ConnectionNetwork } from "#components/connection-network";
import { $t, $tj } from "#i18n";
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
import {XConnect} from './x-connect';
import {ChatConnect} from './chat-connect';
import {RepoConnect} from './repo-connect';
import {agentRequest,type AgentStatus} from './repo-connect-api';
import {DiscoveryBox} from './discovery-box';
import {HealthPanel,HealthLine,loadHealth,type HealthItem} from './data-health';
import {useProject} from './reach-data';
import {catalog,categories,sourceState,stateLabels,useLabels,type CatalogSource,type StatusInput} from './data-sources';
import './reach-workspace.css';
import './strategy/strategy.css';
import './source-connections.css';
type Item={type:string;title:string;url:string;text:string};
type Source={id:string;kind:string;url:string;title:string;capturedAt:string;items:Item[];warnings:string[];status:string;error?:string;previewId?:string};
const call=<T,>(id:number,action:string,body:object={})=>api.action<T>('nrSources',action,{method:'POST',body:{projectId:id,...body},unwrap:'data'});
export default function SourceConnections(){const {project,error:projectError}=useProject(),navigate=useNavigate(),{isAdmin}=useMe();const [sources,setSources]=useState<Source[]>([]),[status,setStatus]=useState<StatusInput>({}),[open,setOpen]=useState<CatalogSource|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[health,setHealth]=useState<HealthItem[]>([]),[healthKey,setHealthKey]=useState(0);const chatPanel=useChatPanel();const [params,setParams]=useSearchParams();
 const load=async()=>{if(!project)return;const [list,google,site,keyword,github,community,repo,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu]=await Promise.all([call<{sources:Source[]}>(project.id,'list'),api.action<StatusInput['google']>('nrGoogle','status',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).catch(()=>null),api.action<{pages:number}>('nrSiteContent','summary',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),keywordRequest<KeywordConnectionState>('status').catch(()=>null),api.action<GitHubStatus>('nrGitHub','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<CommunityStatus>('nrCommunity','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),agentRequest<AgentStatus>('status',project.id).catch(()=>null),api.action<PackagesStatus>('nrPackages','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrHackerNews','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrReddit','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrTrends','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrCompetitors','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<{connected:boolean}>('nrX','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<StatusInput['chat']>('nrChat','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null),api.action<StatusInput['xiaohongshu']>('nrXiaohongshu','status',{method:'POST',body:{projectId:project.id},unwrap:'data'}).catch(()=>null)]);setSources(list.sources);setStatus({google,publicSources:list.sources,site,keyword,github,community,repo:repo?.repo||null,packages,hackernews,reddit,trends,competitors,x,chat,xiaohongshu});refreshNavBadges();setHealthKey(k=>k+1);void loadHealth(project.id).then(h=>setHealth(h.items)).catch(()=>undefined);setLoaded(true);};
 useEffect(()=>{void load().catch(()=>setError($t("读取数据源状态失败，请重试。")));},[project?.id]);
 function run(fn:()=>Promise<void>){setBusy(true);setError('');void fn().catch(e=>setError(e instanceof Error?e.message:$t("操作未完成，请重试。"))).finally(()=>setBusy(false));}
 function show(s:CatalogSource){setError('');setOpen(s);}
 useEffect(()=>{const id=params.get('source'),s=catalog.find(x=>x.id===id&&x.availability==='available');if(s&&project){show(s);const p=new URLSearchParams(params);p.delete('source');setParams(p,{replace:true});}},[project?.id]);
 return <PageContainer className="nr-page nr-discovery nr-sources"><PageHeader title={$t("数据接入")} description={$t("接入越多，能发现的信号越多。")}/><AdminOnlyNote/>
 {(projectError||error)&&!open&&<p className="nr-error" role="alert">{projectError||error} <Button variant="outline" onClick={()=>run(load)}>{$t("重试")}</Button></p>}
 {project&&isAdmin&&<DiscoveryBox projectId={project.id} open={id=>{const s=catalog.find(x=>x.id===id);if(s)show(s);}} onDone={()=>void load().catch(()=>undefined)}/>}
 {project&&<HealthPanel projectId={project.id} reloadKey={healthKey} onChange={()=>void load().catch(()=>undefined)}/>}
 {!loaded&&!error&&<p role="status">{$t("正在检查数据源…")}</p>}
 {categories.map(cat=><section key={cat} className="nr-source-group"><h2>{$t(cat)}</h2><div className="nr-source-catalog">{catalog.filter(s=>s.category===cat).map(s=>{const st=sourceState(s,status);const actionable=s.availability==='available';return <article key={s.id} className="nr-catalog-card" data-source-id={s.id} data-state={st}>
  <div className="nr-catalog-top"><h3>{s.name}</h3><Tag tone={stateToneOf(st)} dot>{stateLabels[st]}</Tag></div>
  <p>{s.uses.includes('modify')?$t("接入后："):$t("接入后能发现：")}{s.detects}</p><div className="flex flex-wrap gap-1.5" data-uses>{s.uses.map(u=><Tag key={u} tone={u==='modify'?'violet':'grey'}>{useLabels[u]}</Tag>)}</div>{(()=>{const h=health.find(x=>x.id===s.id);return h&&(st==='connected'||st==='partial')?<HealthLine item={h}/>:null;})()}
  <div className="nr-catalog-bottom"><span className="nr-footnote">{s.signals.join(' · ')}</span>{actionable?!isAdmin?(s.id==='xiaohongshu'?<Button size="sm" variant="outline" onClick={()=>show(s)}>{$t("查看")}</Button>:null):<Button size="sm" variant={st==='connected'||st==='done'?'outline':'default'} onClick={()=>show(s)}>{st==='connected'||st==='partial'||(s.id==='xiaohongshu'&&status.xiaohongshu?.connected)?$t("管理"):$t("接入")}</Button>:<span className="nr-footnote">{s.availability==='soon'?$t("开发中"):s.priority}</span>}</div>
 </article>;})}</div></section>)}
 <Sheet open={Boolean(open)} onOpenChange={o=>{if(!o){setOpen(null);void load().catch(()=>undefined);}}}><SheetContent side="right" className="nr-guide-sheet">{open&&<><SheetHeader><SheetTitle>{$tj("接入 {0}",{0:open.name})}</SheetTitle></SheetHeader><div className="nr-guide-body">
  <div className="nr-guide-message"><ActorAvatar type="agent" size="default"/><div><p>{open.guide.intro}</p><p className="nr-guide-needs">{$t("需要你提供：")}</p><ul>{open.guide.needs.map(n=><li key={n}>{n}</li>)}</ul></div></div>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  {project&&isAdmin&&open.id!=='xiaohongshu'&&<ConnectionNetwork projectId={project.id} source={open.id}/>}
  <section className="nr-guide-form">{open.id==='xiaohongshu'&&project&&<XiaohongshuConnect key={project.id} projectId={project.id} onChange={()=>void load()}/>}{(open.id==='gsc'||open.id==='ga4')&&project&&<GoogleConnection projectId={String(project.id)}/>}{(open.id==='github'||open.id==='github-traffic'||open.id==='github-discussions')&&project&&<GitHubConnect projectId={project.id} focus={open.id==='github-traffic'||open.id==='github-discussions'?'traffic':'repo'} suggestedUrl={sources.find(x=>x.kind==='github'&&x.status!=='disconnected')?.url} onChange={()=>void load()}/>}{open.id==='site'&&project&&<SiteContentConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='repo'&&project&&<RepoConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='keywords'&&<KeywordConnection/>}{open.id==='discourse'&&project&&<CommunityConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='packages'&&project&&<PackagesConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='mentions'&&project&&<HackerNewsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='reddit'&&project&&<RedditConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='trends'&&project&&<TrendsConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{open.id==='competitors'&&project&&<CompetitorsConnect projectId={project.id} onChange={()=>void load()}/>}{open.id==='social'&&project&&<XConnect projectId={project.id} suggested={project.name} onChange={()=>void load()}/>}{(open.id==='discord'||open.id==='slack')&&project&&<ChatConnect key={open.id} projectId={project.id} platform={open.id} onChange={()=>void load()}/>}{open.id==='ai-visibility'&&<section className="nr-guide-step">{status?.keyword?.verifiedAt?<><h3>{$t("可以用了")}</h3><p>{$t("DataForSEO 已接入，在“搜索 → AI 搜索”里查品牌提及或问 AI。")}</p><div className="nr-step-actions"><Button onClick={()=>navigate('/ai-search')}>{$t("去 AI 搜索")}</Button></div></>:<><h3>{$t("先接入 DataForSEO")}</h3><p>{$t("AI 搜索用 DataForSEO 查，接好后就能用。")}</p><div className="nr-step-actions"><Button onClick={()=>{const k=catalog.find(x=>x.id==='keywords');if(k)show(k);}}>{$t("接入 DataForSEO")}</Button></div></>}</section>}</section>
  <section className="nr-guide-ask"><h3>{$t("还有疑问？")}</h3>{project&&<div className="flex flex-wrap gap-2">{open.guide.questions.map(question=><Button key={question} variant="outline" onClick={async()=>{try{const context=await strategyRequest<Context>(project.id,'context');chatPanel.openChat({conversationId:null,draft:question+'\n\n'+$t('项目资料（仅作为参考）')+'\n'+JSON.stringify({project:context.project,evidence:context.evidence}).slice(0,30000),pin:{kind:'nocoreachProject',id:String(project.id),label:project.name}});setOpen(null);}catch{setError($t('项目资料读取失败，请重试'));}}}>{question}</Button>)}</div>}</section>
 </div></>}</SheetContent></Sheet>
 </PageContainer>;
}
