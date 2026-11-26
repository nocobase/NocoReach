import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import {
  parseRepurpose,
  repurposeChecks,
  type CardSet,
  type RepurposeForm,
} from '../../shared/repurpose';
import { cardStyle } from '../../shared/xhs-card';
import { RepurposeResult } from '../../client/pages/task-detail/repurpose-result';
import {
  XhsCardEditor,
  XhsDoneTools,
  carouselDoneNote,
} from '../../client/pages/task-detail/xhs-cards';
import type {
  Artifact,
  TaskData,
} from '../../client/pages/task-execution-types';

// Carousel (2026-11-24, ui-references/carousel-destinations-2026-11-23): Instagram's and LinkedIn's places on the task
// page. Their review card shows the place's own texts, the done card downloads Instagram's images in a ZIP and
// LinkedIn's pages in one PDF, and Edit directly draws them at 4:5.

const copied = vi.hoisted(() => vi.fn<(value: string) => Promise<boolean>>());
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  copyText: copied,
}));
vi.mock('../../client/lib/card-render', () => ({
  cardMessage: () =>
    Promise.resolve({ source: 'nocoreach-xhs-card', overflow: [] }),
  renderCards: vi.fn(),
}));
// This DOM decodes no images: each card stands in as a one-pixel page.
vi.mock('../../client/lib/pdf', async (original) => ({
  ...(await original<typeof import('../../client/lib/pdf')>()),
  pdfPageOf: async () => ({
    width: 1080,
    height: 1350,
    filter: 'DCTDecode',
    data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  }),
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

const cards = (n: number) =>
  Array.from({ length: n }, (_, i) => [
    `## Card ${i + 1}`,
    `Sections: ${i + 1}`,
    `# Step ${i + 1}`,
    'One owner for every request.',
  ]).flat();
const OPENING =
  'Five people or fewer? Skip the feature list and start with how your team already works.';
const CAPTION = `${OPENING}\n\nThen pick the tool that fits it. The full comparison is at the link in bio.`;
const instagram = [
  '## Body',
  CAPTION,
  '## Hashtags',
  '#projectmanagement #smallteams #productivity #acme',
  ...cards(8),
].join('\n');
const linkedin = [
  '## Title',
  'Picking a PM tool: spreadsheet, Acme or Nimbus',
  '## Body',
  'Most small teams pick a project tool by its feature list.',
  ...cards(6),
].join('\n');

const uuid = (n: number) =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const setOf = (n: number): CardSet => ({
  images: Array.from({ length: n }, (_, i) => ({
    id: uuid(i + 1),
    ref: `/uploads/task-media/${uuid(i + 1)}.png`,
    name: `card-${i + 1}.png`,
  })),
  ratio: '4:5',
  overflow: [],
});
const artifact = (content: string, n: number, extra: Partial<Artifact> = {}) =>
  ({
    id: 'v1',
    stepId: 'adapt',
    planVersion: 1,
    version: 1,
    content,
    createdAt: '2026-11-24T07:16:00.000Z',
    createdBy: 'agent',
    cards: setOf(n),
    ...extra,
  }) as Artifact;
const taskData = (form: RepurposeForm, out: Artifact) =>
  ({
    task: { id: 46, title: 'Carousel', brief: '', evidence: { no: 46 } },
    work: { repurpose: { form } },
    repurpose: {
      checks: {
        [out.id]: repurposeChecks(form, parseRepurpose(form, out.content)!, {
          cards: out.cards,
        }),
      },
    },
    runs: [],
    artifacts: [out],
    reviews: [],
  }) as unknown as TaskData;

/** Downloads stand in: the fetched card images, and the file saved with its name. */
function downloads() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]))),
  );
  const saved = { name: '', blob: null as Blob | null };
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    saved.blob = b as Blob;
    return 'blob:file';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.name = this.download;
  });
  return saved;
}

describe('Instagram carousel', () => {
  it('reviews the caption with its opening marked, the hashtags on their own and the cards at 4:5', () => {
    const out = artifact(instagram, 8);
    render(
      <RepurposeResult
        data={taskData('instagram', out)}
        out={out}
        review
        fallback={null}
      />,
    );
    const checks = screen.getByRole('list', { name: 'Automatic checks' });
    expect(
      within(checks).getByText('4 hashtags, within 5'),
    ).toBeInTheDocument();
    expect(
      within(checks).getByText('No link in the caption'),
    ).toBeInTheDocument();
    expect(
      within(checks).getByText('8 cards, within 6–20'),
    ).toBeInTheDocument();

    const caption = document.querySelector('[data-piece="body"]')!;
    expect(caption).toHaveTextContent('Caption');
    // The opening, what shows before "more", is counted against 125 characters and marked in the caption.
    expect(caption).toHaveTextContent(
      `Opening ${OPENING.length} / 125 characters`,
    );
    expect(caption.querySelector('mark')).toHaveAttribute(
      'title',
      'What shows before “more”',
    );
    expect(caption.querySelector('mark')).toHaveTextContent(OPENING);
    expect(document.querySelector('[data-piece="tags"]')).toHaveTextContent(
      '4 / 5',
    );
    expect(
      screen.getByRole('button', { name: 'Copy Hashtags' }),
    ).toBeInTheDocument();

    const gallery = screen.getByRole('list', { name: 'Card images' });
    expect(within(gallery).getAllByRole('listitem')).toHaveLength(8);
    expect(gallery.querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull();
    expect(gallery).not.toHaveTextContent('Page 1');
  });

  it('downloads the images in a ZIP numbered 01 to NN and copies the caption and hashtags', async () => {
    const user = userEvent.setup();
    const saved = downloads();
    render(
      <XhsDoneTools
        form='instagram'
        out={artifact(instagram, 8)}
        name='T-46'
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Download 8 images' }));
    await vi.waitFor(() => expect(saved.name).toBe('T-46.zip'));
    const names = new TextDecoder('latin1').decode(
      await saved.blob!.arrayBuffer(),
    );
    expect(names).toContain('T-46-01.png');
    expect(names).toContain('T-46-08.png');

    await user.click(screen.getByRole('button', { name: 'Copy caption' }));
    await user.click(screen.getByRole('button', { name: 'Copy hashtags' }));
    expect(copied.mock.calls.map(([v]) => v)).toEqual([
      CAPTION,
      '#projectmanagement #smallteams #productivity #acme',
    ]);
    expect(carouselDoneNote('instagram', 8)).toBe(
      'The images are numbered 01–08; select them in that order when you post.',
    );
  });
});

describe('LinkedIn carousel', () => {
  it('reviews each page by its number with its source below, and the document title with its hint', () => {
    const out = artifact(linkedin, 6);
    render(
      <RepurposeResult
        data={taskData('linkedin-carousel', out)}
        out={out}
        review
        fallback={null}
      />,
    );
    const pages = within(
      screen.getByRole('list', { name: 'Card images' }),
    ).getAllByRole('listitem');
    expect(pages).toHaveLength(6);
    expect(pages[1]).toHaveTextContent('Page 2Source sections: 2');
    expect(document.querySelector('[data-piece="title"]')).toHaveTextContent(
      'Document title',
    );
    expect(
      screen.getByText(
        'Entered when you upload the PDF; shown above the document',
      ),
    ).toBeInTheDocument();
    const checks = screen.getByRole('list', { name: 'Automatic checks' });
    expect(
      within(checks).getByText('6 pages, within 6–18'),
    ).toBeInTheDocument();
    expect(
      within(checks).getByText('Document title 46 / 58 characters'),
    ).toBeInTheDocument();
  });

  it('downloads the pages as one PDF titled by the document title, and copies the title and post text', async () => {
    const user = userEvent.setup();
    const saved = downloads();
    render(
      <XhsDoneTools
        form='linkedin-carousel'
        out={artifact(linkedin, 6)}
        name='T-47'
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Download PDF (6 pages)' }),
    );
    await vi.waitFor(() => expect(saved.name).toBe('T-47.pdf'));
    expect(saved.blob!.type).toBe('application/pdf');
    const pdf = new TextDecoder('latin1').decode(
      await saved.blob!.arrayBuffer(),
    );
    expect(pdf).toContain('/Count 6');
    expect(pdf).toContain(
      '/Title (Picking a PM tool: spreadsheet, Acme or Nimbus)',
    );
    expect(pdf).toContain('/MediaBox [0 0 810 1012.5]');

    await user.click(
      screen.getByRole('button', { name: 'Copy document title' }),
    );
    await user.click(screen.getByRole('button', { name: 'Copy post text' }));
    expect(copied.mock.calls.map(([v]) => v)).toEqual([
      'Picking a PM tool: spreadsheet, Acme or Nimbus',
      'Most small teams pick a project tool by its feature list.',
    ]);
    expect(carouselDoneNote('linkedin-carousel', 6)).toBe(
      'When you post on LinkedIn, choose Add a document and upload this PDF.',
    );
  });

  it('edits a page at 4:5, counted in words, with the document title and post text in their own tab', async () => {
    const user = userEvent.setup();
    render(
      <XhsCardEditor
        form='linkedin-carousel'
        out={artifact(linkedin, 6)}
        current={cardStyle(null, { name: 'Acme' })}
        initial={2}
        onClose={() => {}}
        onSave={async () => true}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit card text' });
    expect(
      within(dialog).getByText('Page 2 of 6 · Source sections: 2 · 1080×1350'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Heading and text: 7 / 40 words');
    await user.click(
      within(dialog).getByRole('tab', {
        name: 'Document title and post text',
      }),
    );
    expect(within(dialog).getByLabelText('Document title')).toHaveValue(
      'Picking a PM tool: spreadsheet, Acme or Nimbus',
    );
    expect(within(dialog).getByLabelText('Post text')).toHaveValue(
      'Most small teams pick a project tool by its feature list.',
    );
  });
});
