import { documentText } from './document-text.js';
import {
  TASK_DOCUMENT_TYPES,
  type TaskFileType,
} from '../../shared/manual-task.js';

// Documents attached to a task (2026-10-27 user request: Word and Excel next to images and videos). They are stored
// and served like task media and never run: the content route sends them as downloads with their stored type.

type DocumentType =
  (typeof TASK_DOCUMENT_TYPES)[keyof typeof TASK_DOCUMENT_TYPES];
const OFFICE = {
  [TASK_DOCUMENT_TYPES['.docx']]: 'word/document.xml',
  [TASK_DOCUMENT_TYPES['.xlsx']]: 'xl/workbook.xml',
} as Record<string, string>;
const TEXT: readonly string[] = [
  TASK_DOCUMENT_TYPES['.csv'],
  TASK_DOCUMENT_TYPES['.md'],
  TASK_DOCUMENT_TYPES['.txt'],
];
export const isTextDocument = (type: string) => TEXT.includes(type);

/** Why a document is refused, or null when its content matches its type. */
export function documentProblem(
  type: DocumentType,
  bytes: Buffer,
): 'signature' | 'macro' | 'encoding' | null {
  if (type === TASK_DOCUMENT_TYPES['.pdf'])
    return bytes.subarray(0, 1024).includes('%PDF-') ? null : 'signature';
  const part = OFFICE[type];
  if (part) {
    // An Office Open XML file is a zip whose entry names are stored as written: the main part must be there, and a
    // VBA project means macros under a renamed extension.
    if (
      !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
      !bytes.includes('[Content_Types].xml') ||
      !bytes.includes(part)
    )
      return 'signature';
    return bytes.includes('vbaProject.bin') ? 'macro' : null;
  }
  if (bytes.includes(0)) return 'encoding';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return null;
  } catch {
    return 'encoding';
  }
}

export const EXCERPT_FILE_CHARS = 12_000;
export const EXCERPT_TOTAL_CHARS = 30_000;
export const EXCERPT_ROWS = 200;
/** The longest a draft waits for all its documents' text, and for any one of them. */
export const EXCERPT_TIME = 45_000;
const FILE_TIME = 20_000;

export interface DocumentExcerpt {
  name: string;
  text: string;
  /** Only the first part was read: past the row or character limit, or out of time. */
  truncated: boolean;
  /** Nothing could be read (damaged, encrypted or a scan without text). */
  unreadable: boolean;
}
export interface DocumentSource {
  name: string;
  type: TaskFileType;
  read(): Promise<Buffer>;
}

/** Table rows as written, without trailing empty cells or empty rows, at most `EXCERPT_ROWS` of each sheet. */
function compactRows(text: string): { text: string; truncated: boolean } {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.replace(/,+$/, ''))
    .filter((row) => row.trim());
  return {
    text: rows.slice(0, EXCERPT_ROWS).join('\n'),
    truncated: rows.length > EXCERPT_ROWS,
  };
}
// The spreadsheet reader gives each sheet as its name, a line break and its rows, sheets separated by a blank line.
function compactSheets(text: string): { text: string; truncated: boolean } {
  let truncated = false;
  const sheets = text.split(/\n\n(?=[^\n,]+\n)/).map((sheet) => {
    const [name, ...rows] = sheet.split('\n');
    const table = compactRows(rows.join('\n'));
    truncated ||= table.truncated;
    return `${name}\n${table.text}`;
  });
  return { text: sheets.join('\n\n'), truncated };
}

async function excerpt(
  source: DocumentSource,
  timeoutMs: number,
): Promise<{ text: string; truncated: boolean }> {
  const bytes = await source.read();
  const extension = Object.entries(TASK_DOCUMENT_TYPES).find(
    ([, type]) => type === source.type,
  )?.[0];
  if (isTextDocument(source.type)) {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    return source.type === TASK_DOCUMENT_TYPES['.csv']
      ? compactRows(text)
      : { text, truncated: false };
  }
  const text = await documentText(extension ?? '', bytes, { timeoutMs });
  return source.type === TASK_DOCUMENT_TYPES['.xlsx']
    ? compactSheets(text)
    : {
        text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'),
        truncated: false,
      };
}

/**
 * The text a draft reads from its documents, one after another within a shared character budget and time limit.
 * Parsing runs in the document worker (memory and time bounded); a file that cannot be read is reported, not thrown.
 */
export async function documentExcerpts(
  sources: readonly DocumentSource[],
  { now = Date.now, deadline = Date.now() + EXCERPT_TIME } = {},
): Promise<DocumentExcerpt[]> {
  let budget = EXCERPT_TOTAL_CHARS;
  const out: DocumentExcerpt[] = [];
  for (const source of sources) {
    const left = deadline - now();
    if (budget <= 0 || left < 1000) {
      out.push({
        name: source.name,
        text: '',
        truncated: true,
        unreadable: false,
      });
      continue;
    }
    try {
      const read = await excerpt(source, Math.min(FILE_TIME, left));
      const text = read.text.trim();
      const limit = Math.min(EXCERPT_FILE_CHARS, budget);
      const cut = text.length > limit;
      const kept = cut ? text.slice(0, limit) : text;
      budget -= kept.length;
      out.push({
        name: source.name,
        text: kept,
        truncated: read.truncated || cut,
        unreadable: !text,
      });
    } catch {
      out.push({
        name: source.name,
        text: '',
        truncated: false,
        unreadable: true,
      });
    }
  }
  return out;
}
