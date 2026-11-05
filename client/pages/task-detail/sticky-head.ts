import { useEffect, useState } from 'react';

/**
 * A sticky bar's height as `--nr-sticky-head` on the element holding it, so a toolbar further down (the article
 * editor's) sticks right under the bar instead of behind it. Returns the bar's ref.
 */
export function useStickyHead<T extends HTMLElement>() {
  const [bar, setBar] = useState<T | null>(null);
  useEffect(() => {
    const holder = bar?.parentElement;
    if (!bar || !holder || typeof ResizeObserver === 'undefined') return;
    const measure = () =>
      holder.style.setProperty('--nr-sticky-head', `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      holder.style.removeProperty('--nr-sticky-head');
    };
  }, [bar]);
  return setBar;
}
