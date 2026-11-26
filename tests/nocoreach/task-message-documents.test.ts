// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { messageFileKind } from '../../shared/task-images.js';
import { flowRunInput, runNotes } from '../../server/nocoreach/execution/flow';
import {
  DOCUMENT_BUDGET,
  imagePlan,
  messageDocumentIdsOf,
  messageImageIdsOf,
  taskMaterials,
} from '../../server/nocoreach/execution/task-materials';
import { executeDemoAgent } from '../../server/nocoreach/demo-data/demo-agent';

// Documents with a message or change request (2026-11-15 user request: a .txt sent with a change request was
// refused): the files a new task takes, each read by the Agent with the message it came with.
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222',
  C = '33333333-3333-4333-8333-333333333333';
const doc = (id: string, name: string, type: string, size = 12) => ({
  id,
  name,
  ref: `/uploads/task-media/${id}.${name.slice(name.lastIndexOf('.') + 1)}`,
  type,
  size,
});

describe('what a message takes', () => {
  it('takes the images and documents a new task takes, and no videos', () => {
    expect(messageFileKind('shot.png', 'image/png')).toEqual({ kind: 'image' });
    expect(messageFileKind('notes.md', '')).toEqual({
      kind: 'document',
      type: 'text/markdown',
    });
    expect(messageFileKind('新建文本文档 (2).txt', 'text/plain')).toEqual({
      kind: 'document',
      type: 'text/plain',
    });
    expect(messageFileKind('brief.docx', '')).toEqual({
      kind: 'document',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(messageFileKind('rows.csv', 'application/vnd.ms-excel')).toEqual({
      kind: 'document',
      type: 'text/csv',
    });
    expect(messageFileKind('old.doc', 'application/msword')).toEqual({
      kind: 'legacy',
    });
    expect(messageFileKind('demo.mp4', 'video/mp4')).toBeNull();
    expect(messageFileKind('site.zip', 'application/zip')).toBeNull();
    expect(messageFileKind('scan.bmp', 'image/bmp')).toBeNull();
  });
});

describe('documents for the Agent', () => {
  it('lists each message’s documents with it, apart from its images', () => {
    const notes = doc(A, 'notes.md', 'text/markdown');
    expect(
      runNotes([
        {
          at: '2026-11-15T10:00:00Z',
          action: 'comment',
          comment: 'Follow notes.md.',
          documents: [notes],
        },
        {
          at: '2026-11-15T10:05:00Z',
          action: 'comment',
          comment: 'Image 1 circles the line.',
          images: [
            { id: B, name: 'shot.png', ref: `/uploads/task-media/${B}.png` },
          ],
        },
      ]),
    ).toEqual([
      {
        text: 'Follow notes.md.',
        documents: [
          { name: 'notes.md', type: 'text/markdown', ref: notes.ref },
        ],
      },
      {
        text: 'Image 1 circles the line.',
        images: [
          { number: 1, name: 'shot.png', ref: `/uploads/task-media/${B}.png` },
        ],
      },
    ]);
  });

  it('gives the redo each change request with the documents that came with it', () => {
    const first = doc(A, 'terms.txt', 'text/plain'),
      second = doc(C, 'outline.md', 'text/markdown');
    const input = flowRunInput(
      { name: 'Demo' },
      { title: 'Rewrite the landing page', brief: 'x', evidence: {} },
      {
        flow: {
          name: 'Write',
          stages: [
            { key: 'write', name: 'Write', kind: 'agent' },
            { key: 'review', name: 'Review', kind: 'review' },
          ],
        },
        results: [{ content: 'Version 2', rejectedAt: '2026-11-15T10:10:00Z' }],
        history: [],
      },
      0,
      null,
      [
        {
          kind: 'stage',
          stageKey: 'write',
          decision: 'requestChanges',
          comment: 'Use the terms in the file.',
          documents: [first],
        },
        {
          kind: 'stage',
          stageKey: 'write',
          decision: 'requestChanges',
          comment: 'Now follow this outline; Image 1 is the layout.',
          images: [
            { id: B, name: 'layout.png', ref: `/uploads/task-media/${B}.png` },
          ],
          documents: [second],
        },
      ],
    );
    expect(input.feedback).toEqual([
      {
        text: 'Use the terms in the file.',
        documents: [{ name: 'terms.txt', type: 'text/plain', ref: first.ref }],
      },
      {
        text: 'Now follow this outline; Image 1 is the layout.',
        images: [
          {
            number: 1,
            name: 'layout.png',
            ref: `/uploads/task-media/${B}.png`,
          },
        ],
        documents: [
          { name: 'outline.md', type: 'text/markdown', ref: second.ref },
        ],
      },
    ]);
    expect(messageDocumentIdsOf(input)).toEqual([A, C]);
    expect(messageImageIdsOf(input)).toEqual([B]);
  });

  it('carries the documents of notes and feedback in the materials, decoded by their name, within a budget', () => {
    const input = {
      mode: 'article',
      notes: [
        {
          text: 'x',
          documents: [
            {
              name: 'notes.md',
              type: 'text/markdown',
              ref: `/uploads/task-media/${A}.md`,
            },
          ],
        },
      ],
      feedback: [
        {
          text: 'y',
          documents: [
            {
              name: 'big.pdf',
              type: 'application/pdf',
              ref: `/uploads/task-media/${C}.pdf`,
            },
          ],
        },
      ],
    };
    expect(messageDocumentIdsOf(input)).toEqual([A, C]);
    const files = [
      { id: A, name: 'notes.md', type: 'text/markdown', size: 7, ext: 'md' },
      {
        id: C,
        name: 'big.pdf',
        type: 'application/pdf',
        size: DOCUMENT_BUDGET,
        ext: 'pdf',
      },
    ];
    const offer = taskMaterials(input, [], undefined, [], files);
    const served = taskMaterials(
      input,
      [],
      new Map([[A, Buffer.from('# Notes').toString('base64')]]),
      [],
      files,
    );
    expect(served.bundle.hash).toBe(offer.bundle.hash);
    expect(offer.context.materials).toMatchObject({
      documents: '.nocoreach-materials/documents.json',
    });
    expect(offer.context.materials).not.toHaveProperty('images');
    expect(offer.offer.note).toContain('documents.json');
    expect(
      JSON.parse(
        served.bundle.files.find((f) => f.path === 'documents.json')!.content,
      ),
    ).toEqual([
      {
        ref: `/uploads/task-media/${A}.md`,
        name: 'notes.md',
        type: 'text/markdown',
        size: 7,
        base64: `documents/${A}.base64`,
      },
      // Past the budget once the first document is in.
      {
        ref: `/uploads/task-media/${C}.pdf`,
        name: 'big.pdf',
        type: 'application/pdf',
        size: DOCUMENT_BUDGET,
        omitted: 'size',
      },
    ]);
    expect(
      Buffer.from(
        served.bundle.files.find((f) => f.path === `documents/${A}.base64`)!
          .content,
        'base64',
      ).toString(),
    ).toBe('# Notes');
  });

  it('keeps the hash runners cached for runs without documents', () => {
    const input = { mode: 'article' };
    const images = [
      { id: B, name: 'shot.png', type: 'image/png', size: 5, ext: 'png' },
    ];
    const { bundle } = taskMaterials(input, [], undefined, images);
    // The formula from before documents: the files, the attachments' plan and the images' plan.
    const files = bundle.files.filter((f) => !f.path.endsWith('.base64'));
    const shown = imagePlan(images).map(({ file, entry }) => [
      file.id,
      file.size,
      entry,
    ]);
    expect(bundle.hash).toBe(
      createHash('sha256')
        .update(JSON.stringify([files, [], shown]))
        .digest('hex'),
    );
    expect(taskMaterials(input).bundle.hash).toBe(
      taskMaterials(input, [], undefined, [], []).bundle.hash,
    );
    expect(
      taskMaterials(input, [], undefined, images).bundle.files.map(
        (f) => f.path,
      ),
    ).not.toContain('documents.json');
  });
});

describe('the demo Agent', () => {
  it('reads the documents sent with the change request before it writes', async () => {
    const result = await executeDemoAgent(
      {
        projectId: '1',
        mode: 'plan',
        input: JSON.stringify({
          language: 'en-US',
          task: { title: 'Keyword research', brief: 'x' },
          stage: { name: 'Analyze' },
          feedback: [
            {
              text: 'Check the claims against the attached notes.',
              documents: [
                {
                  name: 'notes.md',
                  type: 'text/markdown',
                  ref: `/uploads/task-media/${A}.md`,
                },
              ],
            },
          ],
        }),
      },
      async () => null,
    );
    const read = result.steps.findIndex(
      (s) =>
        s.type === 'toolUse' &&
        (s.input as { file_path?: string })?.file_path === 'documents.json',
    );
    expect(read).toBeGreaterThan(0);
    expect(result.steps[read + 1]).toMatchObject({
      type: 'toolResult',
      output: '- notes.md',
    });
    // The request's text is what the new version says it fixes.
    expect(
      result.steps.some(
        (s) =>
          s.type === 'thinking' &&
          s.content?.includes('Check the claims against the attached notes.'),
      ),
    ).toBe(true);
  });

  it('quotes several requests in one sentence, each without its own full stop', async () => {
    const result = await executeDemoAgent(
      {
        projectId: '1',
        mode: 'plan',
        input: JSON.stringify({
          language: 'zh-CN',
          task: { title: '关键词调研', brief: 'x' },
          stage: { name: '分析' },
          feedback: [
            '保留待交接。',
            { text: '术语按 txt 文件统一。', documents: [{ name: 'a.txt' }] },
          ],
        }),
      },
      async () => null,
    );
    const thought = result.steps.find(
      (s) => s.type === 'thinking' && s.content?.includes('上一版的审核意见是'),
    )?.content;
    expect(thought).toContain(
      '上一版的审核意见是：保留待交接；术语按 txt 文件统一。这次重点修正这些问题。',
    );
  });
});
