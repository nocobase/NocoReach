import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  $legacyText,
  $t,
  prepareLocale,
  setDictionary,
} from '../../client/i18n';
import { TableBulkActionBar } from '../../client/components/seo/table-bulk-action-bar';
import { ruleUnitLabel } from '../../client/pages/analysis-rules/labels';
import { effectItems } from '../../client/pages/effect-model';
import { parseReplies } from '../../client/pages/reply-drafts';
import { SiteContentConnect } from '../../client/pages/site-content-connect';
import { supportedLocales } from '../../shared/i18n/locales';
import { systemMessageText } from '../../shared/i18n/messages';

const { action, discovered } = vi.hoisted(() => ({
  action: vi.fn(),
  discovered: { total: 1 },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<object>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => ({ invalidate: vi.fn() }),
}));

beforeEach(() => {
  action.mockImplementation(async (_resource: string, name: string) => {
    if (name === 'summary') return { sites: [], pages: 0 };
    if (name === 'discover')
      return {
        origin: 'https://example.com',
        sitemaps: ['https://example.com/sitemap.xml'],
        total: discovered.total,
        types: { page: discovered.total },
        samples: { page: ['https://example.com/'] },
        warnings: [],
        previewId: 'preview',
      };
    throw new Error(`Unexpected action: ${name}`);
  });
});
afterEach(() => {
  cleanup();
  setDictionary(null);
  action.mockReset();
});

it.each(supportedLocales)(
  'places the %s selection label before one or several items',
  async (locale) => {
    await prepareLocale(locale);
    const clear = vi.fn();
    const label = $t('common.keywordsSelected');
    const { rerender } = render(
      <TableBulkActionBar
        selectedCount={1}
        selectedLabel={label}
        onClear={clear}
        actions={null}
      />,
    );
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveTextContent(`${label}1`);
    fireEvent.click(screen.getByRole('button'));
    expect(clear).toHaveBeenCalledOnce();
    rerender(
      <TableBulkActionBar
        selectedCount={2}
        selectedLabel={label}
        onClear={clear}
        actions={null}
      />,
    );
    expect(toolbar).toHaveTextContent(`${label}2`);
    rerender(
      <TableBulkActionBar selectedCount={0} onClear={clear} actions={null} />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
  },
);

it.each([
  ['en-US', 'answer', 'answers', 'page', 'pages', 'place', 'places'],
  [
    'es-ES',
    'respuesta',
    'respuestas',
    'página',
    'páginas',
    'posición',
    'posiciones',
  ],
  [
    'pt-BR',
    'resposta',
    'respostas',
    'página',
    'páginas',
    'posição',
    'posições',
  ],
  ['fr-FR', 'réponse', 'réponses', 'page', 'pages', 'place', 'places'],
  ['de-DE', 'Antwort', 'Antworten', 'Seite', 'Seiten', 'Platz', 'Plätze'],
])(
  'renders singular and plural rule thresholds in %s',
  async (locale, answer, answers, page, pages, place, places) => {
    await prepareLocale(locale);
    for (const [unit, one, other] of [
      ['个回答', answer, answers],
      ['个页面', page, pages],
      ['页', page, pages],
      ['位', place, places],
    ]) {
      expect(ruleUnitLabel(unit, 1)).toBe(one);
      expect(ruleUnitLabel(unit, 2)).toBe(other);
    }
    expect(ruleUnitLabel('Custom units', 1)).toBe('Custom units');
  },
);

it.each(supportedLocales)(
  'keeps the %s reply instruction compatible with the actual parser',
  async (locale) => {
    await prepareLocale(locale);
    const instruction = $t('playbooks.communityReplyInstruction');
    expect(
      $legacyText(systemMessageText('playbooks.communityReplyInstruction')),
    ).toBe(instruction);
    expect(
      $legacyText(systemMessageText('publicSources.issuesIncludeNonPrItems')),
    ).toBe($t('publicSources.issuesIncludeNonPrItems'));
    const fields = [
      ...instruction.matchAll(/- (Link|Asking|References|Docs gap):/g),
    ].map((match) => match[1]);
    expect(fields).toEqual(['Link', 'Asking', 'References', 'Docs gap']);
    expect(instruction).toContain('### Reply');
    expect(instruction).toContain('None');
    const values: Record<string, string> = {
      Link: 'https://example.com/post',
      Asking: 'How can I configure this?',
      References: 'https://example.com/docs',
      'Docs gap': 'Explain the configuration.',
    };
    const output = [
      '## Original title',
      ...fields.map((field) => `- ${field}: ${values[field]}`),
      '### Reply',
      'Please follow the guide.',
    ].join('\n');
    expect(parseReplies(output)).toEqual([
      {
        title: 'Original title',
        url: values.Link,
        asking: values.Asking,
        refs: values.References,
        gap: values['Docs gap'],
        reply: 'Please follow the guide.',
      },
    ]);
  },
);

it.each([1, 2])(
  'renders a discovered site with %s pages in Spanish',
  async (total) => {
    await prepareLocale('es-ES');
    discovered.total = total;
    render(<SiteContentConnect projectId={1} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: $t('siteContent.readWebsite') }),
    );
    const summary = await screen.findByText(
      (_, element) =>
        element?.tagName === 'P' &&
        element.textContent?.includes(`Páginas encontradas: ${total}.`) ===
          true,
    );
    expect(summary).toHaveTextContent('Mapas del sitio: 1.');
    expect(summary).not.toHaveTextContent('1 páginas');
  },
);

it('formats expected result dates for Spanish readers without reversing month and day', async () => {
  await prepareLocale('es-ES');
  const [first] = effectItems({ observeFrom: '2026-02-23T00:00:00Z' });
  expect(first.expected).toBe('5 mar');
});
