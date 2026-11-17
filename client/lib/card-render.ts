import { XHS } from '../../shared/repurpose.js';
import {
  CARD_MESSAGE,
  cardTemplate,
  type CardMessage,
  type CardStyle,
  type TemplateCard,
} from '../../shared/xhs-card.js';

// Xiaohongshu cards drawn in the browser (Edit directly, 2026-11-17): the set's own template page runs in a sandboxed
// frame without access to this page, sizes the text as it does for the Agent, and posts each card as a self-contained
// SVG (shared/xhs-card.ts CARD_EXPORT), which is drawn here to a PNG of the card size. The fonts are this computer's,
// so a saved edit draws the whole set again rather than mixing two computers' fonts in one set.

const WAIT = 30_000;

/** The template's message from `frame`, once its cards are drawn and measured. */
export function cardMessage(frame: HTMLIFrameElement): Promise<CardMessage> {
  return new Promise((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent) => {
      const data = event.data as CardMessage | null;
      if (event.source !== frame.contentWindow || data?.source !== CARD_MESSAGE)
        return;
      done();
      resolve(data);
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error('The card template did not answer.'));
    }, WAIT);
    window.addEventListener('message', receive);
  });
}

async function png(svg: string): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = XHS.width;
  canvas.height = XHS.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the cards on.');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The card was not drawn.')),
      'image/png',
    ),
  );
}

/** Every card of a set drawn with its style, as PNGs in the cards' order, and the cards whose text does not fit. */
export async function renderCards(
  style: CardStyle,
  cards: TemplateCard[],
): Promise<{ images: Blob[]; overflow: number[] }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Laid out at the card size and kept in view, as a browser may not draw a frame it holds off-screen.
  frame.style.cssText = `position:fixed;left:0;top:0;width:${XHS.width}px;height:${XHS.height}px;border:0;opacity:0;pointer-events:none;z-index:-1;transform:scale(.01);transform-origin:0 0`;
  const message = cardMessage(frame);
  frame.srcdoc = cardTemplate(style, { cards, exporting: true });
  document.body.appendChild(frame);
  try {
    const answer = await message;
    if (answer.unmeasured)
      throw new Error('The browser did not lay the cards out to size them.');
    const drawn = [...(answer.cards || [])].sort((a, b) => a.n - b.n);
    if (drawn.length !== cards.length)
      throw new Error('The card template drew a different number of cards.');
    const images: Blob[] = [];
    for (const card of drawn) images.push(await png(card.svg));
    return { images, overflow: answer.overflow };
  } finally {
    frame.remove();
  }
}
