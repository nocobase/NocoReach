import { I18nRuntime } from '@nocobase/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import { questionBrandEvidence } from '../../client/pages/ai-question-evidence';

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  setDictionary(null);
});

const examples = [
  [
    'en-US',
    'Already mentions us',
    'Already cites us',
    'Already mentions and cites us',
  ],
  [
    'es-ES',
    'Ya se nos menciona',
    'Ya se nos cita',
    'Ya se nos menciona y cita',
  ],
  [
    'pt-BR',
    'Nossa marca já é mencionada',
    'Nossa marca já é citada',
    'Nossa marca já é mencionada e citada',
  ],
  [
    'fr-FR',
    'L’IA nous a déjà mentionnés',
    'L’IA nous a déjà cités',
    'L’IA nous a déjà mentionnés et cités',
  ],
  [
    'de-DE',
    'Die KI hat uns bereits erwähnt',
    'Die KI hat uns bereits zitiert',
    'Die KI hat uns bereits erwähnt und zitiert',
  ],
] as const;

describe('AI question hand-off evidence', () => {
  it.each(examples)(
    'uses complete %s sentences for each mention/citation state',
    async (locale, mentioned, cited, both) => {
      const runtime = new I18nRuntime({
        defaultLocale: locale,
        locales: Object.keys(locales),
        applicationNamespace: 'nocoreach',
      });
      runtime.registerApplicationNamespace('nocoreach', locales);
      await runtime.init();
      disconnect = connectLocale(runtime);
      for (const [weNamed, weCited, expected] of [
        [true, false, mentioned],
        [false, true, cited],
        [true, true, both],
      ] as const) {
        const evidence = questionBrandEvidence(weNamed, weCited);
        expect(evidence).toBe(expected);
        expect(evidence).not.toMatch(
          /MentionnéCité|ErwähntZitiert|MencionadoCitado|Con menciónCitado/,
        );
      }
    },
  );
});
