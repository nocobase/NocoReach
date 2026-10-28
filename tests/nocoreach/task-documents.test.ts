// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  EXCERPT_FILE_CHARS,
  EXCERPT_ROWS,
  EXCERPT_TOTAL_CHARS,
  documentExcerpts,
  documentProblem,
  type DocumentSource,
} from '../../server/nocoreach/task-documents';
import { validateTaskMedia } from '../../server/nocoreach/manual-tasks';
import {
  ATTACHMENT_BUDGET,
  attachmentIdsOf,
  taskMaterials,
} from '../../server/nocoreach/execution/task-materials';
import { TASK_DOCUMENT_TYPES, taskFileType } from '../../shared/manual-task';
import { docx, xlsxBook, zip } from './office-fixtures';

const DOCX = TASK_DOCUMENT_TYPES['.docx'];
const XLSX = TASK_DOCUMENT_TYPES['.xlsx'];
const source = (
  name: string,
  type: DocumentSource['type'],
  bytes: Buffer,
): DocumentSource => ({ name, type, read: async () => bytes });

describe('accepted document types', () => {
  it('types documents by extension and names the legacy ones', () => {
    expect(taskFileType('Brief.DOCX', '')).toBe(DOCX);
    expect(taskFileType('notes.md', '')).toBe('text/markdown');
    expect(taskFileType('data.csv', 'application/vnd.ms-excel')).toBe(
      'text/csv',
    );
    for (const name of ['old.doc', 'macro.docm', 'old.xls', 'macro.xlsm'])
      expect(taskFileType(name, 'application/msword')).toBe('legacy');
    expect(taskFileType('page.html', 'text/html')).toBeNull();
    expect(taskFileType('shot.png', 'image/png')).toBe('image/png');
  });

  it('checks the content, not the name', () => {
    expect(documentProblem(DOCX, docx(['Hello']))).toBeNull();
    expect(documentProblem(XLSX, xlsxBook({ Plans: [['a']] }))).toBeNull();
    expect(documentProblem(DOCX, xlsxBook({ Plans: [['a']] }))).toBe(
      'signature',
    );
    expect(documentProblem(DOCX, docx(['Hi'], { macro: true }))).toBe('macro');
    expect(documentProblem(DOCX, zip({ 'word/document.xml': 'x' }))).toBe(
      'signature',
    );
    expect(
      documentProblem('application/pdf', Buffer.from('%PDF-1.7\n...')),
    ).toBeNull();
    expect(documentProblem('application/pdf', Buffer.from('<html>'))).toBe(
      'signature',
    );
    expect(
      documentProblem('text/csv', Buffer.from('name,price\nPro,49')),
    ).toBeNull();
    // GBK bytes and binary content are not UTF-8 text.
    expect(
      documentProblem('text/csv', Buffer.from([0xb6, 0xa8, 0xbc, 0xdb])),
    ).toBe('encoding');
    expect(documentProblem('text/plain', Buffer.from([0x61, 0, 0x62]))).toBe(
      'encoding',
    );
  });

  it('refuses legacy, macro, mislabeled and non-UTF-8 files on upload and stores documents with their type', async () => {
    await expect(
      validateTaskMedia(
        new File(['x'], 'old.xls', { type: 'application/vnd.ms-excel' }),
      ),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_LEGACY_FORMAT' });
    await expect(
      validateTaskMedia(new File([docx(['x'], { macro: true })], 'plan.docx')),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_LEGACY_FORMAT' });
    await expect(
      validateTaskMedia(
        new File(['<html>'], 'fake.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_SIGNATURE' });
    await expect(
      validateTaskMedia(new File([Buffer.from([0xb6, 0xa8])], 'gbk.csv')),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_TEXT_ENCODING' });
    await expect(
      validateTaskMedia(new File(['x'], 'page.html', { type: 'text/html' })),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_INVALID' });
    const stored = await validateTaskMedia(new File(['# Plans'], 'notes.md'));
    expect(stored.type).toBe('text/markdown');
    expect(stored.name).toBe('notes.md');
    const word = await validateTaskMedia(
      new File([docx(['Plans'])], 'brief.docx'),
    );
    expect(word.type).toBe(DOCX);
  });
});

describe('document text for a draft', () => {
  it('reads Word paragraphs, Excel sheets and CSV rows compactly', async () => {
    const [word, sheet, csv] = await documentExcerpts([
      source(
        'brief.docx',
        DOCX,
        docx(['Pricing page brief', 'Pro costs 49 per month']),
      ),
      source(
        'plans.xlsx',
        XLSX,
        xlsxBook({
          Plans: [
            ['Plan', 'Price', '', ''],
            ['Pro', 49, '', ''],
          ],
        }),
      ),
      source(
        'visits.csv',
        'text/csv',
        Buffer.from('\uFEFFpage,visits,,\n/pricing,120,,\n\n'),
      ),
    ]);
    expect(word).toMatchObject({ truncated: false, unreadable: false });
    expect(word.text).toContain('Pro costs 49 per month');
    expect(sheet.text).toBe('Plans\nPlan,Price\nPro,49');
    expect(csv.text).toBe('page,visits\n/pricing,120');
  });

  it('caps rows, each file and all files together, and says so', async () => {
    const rows = Array.from(
      { length: EXCERPT_ROWS + 50 },
      (_, i) => `row${i},${i}`,
    );
    const long = 'x'.repeat(EXCERPT_FILE_CHARS + 500);
    const out = await documentExcerpts([
      source('many.csv', 'text/csv', Buffer.from(rows.join('\n'))),
      source('a.txt', 'text/plain', Buffer.from(long)),
      source('b.txt', 'text/plain', Buffer.from(long)),
      source('c.txt', 'text/plain', Buffer.from(long)),
    ]);
    expect(out[0].text.split('\n')).toHaveLength(EXCERPT_ROWS);
    expect(out[0].truncated).toBe(true);
    expect(out[1].text).toHaveLength(EXCERPT_FILE_CHARS);
    expect(out[1].truncated).toBe(true);
    expect(
      out.reduce((n, file) => n + file.text.length, 0),
    ).toBeLessThanOrEqual(EXCERPT_TOTAL_CHARS);
    expect(out[3]).toMatchObject({ truncated: true });
  });

  it('reports a damaged file and stops reading at the deadline', async () => {
    const [broken] = await documentExcerpts([
      source('broken.docx', DOCX, Buffer.from('PK not really')),
    ]);
    expect(broken).toMatchObject({ unreadable: true, text: '' });
    let clock = 0;
    const late = await documentExcerpts(
      [source('late.txt', 'text/plain', Buffer.from('hello'))],
      { now: () => clock, deadline: 500 },
    );
    clock = 1;
    expect(late[0]).toMatchObject({ text: '', truncated: true });
  }, 60000);
});

describe('attachments in the task materials', () => {
  const files = [
    { id: 'a', name: 'brief.docx', type: DOCX, size: 1000 },
    { id: 'b', name: 'demo.mp4', type: 'video/mp4', size: 1000 },
    { id: 'c', name: '价格 表.xlsx', type: XLSX, size: ATTACHMENT_BUDGET },
    { id: 'd', name: 'shot.png', type: 'image/png', size: 10 },
  ];
  const input = {
    mode: 'plan',
    evidence: { attachmentIds: ['a', 'b', 'c', 'd', 1] },
  };

  it('lists every attachment, carries the included ones as base64 and keeps the hash without the bytes', () => {
    expect(attachmentIdsOf(input)).toEqual(['a', 'b', 'c', 'd']);
    const offer = taskMaterials(input, files);
    const served = taskMaterials(
      input,
      files,
      new Map([
        ['a', Buffer.from('docx bytes').toString('base64')],
        ['d', Buffer.from('png').toString('base64')],
      ]),
    );
    expect(served.bundle.hash).toBe(offer.bundle.hash);
    expect(served.offer.hash).toBe(offer.bundle.hash);
    expect(offer.context.materials).toMatchObject({
      attachments: '.nocoreach-materials/attachments.json',
    });
    expect(offer.offer.note).toContain('attachments.json');
    const index = JSON.parse(
      served.bundle.files.find((file) => file.path === 'attachments.json')!
        .content,
    );
    expect(index).toEqual([
      {
        name: 'brief.docx',
        type: DOCX,
        size: 1000,
        base64: 'attachments/1-brief.docx.base64',
      },
      { name: 'demo.mp4', type: 'video/mp4', size: 1000, omitted: 'video' },
      // Past the size budget once the first file is in.
      {
        name: '价格 表.xlsx',
        type: XLSX,
        size: ATTACHMENT_BUDGET,
        omitted: 'size',
      },
      {
        name: 'shot.png',
        type: 'image/png',
        size: 10,
        base64: 'attachments/4-shot.png.base64',
      },
    ]);
    expect(
      Buffer.from(
        served.bundle.files.find(
          (file) => file.path === 'attachments/1-brief.docx.base64',
        )!.content,
        'base64',
      ).toString(),
    ).toBe('docx bytes');
    // Another set of attachments is another bundle; none keeps the earlier hash and files.
    expect(taskMaterials(input, files.slice(0, 1)).bundle.hash).not.toBe(
      offer.bundle.hash,
    );
    const plain = taskMaterials({ mode: 'plan' });
    expect(plain.bundle.files.map((file) => file.path)).toEqual([
      'knowledge.json',
      'skills.json',
      'sources.json',
    ]);
    expect(plain.context.materials).not.toHaveProperty('attachments');
  });
});
