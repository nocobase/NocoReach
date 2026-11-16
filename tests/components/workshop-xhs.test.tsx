import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import {
  parseRepurpose,
  repurposeChecks,
  type CardSet,
} from '../../shared/repurpose';
import { CARD_COLORS } from '../../shared/xhs-card';
import { RepurposeResult } from '../../client/pages/task-detail/repurpose-result';
import { XhsDoneTools } from '../../client/pages/task-detail/xhs-cards';
import { CardStyleFields } from '../../client/pages/workshop/brand-cards';
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

beforeEach(() => {
  setDictionary(enDictionary as Record<string, string>);
  copied.mockResolvedValue(true);
});
afterEach(() => {
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
      'Text does not fit on card 4 (checked by the Agent while rendering)',
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

it('leaves copying to the done card once approved', () => {
  const out = artifact({ approvedAt: '2026-11-16T09:00:00.000Z' });
  render(<RepurposeResult data={taskData(out)} out={out} fallback={null} />);
  expect(screen.queryByRole('list', { name: 'Automatic checks' })).toBeNull();
  expect(screen.getByRole('list', { name: 'Card images' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Copy / })).toBeNull();
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

function Fields({
  initial,
  onError,
}: {
  initial: CardFields;
  onError: (message: string) => void;
}) {
  const [fields, setFields] = useState(initial);
  return (
    <CardStyleFields
      fields={fields}
      onChange={setFields}
      onError={onError}
      siteIcon={null}
      project={{ name: 'Acme', site: 'https://acme.example' }}
    />
  );
}

it('previews the cover, a card and the closing page, which goes when its heading is cleared', async () => {
  const user = userEvent.setup();
  render(
    <Fields
      initial={cardFieldsOf({
        logo: null,
        colors: CARD_COLORS,
        font: 'sans',
        ending: { heading: 'Follow Acme', text: 'acme.example' },
      })}
      onError={() => {}}
    />,
  );
  expect(
    screen.getByText(
      'Not set; the cards show the first letter of the project name',
    ),
  ).toBeInTheDocument();
  const preview = screen.getByRole('list', { name: 'Preview' });
  expect(
    within(preview)
      .getAllByTitle(/./)
      .map((f) => f.getAttribute('title')),
  ).toEqual(['Cover heading', 'Card heading', 'Follow Acme']);
  const frame = within(preview).getByTitle('Follow Acme');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain('Follow Acme');

  await user.clear(
    screen.getByRole('textbox', { name: 'Closing page heading' }),
  );
  await vi.waitFor(() =>
    expect(within(preview).getAllByTitle(/./)).toHaveLength(2),
  );
});

it('turns down a logo that is not a small image and takes one that is', async () => {
  const user = userEvent.setup({ applyAccept: false });
  const onError = vi.fn();
  const { container } = render(
    <Fields initial={cardFieldsOf(null)} onError={onError} />,
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
