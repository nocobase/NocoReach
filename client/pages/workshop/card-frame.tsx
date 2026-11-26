import { useEffect, useMemo, useRef } from 'react';
import { cardMessage } from '#lib/card-render';
import { XHS, type CardSize } from '../../../shared/repurpose.js';
import {
  cardTemplate,
  type CardStyle,
  type TemplateCard,
} from '../../../shared/xhs-card.js';

/**
 * One card drawn by its style's template, the page the Agent renders, in a sandboxed frame scaled to `width`, at a
 * place's size (3:4 unless `size` says 4:5). With `onOverflow` it says whether the card's text fits, as the template
 * measures it.
 */
export function CardFrame({
  style,
  cards,
  n,
  width,
  title,
  size = XHS,
  onOverflow,
}: {
  style: CardStyle;
  cards: TemplateCard[];
  /** The card to draw, from 1. */
  n: number;
  width: number;
  title: string;
  size?: CardSize;
  onOverflow?: (overflows: boolean) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const page = useMemo(
    () => cardTemplate(style, { cards, n }, size),
    [style, cards, n, size],
  );
  // The latest callback, read when the frame answers, so a new one does not reload the frame.
  const reportRef = useRef(onOverflow);
  useEffect(() => {
    reportRef.current = onOverflow;
  });
  useEffect(() => {
    const frame = ref.current;
    if (!frame || !reportRef.current) return;
    let live = true;
    cardMessage(frame)
      .then((m) => {
        if (live && !m.unmeasured) reportRef.current?.(m.overflow.includes(n));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [page, n]);
  const scale = width / size.width;
  return (
    <div
      className='relative shrink-0 overflow-hidden rounded-md border bg-muted'
      style={{ width, height: size.height * scale }}
      data-ratio={`${size.width}x${size.height}`}
    >
      <iframe
        ref={ref}
        title={title}
        tabIndex={-1}
        sandbox='allow-scripts'
        srcDoc={page}
        className='pointer-events-none absolute top-0 left-0 origin-top-left border-0'
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}
