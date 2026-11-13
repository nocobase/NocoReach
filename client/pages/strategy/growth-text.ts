import { $t } from '#i18n';
import {
  formatChange,
  formatCount,
  formatDate,
  formatPercent,
} from '#lib/format';
import type { GrowthFigure, GrowthText } from '../../../shared/growth.js';

// How a growth's words and numbers read (shared/growth.ts): on Opportunities' growth row and Content workshop's
// Trending now cards.

/** A message key and its values in the interface language; nothing without one. */
export const say = (text?: GrowthText) =>
  text ? $t(text.key, text.params) : '';

/** A figure's value as its format says: a count, a percentage, a change, a position or a day. */
export const figureValue = (f: GrowthFigure): string =>
  typeof f.value !== 'number'
    ? f.format === 'date'
      ? formatDate(f.value)
      : f.value
    : f.format === 'percent'
      ? formatPercent(f.value)
      : f.format === 'change'
        ? formatChange(f.value)
        : f.format === 'position'
          ? formatCount(f.value, 1)
          : formatCount(f.value);
