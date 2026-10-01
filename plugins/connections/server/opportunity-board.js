'use strict';
const categories=['optimize','create','conversion','market','unclassified'];
const priorities=['high','medium','low','unrated'];
// A person decides each opportunity: ignore it, or restore it to pending. Older stored values (discussing, snoozed,
// watching) read as undecided; the 机会 page archives whatever is not in the latest analysis.
const statuses=['pending','ignored'];
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const identity=c=>[c.title,c.objective,c.suggestion,c.target||'',c.audience||''].map(normalize).join('\u001f');
function allCards(state){const seen=new Set();return [state.insights,...(state.insightHistory||[])].flatMap(b=>(b?.items||[]).filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}));}
function assessment(v){return {existingId:typeof v.existingId==='string'?v.existingId.slice(0,80):undefined,lifecycle:['window','persistent','watch'].includes(v.lifecycle)?v.lifecycle:(v.confidence==='supported'?'persistent':'watch'),category:categories.includes(v.category)?v.category:'unclassified',priority:priorities.includes(v.priority)?v.priority:'unrated',priorityReason:typeof v.priorityReason==='string'?v.priorityReason.slice(0,1000):'尚未评估优先级',confidence:['supported','verify'].includes(v.confidence)?v.confidence:'verify',effort:['small','medium','large'].includes(v.effort)?v.effort:'unknown',target:typeof v.target==='string'?v.target.slice(0,500):'',audience:typeof v.audience==='string'?v.audience.slice(0,500):'',sources:Array.isArray(v.sources)?[...new Set(v.sources.filter(x=>typeof x==='string'))].slice(0,12):[]};}
function mergeCards(state,cards,now,uuid){const known=allCards(state),matches=new Map(known.map(c=>[identity(c),c]));const seen=new Set();return cards.flatMap(card=>{const key=identity(card);if(seen.has(key))return [];seen.add(key);const hinted=known.find(c=>c.id===card.existingId);const old=matches.get(key)||(hinted&&['objective','target','audience'].every(k=>normalize(hinted[k])===normalize(card[k]))?hinted:null);if(old&&seen.has('id:'+old.id))return [];if(old)seen.add('id:'+old.id);return [{...card,id:old?.id||uuid(),firstSeenAt:old?.firstSeenAt||(old?[...(state.insightHistory||[])].reverse().concat(state.insights||[]).find(b=>b.items?.some(c=>c.id===old.id))?.generatedAt:undefined)||now,updatedAt:now,reviewAt:Number.isFinite(Date.parse(now))?new Date(Date.parse(now)+(card.lifecycle==='window'?7:card.lifecycle==='watch'?7:28)*86400000).toISOString():null,change:old?(old.evidenceText===card.evidenceText&&old.observation===card.observation?'unchanged':'evidence'):'new'}];});}
// Ignored opportunities stay ignored: a new analysis may not bring one back under the same id or the same signals.
const signalSet=c=>(c.signalIds||[]).slice().sort().join('|');
function withoutIgnored(state,items){const ignored=allCards(state).filter(c=>state.opportunityMeta?.[c.id]?.status==='ignored');const ids=new Set(ignored.map(c=>c.id)),sets=new Set(ignored.map(signalSet).filter(Boolean));return items.filter(c=>!ids.has(c.id)&&!(signalSet(c)&&sets.has(signalSet(c))));}
// The 机会 menu count: opportunities first raised by the latest analysis and still undecided (not ignored, not handed off).
function newPending(state){const latest=state?.insights;if(!latest)return 0;const handed=new Set((state.proposals||[]).filter(p=>p.taskId&&p.insight?.id).map(p=>p.insight.id));return (latest.items||[]).filter(c=>c.change==='new'&&state.opportunityMeta?.[c.id]?.status!=='ignored'&&!handed.has(c.id)).length;}
// Opportunity numbers (O-1, O-2 …): given once in order of first appearance and kept for good. Every copy of a card in
// the analysis history carries the same number, so a re-raised opportunity keeps its number. Returns whether it changed.
function number(state){
 const batches=[state.insights,...(state.insightHistory||[])].filter(Boolean),cards=batches.flatMap(b=>b.items||[]);if(!cards.length)return false;
 const known=new Map();for(const c of cards)if(Number.isInteger(c.no)&&c.no>0)known.set(c.id,c.no);
 let next=Math.max(Number.isInteger(state.nextOpportunityNo)?state.nextOpportunityNo:1,...[...known.values()].map(n=>n+1));const start=next;
 const firstSeen=new Map();for(const b of [...batches].reverse())for(const c of b.items||[])if(!firstSeen.has(c.id))firstSeen.set(c.id,c.firstSeenAt||b.generatedAt||'');
 for(const [id] of [...firstSeen].filter(([id])=>!known.has(id)).sort((a,b)=>String(a[1]).localeCompare(String(b[1]))))known.set(id,next++);
 let changed=next!==start||state.nextOpportunityNo!==next;
 for(const c of cards){const n=known.get(c.id);if(c.no!==n){c.no=n;changed=true;}}
 state.nextOpportunityNo=next;return changed;}
module.exports={categories,priorities,statuses,allCards,assessment,mergeCards,withoutIgnored,newPending,number};
