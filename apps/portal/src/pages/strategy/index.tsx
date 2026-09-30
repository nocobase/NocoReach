import {DiscoveryFeed,type Row} from './board';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useParams,useLocation} from 'react-router';
import {Button} from '@/components/ui/button';
import {NocoBaseAIRootProvider,AIChatWindow} from '@/extensions/nocobase-ai/components';
import {AIChatProvider,useAIChat,useAI} from '@/extensions/nocobase-ai/providers';
import {useProject,useUnsavedWarning} from '../reach-data';
import {PageSkeleton} from '../workspace-cache';
import {parseDiscovery,type ActionDraft,type Opportunity,type StrategyState} from './model';
import {StrategyAIService,request,type Context} from './service';
import '../reach-workspace.css';
import './strategy.css';
export default function StrategyPage(){
 const {project,error}=useProject();const {opportunityId}=useParams();const location=useLocation();const scope=opportunityId||(location.pathname.endsWith('/explore')?'explore':'feed');const service=useMemo(()=>project?new StrategyAIService(project.id,scope):null,[project?.id,scope]);
 if(!project||!service)return error?<main className="nr-app nr-discovery"><p role="alert">{error}</p><Button onClick={()=>window.location.reload()}>重新加载</Button></main>:<PageSkeleton title="发现机会"/>;
 return <NocoBaseAIRootProvider key={`${project.id}:${scope}`} service={service}><Workspace key={`${project.id}:${scope}`} projectId={project.id} service={service}/></NocoBaseAIRootProvider>;
}
function Workspace({projectId,service}:{projectId:number;service:StrategyAIService}){
 const [state,setState]=useState<StrategyState>(),[context,setContext]=useState<Context>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError('');const timer=window.setTimeout(()=>{if(active){active=false;setError('读取机会超时，请检查连接后重试。');}},15000);Promise.all([request<StrategyState>(projectId,'state'),request<Context>(projectId,'context')]).then(([s,c])=>{if(active){window.clearTimeout(timer);setState(s);setContext(c);}}).catch(()=>{if(active){window.clearTimeout(timer);setError('无法读取机会工作区，请重试。');}});return()=>{active=false;window.clearTimeout(timer);};},[projectId,attempt]);
 if(!state||!context)return error?<main className="nr-app nr-discovery"><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>重新加载</Button></main>:<PageSkeleton title="发现机会"/>;
 return <AIChatProvider id={`nr-discovery-${projectId}`} defaultEmployee="atlas"><Content projectId={projectId} service={service} state={state} setState={setState} context={context}/></AIChatProvider>;
}
function Content({projectId,service,state,setState,context}:{projectId:number;service:StrategyAIService;state:StrategyState;setState:(s:StrategyState)=>void;context:Context}){
 const navigate=useNavigate(),chat=useAIChat(),ai=useAI();const {opportunityId}=useParams();const location=useLocation();const discussion=Boolean(opportunityId)||location.pathname.endsWith('/explore');
 const selectedBatch=[state.insights,...(state.insightHistory||[])].find(b=>b?.items.some(i=>i.id===opportunityId));
 const selected=selectedBatch?.items.find(i=>i.id===opportunityId)||null;
 const [periodDays,setPeriodDays]=useState(28);
 service.periodDays=periodDays;
 const [drafts,setDrafts]=useState<ActionDraft[]>([]),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [generating,setGenerating]=useState(false),[restored,setRestored]=useState(false),[queued,setQueued]=useState<string|null>(null);
 const pending=useRef(false),booted=useRef(false),catalogSeen=useRef(false),autoStarted=useRef(false),mode=useRef<'insights'|'discussion'>('discussion'),processed=useRef(''),operation=useRef({key:'',id:''});
 service.selectedOpportunity=selected?{...selected,evidence:selectedBatch?.evidence}:null;
 const working=chat.status==='submitted'||chat.status==='streaming';useUnsavedWarning(dirty);
 const reply=[...chat.messages].reverse().find(m=>m.role==='assistant');
 const replyText=reply?.parts.filter(p=>p.type==='text').map(p=>'text' in p?p.text:'').join('\n')||'';
 const candidate=parseDiscovery(replyText),replyKey=reply?`${reply.id}:${replyText}`:'';
 async function mutate(action:string,body:object){const key=JSON.stringify([action,state.revision,body]);if(operation.current.key!==key)operation.current={key,id:crypto.randomUUID()};return request<StrategyState>(projectId,action,{...body,revision:state.revision,requestId:operation.current.id});}
 async function ask(message:string,kind:'insights'|'discussion'='discussion'){
  mode.current=kind;processed.current=replyKey;setError('');
  if(kind==='insights')setGenerating(true);
  chat.setDraft(message);setQueued(message);
 }
 useEffect(()=>{if(queued&&restored&&!chat.messagesLoading&&chat.draft===queued&&chat.canSend&&!working){setQueued(null);void chat.send().catch(()=>{setGenerating(false);setError('AI 请求未完成，已有内容保留。');});}},[queued,chat.draft,chat.canSend,working,restored,chat.messagesLoading]);
 function generate(){if(dirty&&!confirm('更新机会前请确认已保留正在编辑的行动，继续吗？'))return;void ask('请生成首页机会卡片：基于现有数据逐来源审阅，给出 0–12 条有依据的洞察，每条结合数据反馈、依据、限制和行动建议。不要先询问或要求确认统一目标。每条必须填写 category、priority、priorityReason、confidence、effort、lifecycle、target、audience、sources，sources 使用实际来源 ID，正文使用中文指标名。按 insights 和 sourceReviews 结构返回，没有新机会可返回空数组。','insights');}
 useEffect(()=>{
  if(chat.conversationsLoading)catalogSeen.current=true;
  if(!catalogSeen.current||chat.historyError||booted.current||ai.configurationStatus!=='ready'||!chat.canSend||chat.conversationsLoading)return;
  booted.current=true;if(chat.conversations.length)chat.selectConversation(chat.conversations[0].id);setRestored(true);
 },[ai.configurationStatus,chat.canSend,chat.conversationsLoading,chat.conversations]);
 useEffect(()=>{if(!restored||chat.messagesLoading||working||autoStarted.current)return;if(chat.conversations.length&&chat.activeConversationId!==chat.conversations[0].id)return;autoStarted.current=true;if(discussion){if(selected&&!chat.messages.length)void ask(`请围绕选中的机会“${selected.title}”讨论，沿用 selectedOpportunity 的依据和建议，提出可审核行动及独立目标。`);}else if(!state.insights)generate();},[restored,chat.messagesLoading,working,chat.activeConversationId]);
 useEffect(()=>{if(chat.error){setGenerating(false);setError('AI 分析未完成，已有机会和编辑内容保留。可以稍后重试。');}},[chat.error]);
 useEffect(()=>{
  if(working||!reply||processed.current===replyKey||!replyText)return;
  if(mode.current==='insights'&&generating){
   const parsed=parseDiscovery(replyText);if(!parsed?.insights){processed.current=replyKey;setGenerating(false);setError('AI 未返回完整机会卡片。可以展开讨论查看回复，或重新生成。');return;}
   processed.current=replyKey;setBusy(true);pending.current=true;
   void mutate('saveInsights',{insights:parsed.insights,sourceReviews:parsed.sourceReviews,periodDays:service.analyzedPeriodDays,evidenceToken:service.evidenceToken}).then(next=>{setState(next);setNotice('机会已更新。');}).catch(()=>setError('洞察生成成功但保存失败，旧结果仍保留。请刷新保存状态后重试保存。')).finally(()=>{setBusy(false);pending.current=false;setGenerating(false);});
  }else if(mode.current==='discussion'&&candidate?.actions&&!dirty){processed.current=replyKey;setDrafts(candidate.actions.filter(d=>!state.proposals.some(p=>p.taskId&&p.title===d.title&&p.objective===d.objective&&p.brief===d.brief)));}
 },[replyText,working,generating]);
 function choose(card:Opportunity|null){navigate(card?`/home/opportunities/${encodeURIComponent(card.id)}`:'/home/explore');}
 async function confirmAction(draft:ActionDraft,index:number){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{const next=await mutate('confirmDirection',{...draft,insightId:selected?.id||null});setState(next);setDrafts(ds=>ds.filter((_,i)=>i!==index));setDirty(drafts.length>1);setNotice('行动已加入任务，行动目标和机会依据已一并保存。');}catch(e){setError(e instanceof Error?e.message:'确认失败，编辑内容仍保留。');}finally{pending.current=false;setBusy(false);}}
 async function refreshState(){try{setState(await request<StrategyState>(projectId,'state'));setError('');setNotice('已刷新保存状态，编辑内容保留。');}catch{setError('刷新失败，请稍后重试。');}}
 async function review(id:string,change:{priority?:string;status?:string}){if(pending.current)return;pending.current=true;setBusy(true);try{setState(await mutate('reviewOpportunity',{insightId:id,...change}));setError('');}catch{setError('保存调整失败，可能已在其他窗口更新，请刷新保存状态后重试。');}finally{pending.current=false;setBusy(false);}}
 async function openOpportunity(row:Row){if(pending.current)return;if(row.status==='pending'){pending.current=true;setBusy(true);try{setState(await mutate('reviewOpportunity',{insightId:row.card.id,status:'discussing'}));}catch{setError('保存讨论状态失败，请刷新保存状态后重试。');return;}finally{pending.current=false;setBusy(false);}}choose(row.card);}
 const batch=[state.insights,...(state.insightHistory||[])].find(b=>b?.evidence.periodDays===periodDays&&b.evidence.analysisVersion===2);
 if(opportunityId&&!selected)return <main className="nr-app nr-discovery"><Button variant="outline" onClick={()=>navigate('/home')}>← 返回概览</Button><h1>这条机会不存在</h1><p>请到机会库核对记录。原任务不受影响。</p></main>;
 return <main className="nr-app nr-discovery nr-opportunities">
 {!discussion&&<><header className="nr-heading"><div><h1>概览</h1><p className="nr-muted">先看看数据告诉了我们什么，再决定值得做什么。</p></div><div className="nr-discovery-buttons"><Button variant="outline" onClick={()=>navigate('/opportunities')}>查看全部机会 →</Button><Button variant="outline" disabled={working||busy||generating||!chat.canSend} onClick={generate}>{generating?'正在分析…':'更新机会'}</Button><Button variant="outline" disabled={working||busy||!restored||chat.messagesLoading} onClick={()=>choose(null)}>自由探索</Button></div></header>
 <nav className="nr-discovery-buttons" aria-label="深入查看数据"><Button variant="outline" onClick={()=>navigate('/website')}>网站表现</Button><Button variant="outline" onClick={()=>navigate('/seo-opportunities')}>搜索表现</Button><Button variant="outline" onClick={()=>navigate('/research/keywords')}>关键词研究</Button></nav><div className="nr-period-toolbar"><label>观察周期 <select aria-label="观察周期" value={periodDays} disabled={working||busy||generating} onChange={e=>setPeriodDays(Number(e.target.value))}>{[7,28,90].map(d=><option key={d} value={d}>最近 {d} 天</option>)}</select></label><span>与前一个等长周期比较 · 切换后点击“更新机会”分析</span></div>
 <p className="nr-footnote">{batch?`洞察生成于 ${new Date(batch.generatedAt).toLocaleString()} · Google 数据截至 ${batch.evidence.availableThrough||'未知'}`:'该周期暂无已保存分析，点击“更新机会”；已有机会和讨论会保留。'}</p>
 {error&&<p role="alert" className="nr-error">{error} <Button variant="outline" disabled={busy} onClick={()=>void refreshState()}>刷新保存状态</Button>{candidate?.insights&&<Button disabled={busy} onClick={()=>{setBusy(true);void mutate('saveInsights',{insights:candidate.insights,sourceReviews:candidate.sourceReviews,periodDays:service.analyzedPeriodDays,evidenceToken:service.evidenceToken}).then(next=>{setState(next);setError('');setNotice('洞察已保存。');}).catch(()=>setError('保存失败，请刷新保存状态后重试。')).finally(()=>setBusy(false));}}>保存本次洞察</Button>}</p>}
 {notice&&<p role="status" className="nr-success">{notice}</p>}
 {ai.configurationStatus==='ready'&&!ai.hasEnabledModels&&<p role="alert">尚无可用 AI 模型，请在设置中配置后重试。</p>}{!batch&&<section className="nr-panel nr-insight-empty"><h2>{generating||working?'AI 正在发现值得关注的机会':'还没有可展示的机会'}</h2><p>会结合已有数据给出观察、依据与建议。证据不足时会说明限制，不编造机会。</p>{chat.error&&<Button disabled={busy||working} onClick={generate}>重新分析</Button>}</section>}
 {generating&&batch&&<p role="status">正在更新洞察，原有机会保留到新结果准备好。</p>}
 <DiscoveryFeed state={state} busy={busy||working||generating} review={review} open={openOpportunity} periodDays={periodDays}/>
 <details className="nr-discovery-evidence"><summary>数据覆盖与项目背景</summary><p>基于已同步 Google 数据、已保存关键词样本及下方已接入的公开资料。Google Trends 尚未接入。可选择 7、28、90 天窗口，以已同步的完整日为截止；仅当前期与本期覆盖均完整时计算涨跌。同步不是实时，Google 截止仍预留三天延迟。</p>{batch&&<p>本期：{batch.evidence.summary?.web.start || batch.evidence.summary?.search.start || '未知'} — {batch.evidence.availableThrough || '未知'}；对比期：{batch.evidence.summary?.web.previousStart || '未知'} — {batch.evidence.summary?.web.previousEnd || '未知'}。GA4 覆盖 {batch.evidence.summary?.web.days||0}/{periodDays} 天，前期 {batch.evidence.summary?.web.previousDays||0}/{periodDays} 天；搜索覆盖 {batch.evidence.summary?.search.days||0}/{periodDays} 天，前期 {batch.evidence.summary?.search.previousDays||0}/{periodDays} 天。</p>}{batch?.evidence.limitations.map((v,i)=><p key={i}>{v}</p>)}{context.evidence.publicSources?.map(s=><p key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · 采集于 {new Date(s.capturedAt).toLocaleString()} · {s.warnings.join(' ')}</p>)}<p>项目：{String(context.project.name||'')} · 市场：{String(context.project.market||'未设置')} · 受众：{String(context.project.audience||'未设置')}</p><p>历史目标仅作偏好参考，各项行动可有自己的目标。</p><Button variant="link" onClick={()=>navigate('/project')}>维护项目背景 →</Button><Button variant="link" onClick={()=>navigate('/connections')}>查看连接状态 →</Button></details></>}
 {discussion&&<><Button variant="outline" className="nr-back-opportunities" onClick={()=>navigate('/home')}>← 返回概览</Button><Button variant="link" onClick={()=>navigate('/opportunities')}>查看机会库</Button><header className="nr-heading"><div><h1>{selected?.title||'自由探索'}</h1><p className="nr-muted">围绕机会讨论做法，确认后进入任务。</p></div></header>{selected&&<details className="nr-panel"><summary>机会历史与关联任务</summary>{[state.insights,...(state.insightHistory||[])].filter(b=>b?.items.some(c=>c.id===selected.id)).map((b,i)=><div key={i}><strong>{new Date(b!.generatedAt).toLocaleString()}</strong><p>{b!.items.find(c=>c.id===selected.id)?.evidenceText}</p></div>)}{state.proposals.filter(p=>p.taskId&&p.insight?.id===selected.id).map(p=><Button key={p.id} variant="link" onClick={()=>navigate('/actions?task='+p.taskId)}>查看任务：{p.title}</Button>)}</details>}{selected&&<details className="nr-panel"><summary>机会依据与初步建议</summary><p>{selected.observation}</p><p>{selected.evidenceText}</p><p>{selected.suggestion}</p><p className="nr-footnote">{selected.limitation}</p></details>}{error&&<p role="alert" className="nr-error">{error} <Button variant="outline" disabled={busy} onClick={()=>void refreshState()}>刷新保存状态</Button></p>}{notice&&<p role="status" className="nr-success">{notice} <button onClick={()=>navigate('/actions')}>查看任务 →</button></p>}<div id="opportunity-discussion" className="nr-strategy-grid"><section className="nr-panel"><h2>AI 讨论</h2><p className="nr-footnote">{selected?'这条机会的依据和建议会随对话传给 AI。':'从数据出发提问，不必先确定统一目标。'}</p><div className="nr-chat-frame"><AIChatWindow showConversationToggle={false} showEmployeeSelector={false} showUserPrompt={false} placeholder="追问依据、补充想法，或调整行动方向…" disclaimer="每项行动可以有不同目标；确认后才进入任务，不会自动发布。"/></div><Button variant="outline" disabled={working||busy||!chat.canSend} onClick={()=>void ask('请根据这次讨论整理 1–3 个行动，各自包含独立目标、交付物、依据、限制及进展判断方式。按 actions 结构返回。')}>整理为行动建议</Button></section>
 <section className="nr-panel"><h2>这次可以做什么</h2><p className="nr-footnote">目标属于这项行动。你可以修改后确认，不需要修改项目统一目标。</p>{!drafts.length&&<p>{working?'正在形成行动建议…':'讨论后可整理为行动，可以继续补充你的想法。'}</p>}
 {!working&&replyText.includes('"actions"')&&!candidate?.actions&&<p role="status" className="nr-footnote">AI 已回复，但行动格式不完整。请点击“整理为行动建议”重新整理，原讨论保留。</p>}{dirty&&candidate?.actions&&<Button variant="outline" onClick={()=>{if(confirm('替换当前编辑内容为最新 AI 建议？')){setDrafts(candidate.actions!);setDirty(false);}}}>采用最新行动建议</Button>}
 {drafts.map((d,i)=><article className="nr-strategy-proposal" key={i}>{(['title','objective','brief'] as const).map((key,j)=><label className="nr-field" key={key}>{['行动标题','这项行动的目标','行动内容与依据'][j]}<textarea aria-label={['行动标题','这项行动的目标','行动内容与依据'][j]} rows={key==='brief'?7:2} maxLength={key==='title'?200:key==='objective'?1000:20000} value={d[key]} disabled={busy||working} onChange={e=>{setDrafts(ds=>ds.map((x,n)=>n===i?{...x,[key]:e.target.value}:x));setDirty(true);}}/></label>)}<Button disabled={busy||working||!d.title.trim()||!d.objective.trim()||!d.brief.trim()} onClick={()=>void confirmAction(d,i)}>确认并加入任务</Button></article>)}</section></div></>}
 <p className="nr-footnote">当前支持首次分析和手动更新，后台持续观察尚未启用。已确认行动在任务列表继续处理。</p>
 </main>;
}
