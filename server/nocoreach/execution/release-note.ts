import { systemMessageText } from '../../../shared/i18n/messages.js';

// What a published article's record says was done (Results › What was done, the task's receipt). The owner's own note
// wins; otherwise the approved primary-language version's `release` sentence, then a line the system writes for the
// languages the task translated or updated, then the task title. 2026-11-04 (T-33, T-52): the record copied the
// Agent's summary for the reviewer, "awaiting human review" included, and with several languages only the last step's
// summary, about translating.

// Sentences written for the reviewer rather than the record: the review itself, steps still to come and notes asking
// someone to look at something. Phrases only, never single words, so an article about approvals keeps its own.
const FOR_REVIEWER = [
  /(等待|等候|待)(人工)?(审核|审阅|确认)/,
  /(审核|审阅)通过(之后|以后|后)/,
  /(审核|审阅)(之后|以后|后)再/,
  /(提交|交给你|交由你|供你|供您|请你|请您)(审核|审阅|确认)/,
  /送审/,
  /翻译阶段/,
  /(需|需要|请)人?留意/,
  /建议后续/,
  /\b(awaiting|pending|ready for|submitted for|up for|for your) (human |manual )?(review|approval)\b/i,
  /\bonce (it is |it's |this is )?(reviewed|approved)\b/i,
  /\bafter (review|approval)\b/i,
  /\bplease (review|check)\b/i,
];
// Lead-ins that answer the reviewer ("Per your feedback, …"): dropped, and the rest of the sentence kept.
const LEAD_IN = [
  /^(按|根据|按照|依照)(你|您)?(的)?(审核)?(意见|反馈|要求|建议)[，,：:]?\s*/,
  /^(按|根据|按照|依照)任务(的)?要求[，,：:]?\s*/,
  /^(as requested|as you asked|per your (feedback|comments?|request)|following your (feedback|comments?)|based on your feedback)[,:]?\s*/i,
];
const CJK = /[぀-ヿ㐀-鿿]/;
const OPEN = '“「『（(‘',
  CLOSE = '”」』）)’';

/**
 * The text in sentences, cut after 。！？, a full stop followed by a space, or a line break, outside quotes and brackets;
 * each keeps its ending and the white space after it. Never in clauses: what follows a dropped clause is usually more
 * of the same note to the reviewer.
 */
function segments(text: string): string[] {
  const out: string[] = [];
  let depth = 0,
    plain = false,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') plain = !plain;
    else if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    const open = depth > 0 || plain;
    const end =
      c === '\n' ||
      (!open && '。！？'.includes(c)) ||
      (!open &&
        '.!?'.includes(c) &&
        (i + 1 === text.length || /\s/.test(text[i + 1])));
    if (!end) continue;
    let j = i + 1;
    while (j < text.length && /[ \t\n]/.test(text[j])) j++;
    out.push(text.slice(start, j));
    start = j;
    i = j - 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** The Agent's text for the record: without the sentences about review and with no lead-in answering the reviewer. */
export function forRecord(text: unknown): string {
  if (typeof text !== 'string') return '';
  const kept: string[] = [];
  for (const raw of segments(text.trim())) {
    const body = raw.trim();
    if (!body) continue;
    if (FOR_REVIEWER.some((r) => r.test(body))) continue;
    let rest = raw.trimStart();
    for (const r of LEAD_IN) rest = rest.replace(r, '');
    if (rest !== raw.trimStart())
      rest = rest.charAt(0).toUpperCase() + rest.slice(1);
    if (rest.trim()) kept.push(rest);
  }
  const out = kept.join('').trim();
  // Text that stops mid-sentence ends as a sentence.
  return /[；;，,、：:]$/.test(out)
    ? out.slice(0, -1) + (CJK.test(out) ? '。' : '.')
    : out;
}

/** The sentence an approved version gives the record: its `release`, else its summary for the reviewer, each through forRecord. */
export function changeSentence(
  draft: { release?: unknown; summary?: unknown } | null | undefined,
): string {
  return forRecord(draft?.release) || forRecord(draft?.summary);
}

/** The system's line for the other languages, in the project language: those updated in place, then those translated. */
export function languagesLine(
  locale: string,
  updated: string[],
  translated: string[],
): string {
  if (!updated.length && !translated.length) return '';
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'language' });
  } catch {
    /* names stay codes */
  }
  const name = (code: string) => {
    try {
      return names?.of(code) || code;
    } catch {
      return code;
    }
  };
  const list = (codes: string[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(
      codes.map(name),
    );
  const lines = [
    ...(updated.length
      ? [
          systemMessageText(
            'articles.releaseUpdated',
            { 0: list(updated) },
            locale,
          ),
        ]
      : []),
    ...(translated.length
      ? [
          systemMessageText(
            'articles.releaseTranslated',
            { 0: list(translated) },
            locale,
          ),
        ]
      : []),
  ];
  return lines.join(/^(zh|ja)\b/.test(locale) ? '' : ' ');
}

/** The note itself: the owner's, else the change and the languages line on lines of their own, else the title. */
export function releaseNote({
  owner,
  change,
  languages,
  title,
}: {
  owner?: string | null;
  change: string;
  languages: string;
  title: string;
}): string {
  return (
    owner?.trim() ||
    [change, languages].filter(Boolean).join('\n') ||
    title
  ).slice(0, 2000);
}
