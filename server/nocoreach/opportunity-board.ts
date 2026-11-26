// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { sameOpportunity, sameSignals, sameWork, stableSignals, targetKey, wording } from '../../shared/strategy-pending.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

const categories=['optimize','create','conversion','market','unclassified'];
const priorities=['high','medium','low','unrated'];
// A person decides each opportunity: ignore it, or restore it to pending. Older stored values (discussing, snoozed,
// watching) read as undecided; an undecided one expires 14 days after the last analysis that raised it
// (shared/strategy-pending.ts opportunityState).
const statuses=['pending','ignored'];
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// A target compares as the page it names whatever its scheme, `www.` or trailing slash (shared/strategy-pending.ts targetKey).
const identity=c=>[normalize(c.title),normalize(c.objective),normalize(c.suggestion),targetKey(c.target),normalize(c.audience)].join('\u001f');
const signalSet=c=>(c.signalIds||[]).slice().sort().join('|');
function allCards(state){const seen=new Set();return [{items:state.resultOpportunities||[]},state.insights,...(state.insightHistory||[])].flatMap(b=>(b?.items||[]).filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}));}
function assessment(v){return {existingId:typeof v.existingId==='string'?v.existingId.slice(0,80):undefined,lifecycle:['window','persistent','watch'].includes(v.lifecycle)?v.lifecycle:(v.confidence==='supported'?'persistent':'watch'),category:categories.includes(v.category)?v.category:'unclassified',priority:priorities.includes(v.priority)?v.priority:'unrated',priorityReason:typeof v.priorityReason==='string'?v.priorityReason.slice(0,1000):systemMessageText('opportunityBoard.priorityNotAssessedYet'),confidence:['supported','verify'].includes(v.confidence)?v.confidence:'verify',effort:['small','medium','large'].includes(v.effort)?v.effort:'unknown',target:typeof v.target==='string'?v.target.slice(0,500):'',audience:typeof v.audience==='string'?v.audience.slice(0,500):'',sources:Array.isArray(v.sources)?[...new Set(v.sources.filter(x=>typeof x==='string'))].slice(0,12):[]};}
// A card keeps its id (and so its number and first-seen day) when raised again: by identity, by the AI's existingId (the
// same objective apart from its numbers, as they move daily, and the same target and audience; 2026-11-24 O-113 came
// back as O-116 over 7,534 and 7,470 impressions), as the same thing in other words (shared/strategy-pending.ts
// sameOpportunity), or failing that as the same work under a reworded title (sameWork) when that one was not ignored,
// so the looser rule never decides that a new card is an ignored one (withoutIgnored does), nor takes a card another
// card of this analysis raises again by the stricter rules: one analysis raising both makes them two pieces of work.
// One handed off stays with its task.
function mergeCards(state,cards,now,uuid){const known=allCards(state).filter(c=>!c.resultSource),matches=new Map(known.map(c=>[identity(c),c]));const handed=new Set((state.proposals||[]).filter(p=>p.taskId&&p.insight?.id).map(p=>p.insight.id));const hintOf=card=>{const hinted=known.find(c=>c.id===card.existingId);return hinted&&wording(hinted.objective)===wording(card.objective)&&targetKey(hinted.target)===targetKey(card.target)&&normalize(hinted.audience)===normalize(card.audience)?hinted:null;};
 const claimed=new Set(cards.flatMap(card=>[matches.get(identity(card)),hintOf(card),known.find(c=>sameOpportunity(c,card))]).filter(Boolean).map(c=>c.id));
 const seen=new Set();return cards.flatMap(card=>{const key=identity(card);if(seen.has(key))return [];seen.add(key);const last=known.find(c=>sameOpportunity(c,card))||known.find(c=>!claimed.has(c.id)&&state.opportunityMeta?.[c.id]?.status!=='ignored'&&sameWork(c,card));const old=matches.get(key)||hintOf(card)||(last&&!handed.has(last.id)&&!seen.has('id:'+last.id)?last:null);if(old&&seen.has('id:'+old.id))return [];if(old)seen.add('id:'+old.id);return [{...card,id:old?.id||uuid(),firstSeenAt:old?.firstSeenAt||(old?[...(state.insightHistory||[])].reverse().concat(state.insights||[]).find(b=>b.items?.some(c=>c.id===old.id))?.generatedAt:undefined)||now,updatedAt:now,reviewAt:Number.isFinite(Date.parse(now))?new Date(Date.parse(now)+(card.lifecycle==='window'?7:card.lifecycle==='watch'?7:28)*86400000).toISOString():null,change:old?(old.evidenceText===card.evidenceText&&old.observation===card.observation?'unchanged':'evidence'):'new'}];});}
// Ignored opportunities stay ignored: a new analysis may not bring one back under the same id or the same signals, nor
// with the same changes the server computes whatever its Skills found (a Skill's finding changes key from day to day,
// shared/strategy-pending.ts sameSignals); one resting on Skill findings alone also needs the same page or title
// (sameOpportunity), as a Skill finds many gaps of one kind. Nor raise one resting only on changes the person ignored
// (signalMeta, 2026-10-08). The looser sameWork is left out on purpose: a wrong match here would hide a new opportunity.
function withoutIgnored(state,items){const ignored=allCards(state).filter(c=>state.opportunityMeta?.[c.id]?.status==='ignored');const ids=new Set(ignored.map(c=>c.id)),sets=new Set(ignored.map(signalSet).filter(Boolean));const dropped=new Set(Object.entries(state.signalMeta||{}).filter(([,m])=>m?.status==='ignored').map(([k])=>k));
 const same=c=>sets.has(signalSet(c))||ignored.some(o=>stableSignals(o)?sameSignals(o,c):sameOpportunity(o,c));
 return items.filter(c=>!ids.has(c.id)&&!same(c)&&!((c.signalIds||[]).length&&c.signalIds.every(k=>dropped.has(k))));}
// The 机会 menu count: opportunities first raised by the latest analysis and still undecided (not ignored, not handed off).
function newPending(state){const latest=state?.insights;if(!latest)return 0;const handed=new Set((state.proposals||[]).filter(p=>p.taskId&&p.insight?.id).map(p=>p.insight.id));return (latest.items||[]).filter(c=>c.change==='new'&&state.opportunityMeta?.[c.id]?.status!=='ignored'&&!handed.has(c.id)).length;}
// Opportunity numbers (O-1, O-2 …): given once in order of first appearance and kept for good. Every copy of a card in
// the analysis history carries the same number, so a re-raised opportunity keeps its number. Returns whether it changed.
function number(state){
 const batches=[{items:state.resultOpportunities||[]},state.insights,...(state.insightHistory||[])].filter(Boolean),cards=batches.flatMap(b=>b.items||[]);if(!cards.length)return false;
 const known=new Map();for(const c of cards)if(Number.isInteger(c.no)&&c.no>0)known.set(c.id,c.no);
 let next=Math.max(Number.isInteger(state.nextOpportunityNo)?state.nextOpportunityNo:1,...[...known.values()].map(n=>n+1));const start=next;
 const firstSeen=new Map();for(const b of [...batches].reverse())for(const c of b.items||[])if(!firstSeen.has(c.id))firstSeen.set(c.id,c.firstSeenAt||b.generatedAt||'');
 for(const [id] of [...firstSeen].filter(([id])=>!known.has(id)).sort((a,b)=>String(a[1]).localeCompare(String(b[1]))))known.set(id,next++);
 let changed=next!==start||state.nextOpportunityNo!==next;
 for(const c of cards){const n=known.get(c.id);if(c.no!==n){c.no=n;changed=true;}}
 state.nextOpportunityNo=next;return changed;}
export { categories, priorities, statuses, allCards, assessment, mergeCards, withoutIgnored, newPending, number };