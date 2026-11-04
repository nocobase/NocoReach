// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  imageChanges,
  imagesIn,
  replaceTaskImages,
  taskImageIds,
  taskImageOf,
  taskImagesIn,
} from '../../shared/task-images.js';
import { runNotes } from '../../server/nocoreach/execution/flow';
import {
  IMAGE_BUDGET,
  messageImageIdsOf,
  taskMaterials,
} from '../../server/nocoreach/execution/task-materials';
import { withImageUrls } from '../../server/nocoreach/articles/delivery';

// Images on a started task (2026-11-03): one path for a task image everywhere, numbered for the Agent as the person
// numbered them, and replaced by the target's address only when the article is published.
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222';

describe('task image paths', () => {
  it('finds a task image by its path, under a base path or an origin, and nothing else', () => {
    expect(taskImageOf(`/uploads/task-media/${A}.png`)).toEqual({
      id: A,
      ext: 'png',
    });
    expect(taskImageOf(`/nocoreach/uploads/task-media/${A}.webp?x=1`)).toEqual({
      id: A,
      ext: 'webp',
    });
    expect(
      taskImageOf(`https://reach.example.com/uploads/task-media/${A}`),
    ).toEqual({ id: A, ext: '' });
    for (const other of [
      '/uploads/task-media/not-an-id.png',
      `/uploads/other/${A}.png`,
      'https://cdn.example.com/a.png',
      '',
    ])
      expect(taskImageOf(other)).toBeNull();
  });

  it('reads the images of Markdown and replaces only task images, keeping the description and title', () => {
    const md = [
      `![Workspace \\[new\\]](/uploads/task-media/${A}.png "Shown")`,
      '![Logo](https://cdn.example.com/logo.png)',
      `![](</uploads/task-media/${B}.gif>)`,
      `![Again](/uploads/task-media/${A}.png)`,
    ].join('\n\n');
    expect(taskImagesIn(md).map((i) => [i.id, i.alt])).toEqual([
      [A, 'Workspace [new]'],
      [B, ''],
      [A, 'Again'],
    ]);
    expect(imagesIn(md)).toHaveLength(4);
    expect(taskImageIds([md, undefined, md])).toEqual([A, B]);
    const out = replaceTaskImages(md, (id) =>
      id === A ? 'https://cms.example.com/storage/a.png' : undefined,
    );
    expect(out).toContain(
      '![Workspace \\[new\\]](https://cms.example.com/storage/a.png "Shown")',
    );
    expect(out).toContain('![Again](https://cms.example.com/storage/a.png)');
    expect(out).toContain(`![](</uploads/task-media/${B}.gif>)`);
    expect(out).toContain('![Logo](https://cdn.example.com/logo.png)');
  });

  it('names an image added where one was removed as replacing it', () => {
    const before =
      '![Old workspace](https://cms.example.com/old.png)\n\n![Logo](/logo.png)';
    const after = `![Logo](/logo.png)\n\n![New workspace](/uploads/task-media/${A}.png)\n\n![Chart](/uploads/task-media/${B}.png)`;
    expect(imageChanges(before, after)).toEqual({
      replaced: [
        {
          image: {
            address: `/uploads/task-media/${A}.png`,
            alt: 'New workspace',
          },
          was: {
            address: 'https://cms.example.com/old.png',
            alt: 'Old workspace',
          },
        },
      ],
      added: [{ address: `/uploads/task-media/${B}.png`, alt: 'Chart' }],
      removed: [],
    });
    expect(imageChanges(after, before).removed).toHaveLength(1);
  });

  it('writes the target addresses into every field of a draft and leaves images without one', () => {
    const p = {
      targetId: 'cms',
      draft: {
        locales: {
          en: {
            title: 'Title',
            body: `![a](/uploads/task-media/${A}.png) ![b](/uploads/task-media/${B}.png)`,
          },
        },
      },
    };
    expect(
      withImageUrls(p, { [A]: 'https://cms.example.com/a.png' }).draft.locales
        .en.body,
    ).toBe(
      `![a](https://cms.example.com/a.png) ![b](/uploads/task-media/${B}.png)`,
    );
    expect(withImageUrls(p, undefined)).toBe(p);
  });
});

describe('images for the Agent', () => {
  const image = (id: string, n: number) => ({
    id,
    name: `shot-${n}.png`,
    ref: `/uploads/task-media/${id}.png`,
  });

  it('gives each message its images numbered in the order they were added', () => {
    expect(
      runNotes([
        { at: '2026-11-03T10:00:00Z', action: 'comment', comment: 'Plain' },
        {
          at: '2026-11-03T10:05:00Z',
          action: 'comment',
          comment: 'Image 1 circles the line; put Image 2 in.',
          images: [image(A, 1), image(B, 2)],
        },
      ]),
    ).toEqual([
      'Plain',
      {
        text: 'Image 1 circles the line; put Image 2 in.',
        images: [
          {
            number: 1,
            name: 'shot-1.png',
            ref: `/uploads/task-media/${A}.png`,
          },
          {
            number: 2,
            name: 'shot-2.png',
            ref: `/uploads/task-media/${B}.png`,
          },
        ],
      },
    ]);
  });

  it('carries the images of notes and feedback in the materials, under the path the messages give', () => {
    const input = {
      mode: 'article',
      notes: [
        'Plain',
        {
          text: 'x',
          images: [
            { number: 1, name: 'a.png', ref: `/uploads/task-media/${A}.png` },
          ],
        },
      ],
      feedback: [
        {
          text: 'y',
          images: [
            { number: 1, name: 'b.png', ref: `/uploads/task-media/${B}.png` },
            { number: 2, name: 'a.png', ref: `/uploads/task-media/${A}.png` },
          ],
        },
      ],
    };
    expect(messageImageIdsOf(input)).toEqual([A, B]);
    const files = [
      { id: A, name: 'a.png', type: 'image/png', size: 10, ext: 'png' },
      {
        id: B,
        name: 'b.png',
        type: 'image/png',
        size: IMAGE_BUDGET,
        ext: 'png',
      },
    ];
    const offer = taskMaterials(input, [], undefined, files);
    const served = taskMaterials(
      input,
      [],
      new Map([[A, Buffer.from('png a').toString('base64')]]),
      files,
    );
    expect(served.bundle.hash).toBe(offer.bundle.hash);
    expect(offer.context.materials).toMatchObject({
      images: '.nocoreach-materials/images.json',
    });
    expect(offer.offer.note).toContain('images.json');
    const index = JSON.parse(
      served.bundle.files.find((f) => f.path === 'images.json')!.content,
    );
    expect(index).toEqual([
      {
        ref: `/uploads/task-media/${A}.png`,
        name: 'a.png',
        type: 'image/png',
        size: 10,
        base64: `images/${A}.base64`,
      },
      // Past the budget once the first image is in.
      {
        ref: `/uploads/task-media/${B}.png`,
        name: 'b.png',
        type: 'image/png',
        size: IMAGE_BUDGET,
        omitted: 'size',
      },
    ]);
    expect(
      Buffer.from(
        served.bundle.files.find((f) => f.path === `images/${A}.base64`)!
          .content,
        'base64',
      ).toString(),
    ).toBe('png a');
    // Without images the materials and their hash are what runners already cached.
    expect(taskMaterials({ mode: 'article' }).bundle.hash).toBe(
      taskMaterials({ mode: 'article' }, [], undefined, []).bundle.hash,
    );
    expect(
      taskMaterials({ mode: 'article' }).context.materials,
    ).not.toHaveProperty('images');
  });
});
