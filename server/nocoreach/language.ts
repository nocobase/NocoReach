// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { supportedLocales } from '../../shared/i18n/locales.js';

// The language of a project's AI-written content (2026-10-07, user choice): one per project, chosen when it is created
// (the creator's UI language to start with) and changeable in Project knowledge. Any UI language can be chosen
// (2026-10-24); a project without one writes Chinese, as projects made before did. The prompts stay in Chinese; for any
// other language a note at the end names it and overrides the prompt's own instruction to write Chinese.
const LANGUAGES=[...supportedLocales];
// How the note names each language to the model.
const NAMES={'en-US':'English','zh-TW':'Traditional Chinese','ja-JP':'Japanese','es-ES':'Spanish','pt-BR':'Brazilian Portuguese','fr-FR':'French','de-DE':'German','vi-VN':'Vietnamese','id-ID':'Indonesian','ko-KR':'Korean','ru-RU':'Russian'};
const languageOf=project=>project&&LANGUAGES.includes(project.language)?project.language:'zh-CN';
const note=name=>`

Language: write every text meant for people in ${name}: titles, reasons, observations, suggestions, summaries, reports, plans and memory lines. This overrides any instruction above to write in Chinese. The input may be in Chinese; read it as it is. Keep product names, URLs, code and quoted page text unchanged. In JSON keep the keys and the fixed values (such as do, watch, skip, optimize) as specified, and quote inside strings with single quotes or ‘ ’, never unescaped double quotes.`;
const forLanguage=(prompt,language)=>NAMES[language]?`${prompt}${note(NAMES[language])}`:prompt;
export { LANGUAGES, NAMES as LANGUAGE_NAMES, languageOf, forLanguage };
