'use strict';
// The language of a project's AI-written content (2026-10-07, user choice): one per project, chosen when it is created
// (defaulting to the creator's UI language) and changeable in 项目知识. Chinese unless set to English, so projects made
// before keep working as they did. The prompts stay in Chinese; for an English project a note at the end asks for
// English and overrides the prompt's own "使用中文".
const LANGUAGES=['zh-CN','en-US'];
const languageOf=project=>project&&project.language==='en-US'?'en-US':'zh-CN';
const NOTE=`

Language: write every text meant for people in English: titles, reasons, observations, suggestions, summaries, reports, plans and memory lines. This overrides any instruction above to write in Chinese. The input may be in Chinese; read it as it is. Keep product names, URLs, code and quoted page text unchanged. In JSON keep the keys and the fixed values (such as do, watch, skip, optimize) as specified, and quote inside strings with single quotes or ‘ ’, never unescaped double quotes.`;
const forLanguage=(prompt,language)=>language==='en-US'?`${prompt}${NOTE}`:prompt;
module.exports={LANGUAGES,languageOf,forLanguage};
