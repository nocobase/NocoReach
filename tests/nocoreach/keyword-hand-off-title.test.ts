import { I18nRuntime } from '@nocobase/i18n';
import { afterEach, expect, it } from 'vitest';
import { connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import {
  keywordDraft,
  type HandOffKeyword,
} from '../../client/pages/keyword-hand-off';

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  setDictionary(null);
});

const examples = [
  [
    'fr-FR',
    'Rédiger du contenu autour de « CRM »',
    'Rédiger du contenu pour 2 mots-clés, dont « CRM »',
    'Améliorer une page existante pour le mot-clé « CRM »',
    'Améliorer une page existante pour 2 mots-clés, dont « CRM »',
  ],
  [
    'de-DE',
    'Inhalte zu „CRM“ verfassen',
    'Inhalte zu 2 Keywords verfassen, darunter „CRM“',
    'Eine bestehende Seite für „CRM“ verbessern',
    'Eine bestehende Seite für 2 Keywords verbessern, darunter „CRM“',
  ],
  [
    'es-ES',
    'Redactar contenido sobre «CRM»',
    'Redactar contenido para 2 palabras clave, incluida «CRM»',
    'Mejorar una página existente para «CRM»',
    'Mejorar una página existente para 2 palabras clave, incluida «CRM»',
  ],
] as const;

it.each(examples)(
  'writes complete %s task titles for new content and existing pages',
  async (locale, writeOne, writeSeveral, improveOne, improveSeveral) => {
    const runtime = new I18nRuntime({
      defaultLocale: locale,
      locales: Object.keys(locales),
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    disconnect = connectLocale(runtime);
    const first: HandOffKeyword = {
      keyword: 'CRM',
      market: null,
      volume: 100,
      difficulty: 20,
      intent: 'informational',
    };
    const second = { ...first, keyword: 'Automation' };
    expect(keywordDraft([first]).title).toBe(writeOne);
    expect(keywordDraft([first, second]).title).toBe(writeSeveral);
    const ranked = {
      ...first,
      rank: {
        position: 12,
        clicks: 20,
        impressions: 200,
        page: 'https://example.com/crm',
      },
    };
    expect(keywordDraft([ranked]).title).toBe(improveOne);
    expect(keywordDraft([ranked, second]).title).toBe(improveSeveral);
    // A keyword that looks like legacy system copy is still user-authored text.
    expect(keywordDraft([{ ...first, keyword: '分析' }]).title).toContain(
      '分析',
    );
  },
);
