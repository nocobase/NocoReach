import { afterEach, describe, expect, it } from 'vitest';
import { renderCards } from '../../client/lib/card-render';
import { CARD_MESSAGE, type CardMessage } from '../../shared/xhs-card';

// 2026-11-17: the hidden frame that draws a set in the browser sometimes ran before its first layout, measured every box
// as empty and drew the text at its largest size, cut off. The template now waits for layout and, still without it,
// says so; such a set is never drawn.

const style = {
  template: 'editorial',
  color: '#1e40af',
  brand: 'Acme',
} as const;
const cards = [
  { layout: 'text', heading: 'One', text: 'First card.' },
  { layout: 'text', heading: 'Two', text: 'Second card.' },
] as const;

const answer = (frame: HTMLIFrameElement, data: CardMessage) =>
  window.dispatchEvent(
    new MessageEvent('message', { source: frame.contentWindow, data }),
  );

afterEach(() => document.body.replaceChildren());

describe('renderCards', () => {
  it('draws nothing from a template that never laid its cards out', async () => {
    const drawing = renderCards(style, [...cards]);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[sandbox]');
    expect(frame?.srcdoc).toContain('window.CARD_EXPORT = true');
    answer(frame!, {
      source: CARD_MESSAGE,
      overflow: [1, 2],
      unmeasured: true,
      cards: [
        { n: 1, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
        { n: 2, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
      ],
    });
    await expect(drawing).rejects.toThrow('did not lay the cards out');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ignores messages from any other window', async () => {
    const drawing = renderCards(style, [...cards]);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[sandbox]')!;
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { source: CARD_MESSAGE, overflow: [], cards: [] },
      }),
    );
    answer(frame, { source: CARD_MESSAGE, overflow: [], cards: [] });
    await expect(drawing).rejects.toThrow('different number of cards');
  });
});
