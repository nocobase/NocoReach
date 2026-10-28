// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/language.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { languageOf, forLanguage } from '../../server/nocoreach/language.js';
import { styleIssues, promptFor, DailyAnalysis } from '../../server/nocoreach/daily-analysis.js';
import { Projects } from '../../server/nocoreach/projects.js';
const test=__vitest_test;

test('a project writes in its own language, Chinese when unset; every other language gets a note on every prompt',()=>{
 assert.equal(languageOf({}),'zh-CN');assert.equal(languageOf(null),'zh-CN');assert.equal(languageOf({language:'en-US'}),'en-US');assert.equal(languageOf({language:'fr'}),'zh-CN');
 assert.equal(languageOf({language:'ko-KR'}),'ko-KR');assert.equal(languageOf({language:'ru-RU'}),'ru-RU');
 assert.match(forLanguage('x','ko-KR'),/in Korean:/);assert.match(forLanguage('x','ru-RU'),/in Russian:/);
 assert.equal(languageOf({language:'ja-JP'}),'ja-JP');assert.equal(languageOf({language:'id-ID'}),'id-ID');
 assert.match(forLanguage('x','ja-JP'),/write every text meant for people in Japanese:/);assert.match(forLanguage('x','zh-TW'),/in Traditional Chinese:/);assert.match(forLanguage('x','pt-BR'),/in Brazilian Portuguese:/);
 // The English note reads as it did before the other languages were added.
 assert.equal(forLanguage('x','en-US'),forLanguage('x','de-DE').replace('in German:','in English:'));
 assert.equal(forLanguage('写摘要。','zh-CN'),'写摘要。');
 const en=forLanguage('写摘要，使用中文。','en-US');assert.match(en,/^写摘要，使用中文。/);assert.match(en,/in English/);assert.match(en,/overrides any instruction above to write in Chinese/);
 // The analysis adds the English writing rules too; the other prompts only the language.
 assert.match(promptFor('x','en-US',true),/at most 60 characters/);assert.doesNotMatch(promptFor('x','en-US'),/60 characters/);assert.equal(promptFor('x','zh-CN',true),'x');
 // Other character-counted languages get the same limits without English examples; Chinese and Japanese keep the
 // width rules with their own vague words.
 const de=promptFor('x','de-DE',true);assert.match(de,/For this German project/);assert.match(de,/at most 60 characters/);assert.doesNotMatch(de,/pricing page/);
 const ja=promptFor('x','ja-JP',true);assert.match(ja,/For this Japanese project/);assert.match(ja,/最適化/);assert.doesNotMatch(ja,/60 characters/);
 assert.match(promptFor('x','zh-TW',true),/最佳化/);
});

test('the Opportunities writing rules in English: 60 characters, no vague verbs, a reason with a number, two sentences',()=>{
 const good={title:'Add a trial CTA to the pricing page',reason:'5,848 impressions but only 0.4% CTR',suggestion:'Add a button under the plans. Link it to the trial form.'};
 assert.deepEqual(styleIssues(good,'en-US'),[]);
 assert.deepEqual(styleIssues({...good,title:'Optimize the click-through rate and ranking of the AI agent docs pages for non-English readers'},'en-US'),['title over 60 characters','title uses "Optimize"']);
 assert.deepEqual(styleIssues({...good,reason:'CTR is low'},'en-US'),['reason has no number']);
 assert.deepEqual(styleIssues({...good,suggestion:'One. Two. Three.'},'en-US'),['suggestion over two sentences']);
 // Chinese rules unchanged for Chinese projects.
 assert.deepEqual(styleIssues({...good,title:'给商业页加试用入口',reason:'曝光 5,848，点击率只有 0.4%'}),[]);
});

test('character-counted languages share the English limits; vague verbs are only checked in English',()=>{
 const good={title:'Optimieren Sie die Preisseite mit einem Testbutton',reason:'5.848 Impressionen, aber nur 0,4 % CTR',suggestion:'Fügen Sie einen Button hinzu. Verlinken Sie das Formular.'};
 assert.deepEqual(styleIssues(good,'de-DE'),[]);
 assert.deepEqual(styleIssues({...good,title:'x'.repeat(61),reason:'Die Klickrate ist niedrig'},'de-DE'),['title over 60 characters','reason has no number']);
 assert.deepEqual(styleIssues({...good,suggestion:'Eins. Zwei. Drei.'},'vi-VN'),['suggestion over two sentences']);
});

test('Traditional Chinese and Japanese keep the width rules with vague words in their own language',()=>{
 const good={title:'料金ページに試用ボタンを追加',reason:'表示 5,848 回でクリック率 0.4%',suggestion:'プランの下にボタンを置く。試用フォームにリンクする。'};
 assert.deepEqual(styleIssues(good,'ja-JP'),[]);
 assert.deepEqual(styleIssues({...good,title:'料金ページを最適化'},'ja-JP'),['title 用了“最適化”']);
 assert.deepEqual(styleIssues({...good,title:'ドキュメントページのクリック率と検索順位を全体的に見直す'},'ja-JP'),['title 超过 18 字']);
 assert.deepEqual(styleIssues({title:'最佳化定價頁',reason:'曝光 5,848，點擊率只有 0.4%',suggestion:'加按鈕。'},'zh-TW'),['title 用了“最佳化”']);
});

test('the daily analysis asks in the project language',async()=>{
 const calls=[];const rows={};const repo={findOne:async({filter})=>rows[filter.key]?{id:filter.key,get:()=>rows[filter.key]}:null,update:async({filterByTk,values})=>{rows[filterByTk]=values.payload;},create:async({values})=>{rows[values.key]=values.payload;}};
 const strategy={context:async()=>({project:{name:'p'},evidence:{signals:{items:[{key:'k'}]},publicSources:[]}}),state:async()=>({revision:1,proposals:[]}),saveInsights:async(id,v)=>({insights:{items:v.insights,observations:v.observations}})};
 const plugin={strategy,project:async()=>({id:1,language:'en-US'}),db:{getRepository:()=>repo},app:{on:()=>{},logger:{warn:()=>{}}}};
 const a=new DailyAnalysis(plugin,async(system)=>{calls.push(system);return {text:'{"observations":["Search clicks fell 12%."],"insights":[]}',model:'m'};});
 const r=await a.run('1','manual');assert.equal(r.ok,true);assert.match(calls[0],/in English/);assert.match(calls[0],/at most 60 characters/);
});

test('a project is created with its language and the language can be changed later',async()=>{
 const rows=[];let seq=1;const wrap=r=>r&&{id:r.id,get:k=>structuredClone(r[k])};const match=(r,f)=>typeof f.key==='string'?r.key===f.key:r.key.startsWith('project:');
 const repo={findOne:async({filter})=>wrap(rows.find(r=>match(r,filter))),find:async({filter})=>rows.filter(r=>match(r,filter)).map(wrap),create:async({values})=>{rows.push({id:seq++,...structuredClone(values)});},update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),structuredClone(values));}};
 const p=new Projects({db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}});
 assert.equal((await p.create({name:'Acme',domain:'acme.dev',language:'en-US'})).language,'en-US');
 assert.equal((await p.create({name:'Beta',domain:'beta.dev',language:'xx'})).language,'zh-CN');
 assert.equal((await p.edit('2',{language:'en-US'})).language,'en-US');assert.equal((await p.get('2')).language,'en-US');
 await assert.rejects(p.edit('2',{language:'de'}),/列表中的语言/);
 assert.equal((await p.edit('2',{language:'ja-JP'})).language,'ja-JP');assert.equal((await p.create({name:'Gamma',domain:'gamma.dev',language:'fr-FR'})).language,'fr-FR');
});
