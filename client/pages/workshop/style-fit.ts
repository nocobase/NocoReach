import { useEffect, useState } from 'react';
import { $t } from '#i18n';
import { renderCards } from '#lib/card-render';
import {
  CARD_SPECS,
  FULL_CARD_SAMPLE,
  cardLength,
  cardMax,
  cardUnit,
  wordCount,
  type CardSize,
  type CardUnit,
} from '../../../shared/repurpose.js';
import type { CardStyle, TemplateCard } from '../../../shared/xhs-card.js';
import type { CardFields, WorkshopView } from './model.js';

// Whether a card style holds every card's text (2026-11-24: Xiaohongshu at 3:4, Instagram and LinkedIn at 4:5). A style
// is drawn with the cards it is previewed with and a card of the most text a card may hold: at 3:4 a full card of 110
// characters, at 4:5 that card and a full English card of 40 words, since an English set goes to Instagram and LinkedIn.

/**
 * The cards a style is previewed with: the latest carousel's, else sample text; the closing page is the one the brand
 * kit now has, or none.
 */
export function previewCards(
  sample: WorkshopView['cardSample'],
  fields: CardFields,
): TemplateCard[] {
  const body: TemplateCard[] = sample?.cards.length
    ? sample.cards.filter((c) => c.layout !== 'end')
    : [
        {
          layout: 'cover',
          heading: $t('workshop.sampleCoverHeading'),
          text: $t('workshop.sampleCoverText'),
        },
        ...[
          $t('workshop.sampleCardHeading'),
          $t('workshop.sampleCard2Heading'),
          $t('workshop.sampleCard3Heading'),
        ].map((heading) => ({
          layout: 'text' as const,
          heading,
          text: $t('workshop.sampleCardText'),
        })),
      ];
  const heading = fields.endingHeading.trim();
  return heading
    ? [...body, { layout: 'end', heading, text: fields.endingText.trim() }]
    : body;
}

export type Ratio = '3:4' | '4:5';
/** The cards a style is drawn with at one size, and which of them are the full cards (numbered from 1). */
export type FitCheck = {
  ratio: Ratio;
  size: CardSize;
  cards: TemplateCard[];
  fullChars: number;
  fullWords?: number;
};
/** A size's cards whose text does not fit, by number. */
export type FitResult = { ratio: Ratio; overflow: number[] };

/** A card of the most text a card may hold in a unit: the longest such card of the set, its text repeated to the limit. */
export function fullCard(cards: TemplateCard[], unit: CardUnit): TemplateCard {
  const base = [...cards]
    .filter((c) => c.layout === 'text' && cardUnit([c]) === unit)
    .sort((a, b) => cardLength(b, unit) - cardLength(a, unit))[0] || {
    layout: 'text' as const,
    ...FULL_CARD_SAMPLE[unit],
  };
  const heading = base.heading || '';
  const max = cardMax(unit);
  let text = base.text;
  while (cardLength({ heading, text }, unit) < max) text += `\n${base.text}`;
  if (unit === 'words') {
    let room = max - wordCount(heading);
    const kept = text.split(/(\s+)/).filter((part) => {
      if (/^\s+$/.test(part) || !part) return room > 0;
      if (!/[\p{L}\p{N}]/u.test(part)) return room > 0;
      return room-- > 0;
    });
    return { layout: 'text', heading, text: kept.join('').trim() };
  }
  let room = max - cardLength({ heading, text: '' }, unit);
  let end = 0;
  for (const ch of text) {
    if (!/\s/.test(ch) && room-- <= 0) break;
    end += ch.length;
  }
  return { layout: 'text', heading, text: text.slice(0, end).trim() };
}

/** What a style is checked with at each size. */
export function fitChecks(cards: TemplateCard[]): FitCheck[] {
  const chars = fullCard(cards, 'chars'),
    words = fullCard(cards, 'words');
  return [
    {
      ratio: '3:4',
      size: CARD_SPECS.xhs,
      cards: [...cards, chars],
      fullChars: cards.length + 1,
    },
    {
      ratio: '4:5',
      size: CARD_SPECS.instagram,
      cards: [...cards, chars, words],
      fullChars: cards.length + 1,
      fullWords: cards.length + 2,
    },
  ];
}

/** A size's check drawn: the drawn cards and those whose text does not fit. */
export async function drawCheck(style: CardStyle, check: FitCheck) {
  const drawn = await renderCards(style, check.cards, check.size);
  return { ...drawn, ratio: check.ratio };
}

// A style's 4:5 check, kept for the page's life: Brand and templates and What to make ask for the same style often.
const checked45 = new Map<string, number[]>();

/**
 * The cards whose text does not fit when a style draws them at 4:5 (Instagram, LinkedIn): one of My styles saved before
 * 4:5 was checked is checked when it is first used there (2026-11-24). Null while it is drawn, or when the browser
 * cannot draw it.
 */
export function useOverflow45(
  style: CardStyle | null,
  cards: TemplateCard[],
): number[] | null {
  const key = style ? JSON.stringify([style, cards]) : '';
  const [drawn, setDrawn] = useState<{ key: string; overflow: number[] }>();
  useEffect(() => {
    if (!style || checked45.has(key)) return;
    let live = true;
    drawCheck(style, fitChecks(cards)[1]).then(
      ({ overflow }) => {
        checked45.set(key, overflow);
        if (live) setDrawn({ key, overflow });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // The key stands for the style and the cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [key]);
  return checked45.get(key) ?? (drawn?.key === key ? drawn.overflow : null);
}
