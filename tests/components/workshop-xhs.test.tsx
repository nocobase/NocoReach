import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import {
  cardToEdit,
  parseRepurpose,
  repurposeChecks,
  type CardSet,
} from '../../shared/repurpose';
import {
  cardStyle,
  styleBrief,
  type TemplateCard,
} from '../../shared/xhs-card';
import type { SavedStyle } from '../../shared/card-design';
import { RepurposeResult } from '../../client/pages/task-detail/repurpose-result';
import {
  XhsCardEditor,
  XhsDoneTools,
} from '../../client/pages/task-detail/xhs-cards';
import {
  CardBrandFields,
  CardStyleSection,
} from '../../client/pages/workshop/brand-cards';
import {
  cardFieldsOf,
  type CardFields,
} from '../../client/pages/workshop/model';
import type {
  Artifact,
  TaskData,
} from '../../client/pages/task-execution-types';

// Content workshop PR 2 (2026-11-16): a Xiaohongshu result on the task page (the review gallery, the done card's
// download and copy) and Brand and templates › Brand style with its preview.

const copied = vi.hoisted(() => vi.fn<(value: string) => Promise<boolean>>());
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  copyText: copied,
}));
// The card template runs in a sandboxed frame, which this DOM does not run: the frame's answer and the drawing are
// stood in for, and the card images' upload.
const drawing = vi.hoisted(() => ({
  overflow: [] as number[],
  renderCards: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('../../client/lib/card-render', () => ({
  cardMessage: () =>
    Promise.resolve({
      source: 'nocoreach-xhs-card',
      overflow: drawing.overflow,
    }),
  renderCards: drawing.renderCards,
}));
vi.mock(
  '../../client/pages/task-detail/task-images-model',
  async (original) => ({
    ...(await original<
      typeof import('../../client/pages/task-detail/task-images-model')
    >()),
    useCardImageUpload: () => drawing.upload,
  }),
);

beforeEach(() => {
  setDictionary(enDictionary as Record<string, string>);
  copied.mockResolvedValue(true);
});
afterEach(() => {
  drawing.overflow = [];
  drawing.renderCards.mockReset();
  drawing.upload.mockReset();
  cleanup();
  setDictionary(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  copied.mockReset();
});

const LONG =
  'A card sat in Waiting on client for nine days and nobody noticed; the client thought we had forgotten. Now a card waiting over three days reminds its owner.';
const content = [
  '## Title',
  'Inbox to one board',
  '## Body',
  'Our delivery team is four people.',
  '## Card 1',
  'Sections: 1–2',
  '# Inbox to one board',
  'Four people, one afternoon',
  '## Card 2',
  'Sections: 1',
  '# No one owned an email',
  'Everyone saw every email.',
  '## Card 3',
  'Sections: 2',
  '# Week one: nine days',
  LONG,
  '## Card 4',
  'Sections: 2',
  '# Five columns',
  'New → Scoping → In progress → Delivered.',
  '## Card 5',
  'Layout: end',
  '# Follow Acme',
  'acme.example',
].join('\n');
const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const set: CardSet = {
  images: [1, 2, 3, 4, 5].map((n) => ({
    id: uuid(n),
    ref: `/uploads/task-media/${uuid(n)}.png`,
    name: `card-${n}.png`,
  })),
  sections: 2,
  colors: ['#1E40AF', '#F8FAFC', '#111827'],
  overflow: [4],
};
const artifact = (extra: Partial<Artifact> = {}) =>
  ({
    id: 'v1',
    stepId: 'adapt',
    planVersion: 1,
    version: 1,
    content,
    createdAt: '2026-11-16T07:16:00.000Z',
    createdBy: 'agent',
    cards: set,
    ...extra,
  }) as Artifact;
const taskData = (out: Artifact) =>
  ({
    task: {
      id: 45,
      title: 'Xiaohongshu cards',
      brief: '',
      evidence: { no: 45 },
    },
    work: { repurpose: { form: 'xhs' } },
    repurpose: {
      checks: {
        [out.id]: repurposeChecks('xhs', parseRepurpose('xhs', content)!, {
          cards: set,
        }),
      },
    },
    runs: [],
    artifacts: [out],
    reviews: [],
  }) as unknown as TaskData;

it('frames on review a card over the character limit or one the Agent found overflowing, and labels each card', () => {
  const out = artifact();
  render(
    <RepurposeResult data={taskData(out)} out={out} review fallback={null} />,
  );
  const checks = screen.getByRole('list', { name: 'Automatic checks' });
  expect(
    within(checks).getByText('Card 3 is 144 characters, over 110'),
  ).toHaveAttribute('data-check', 'warn');
  expect(
    within(checks).getByText(
      'Text does not fit on card 4 (checked while drawing the cards)',
    ),
  ).toBeInTheDocument();
  expect(within(checks).getByText('5 cards, outside 6–18')).toBeInTheDocument();

  const cards = within(
    screen.getByRole('list', { name: 'Card images' }),
  ).getAllByRole('listitem');
  expect(cards.map((c) => c.getAttribute('data-warn'))).toEqual([
    null,
    null,
    'true',
    'true',
    null,
  ]);
  expect(cards[0]).toHaveTextContent('Cover');
  expect(cards[1]).toHaveTextContent('Source sections: 1');
  expect(cards[2]).toHaveTextContent('144 characters, over 110');
  expect(cards[3]).toHaveTextContent('Text does not fit');
  expect(cards[4]).toHaveTextContent('Closing page');
  expect(
    within(cards[2]).getByRole('button', {
      name: 'Open card 3: Week one: nine days',
    }),
  ).toBeInTheDocument();

  // The note's title and body are copied on their own during review.
  expect(
    screen.getByRole('button', { name: 'Copy Note title' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Copy Note body' }),
  ).toBeInTheDocument();
});

it('edits a card’s text from the gallery on review, and marks the cards a person edited', async () => {
  const user = userEvent.setup();
  const onEditCard = vi.fn();
  const out = artifact({ cards: { ...set, edited: [2] } });
  render(
    <RepurposeResult
      data={taskData(out)}
      out={out}
      review
      onEditCard={onEditCard}
      fallback={null}
    />,
  );
  const cards = within(
    screen.getByRole('list', { name: 'Card images' }),
  ).getAllByRole('listitem');
  expect(cards[1]).toHaveTextContent('Edited');
  expect(cards[2]).not.toHaveTextContent('Edited');
  await user.click(
    within(cards[2]).getByRole('button', { name: 'Edit the text of card 3' }),
  );
  expect(onEditCard).toHaveBeenCalledWith(3);
  // Edit directly opens on the first card over the limit or overflowing.
  expect(cardToEdit(out.content, out.cards?.overflow)).toBe(3);
  expect(cardToEdit(content.replace(LONG, 'Short.'), [4])).toBe(4);
  expect(cardToEdit(content.replace(LONG, 'Short.'))).toBe(1);
});

it('leaves copying to the done card once approved', () => {
  const out = artifact({ approvedAt: '2026-11-16T09:00:00.000Z' });
  render(<RepurposeResult data={taskData(out)} out={out} fallback={null} />);
  expect(screen.queryByRole('list', { name: 'Automatic checks' })).toBeNull();
  expect(screen.getByRole('list', { name: 'Card images' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Copy / })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Edit the text/ })).toBeNull();
});

it('downloads every image in one ZIP named after the task, and copies the note’s title and body', async () => {
  const user = userEvent.setup();
  const fetched: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      fetched.push(url);
      return new Response(new Uint8Array([137, 80, 78, 71]));
    }),
  );
  let blob: Blob | null = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    blob = b as Blob;
    return 'blob:zip';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let saved = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved = this.download;
  });

  render(<XhsDoneTools out={artifact()} name='T-45' />);
  await user.click(screen.getByRole('button', { name: 'Download 5 images' }));
  await vi.waitFor(() => expect(saved).toBe('T-45.zip'));
  expect(fetched.map((u) => u.slice(u.indexOf('/uploads/')))).toEqual(
    set.images.map((i) => i.ref),
  );
  const bytes = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob!);
  });
  const names = new TextDecoder('latin1').decode(bytes);
  for (const n of ['01', '02', '03', '04', '05'])
    expect(names).toContain(`T-45-${n}.png`);

  await user.click(screen.getByRole('button', { name: 'Copy title' }));
  await user.click(screen.getByRole('button', { name: 'Copy body' }));
  expect(copied.mock.calls.map(([v]) => v)).toEqual([
    'Inbox to one board',
    'Our delivery team is four people.',
  ]);
});

it('shows no done-card tools for a result without images', () => {
  const { container } = render(
    <XhsDoneTools out={artifact({ cards: { images: [] } })} name='T-45' />,
  );
  expect(container).toBeEmptyDOMElement();
});

const project = { name: 'Acme', site: 'https://acme.example' };
const ending = { heading: 'Follow Acme', text: 'acme.example' };
const sampleCards: TemplateCard[] = [
  { layout: 'cover', heading: 'Inbox to one board', text: 'Four people' },
  { layout: 'text', heading: 'No one owned an email', text: 'Everyone saw' },
  { layout: 'text', heading: 'Five columns', text: 'New, Scoping' },
  { layout: 'end', heading: 'An old closing page', text: 'old.example' },
];

function Brand({
  initial,
  sample = null,
  onError = () => {},
}: {
  initial: CardFields;
  sample?: { subject: string; cards: TemplateCard[] } | null;
  onError?: (message: string) => void;
}) {
  const [fields, setFields] = useState(initial);
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  return (
    <>
      <CardStyleSection
        projectId='1'
        fields={fields}
        onChange={setFields}
        sample={sample}
        siteIcon={null}
        project={project}
        styles={styles}
        onStyles={setStyles}
        skills={[]}
        savedTemplate={initial.template}
      />
      <CardBrandFields
        fields={fields}
        onChange={setFields}
        onError={onError}
        siteIcon={null}
        project={project}
      />
    </>
  );
}
const frameTitles = (list: HTMLElement) =>
  within(list)
    .getAllByTitle(/./)
    .map((f) => f.getAttribute('title'));

it('previews the style in use with the latest set’s cards and the brand kit’s closing page, which goes when cleared', async () => {
  const user = userEvent.setup();
  render(
    <Brand
      initial={cardFieldsOf({ template: 'editorial', logo: null, ending })}
      sample={{ subject: 'Inbox to one board', cards: sampleCards }}
    />,
  );
  expect(
    screen.getByText(
      'Not set; the cards show the first letter of the project name',
    ),
  ).toBeInTheDocument();
  const preview = screen.getByRole('list', { name: 'Editorial' });
  expect(frameTitles(preview)).toEqual([
    'Inbox to one board',
    'No one owned an email',
    'Follow Acme',
  ]);
  const frame = within(preview).getByTitle('Follow Acme');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain('Follow Acme');
  expect(frame.getAttribute('srcdoc')).toContain('"template":"editorial"');

  await user.clear(
    screen.getByRole('textbox', { name: 'Closing page heading' }),
  );
  await vi.waitFor(() => expect(frameTitles(preview)).toHaveLength(2));
});

it('changes the card style in a picker that previews every built-in style with the same cards', async () => {
  const user = userEvent.setup();
  render(<Brand initial={cardFieldsOf({ template: 'editorial', ending })} />);
  await user.click(screen.getByRole('button', { name: 'Change style' }));
  const dialog = screen.getByRole('dialog', { name: 'Card style' });
  expect(dialog).toHaveTextContent(
    'Previewed with sample text until a Xiaohongshu set has been made.',
  );
  const styles = within(dialog).getAllByRole('radio');
  expect(styles.map((r) => r.getAttribute('aria-checked'))).toEqual([
    'true',
    'false',
    'false',
    'false',
  ]);
  expect(styles[0]).toHaveTextContent('Editorial');
  expect(styles[0]).toHaveTextContent('In use');
  expect(
    frameTitles(within(dialog).getByRole('list', { name: 'Dark tech' })),
  ).toEqual([
    'Three steps to a weekly report people read',
    'Step 1: lead with the result',
    'Follow Acme',
  ]);

  await user.click(within(dialog).getByRole('radio', { name: /^Memo/ }));
  await user.click(within(dialog).getByRole('button', { name: 'Use Memo' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('list', { name: 'Memo' })).toBeInTheDocument();
  expect(
    screen.getByText(/A notes app page with check marks/),
  ).toBeInTheDocument();
});

it('turns down a logo that is not a small image and takes one that is', async () => {
  const user = userEvent.setup({ applyAccept: false });
  const onError = vi.fn();
  const { container } = render(
    <Brand initial={cardFieldsOf(null)} onError={onError} />,
  );
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  await user.upload(
    input,
    new File([new Uint8Array(300 * 1024)], 'logo.png', { type: 'image/png' }),
  );
  expect(onError).toHaveBeenLastCalledWith(
    'The logo must be a PNG, JPEG or WebP image of at most 200 KB',
  );
  await user.upload(
    input,
    new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
  );
  expect(onError).toHaveBeenCalledTimes(2);

  await user.upload(
    input,
    new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
      type: 'image/png',
    }),
  );
  await vi.waitFor(() =>
    expect(screen.getByText('Uploaded logo')).toBeInTheDocument(),
  );
  expect(onError).toHaveBeenLastCalledWith('');
});

describe('Edit card text', () => {
  const current = cardStyle(
    { template: 'memo', color: '#0f766e', ending },
    { name: 'Acme', icon: 'data:image/png;base64,bmV3' },
  );
  // The set was drawn in Dark tech with the logo then; the brand kit has another style and logo now.
  const drawnWith = cardStyle(
    { template: 'dark', color: '#1e40af', ending },
    {
      name: 'Acme',
      icon: 'data:image/png;base64,b2xk',
    },
  );
  const edit = (onSave = vi.fn(async () => true), onClose = vi.fn()) => {
    const out = artifact({ cards: { ...set, style: styleBrief(drawnWith) } });
    render(
      <XhsCardEditor
        out={out}
        current={current}
        initial={3}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    return { onSave, onClose };
  };

  it('opens on a card, shows its count and whether its text fits as the template measures it', async () => {
    drawing.overflow = [3];
    edit();
    const dialog = screen.getByRole('dialog', { name: 'Edit card text' });
    expect(within(dialog).getByRole('tab', { name: 'Card 3' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(dialog).getByText('Card 3 of 5 · Source sections: 2 · 1080×1440'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Card heading')).toHaveValue(
      'Week one: nine days',
    );
    expect(within(dialog).getByLabelText('Card text')).toHaveValue(LONG);
    expect(dialog).toHaveTextContent(
      /Heading and text: 1\d\d \/ 110 characters/,
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The text of card 3 does not fit',
    );
    // The preview is drawn by the style the set was drawn in.
    expect(
      within(dialog).getByTitle('Card 3').getAttribute('srcdoc'),
    ).toContain('"template":"dark"');
    expect(dialog).toHaveTextContent('No changes yet');
    expect(
      within(dialog).getByRole('button', { name: 'Save as a new version' }),
    ).toBeDisabled();
  });

  it('draws every card again in the browser and saves the text with the new images as one version', async () => {
    const user = userEvent.setup();
    const images = [1, 2, 3, 4, 5].map(() => new Blob(['png']));
    drawing.renderCards.mockResolvedValue({ images, overflow: [] });
    drawing.upload.mockImplementation(async (_: Blob, name: string) => ({
      id: `id-${name}`,
      ref: `/uploads/${name}`,
      name,
    }));
    const { onSave, onClose } = edit();
    const text = screen.getByLabelText('Card text');
    await user.clear(text);
    await user.type(text, 'A card waited nine days.');
    await user.click(screen.getByRole('tab', { name: 'Title and body' }));
    const title = screen.getByLabelText('Note title');
    await user.clear(title);
    await user.type(title, 'One board');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Edited Card 3 · Edited the title and body',
    );
    await user.click(
      screen.getByRole('button', { name: 'Save as a new version' }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());

    const [style, cards] = drawing.renderCards.mock.calls[0];
    expect(style).toMatchObject({
      template: 'dark',
      color: '#1e40af',
      logo: 'data:image/png;base64,bmV3',
    });
    expect(cards).toHaveLength(5);
    expect(cards[2]).toEqual({
      layout: 'text',
      heading: 'Week one: nine days',
      text: 'A card waited nine days.',
    });
    // One upload per card, in order, under one request.
    expect(drawing.upload.mock.calls.map(([, name]) => name)).toEqual([
      'card-01.png',
      'card-02.png',
      'card-03.png',
      'card-04.png',
      'card-05.png',
    ]);
    expect(new Set(drawing.upload.mock.calls.map(([, , id]) => id)).size).toBe(
      1,
    );
    const [saved] = onSave.mock.calls[0] as unknown as [
      { content: string; cards: { images: string[]; overflow: number[] } },
    ];
    expect(saved.cards).toEqual({
      images: images.map((_, i) => `id-card-0${i + 1}.png`),
      overflow: [],
    });
    const pieces = parseRepurpose('xhs', saved.content)!.pieces;
    expect(pieces.find((p) => p.kind === 'title')?.text).toBe('One board');
    expect(pieces.find((p) => p.index === 3)).toMatchObject({
      heading: 'Week one: nine days',
      text: 'A card waited nine days.',
      sections: '2',
    });
    expect(pieces.filter((p) => p.kind === 'card')).toHaveLength(5);
  });

  it('keeps the editor open with the text when the cards cannot be drawn or uploaded', async () => {
    const user = userEvent.setup();
    drawing.renderCards.mockResolvedValueOnce({
      images: [new Blob(['png'])],
      overflow: [],
    });
    drawing.upload.mockRejectedValue(new Error('refused'));
    drawing.renderCards.mockRejectedValue(new Error('no frame'));
    const { onSave, onClose } = edit();
    await user.type(screen.getByLabelText('Card heading'), '!');
    for (const _ of ['refused upload', 'no frame']) {
      await user.click(
        screen.getByRole('button', { name: 'Save as a new version' }),
      );
      await vi.waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save as a new version' }),
        ).toBeEnabled(),
      );
    }
    expect(drawing.upload).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Card heading')).toHaveValue(
      'Week one: nine days!',
    );
  });
});
