import { useSearchParams } from 'react-router';

export type TechnicalTab = 'result' | 'runs';

/**
 * Whether Technical details is open, and on which tab. It lives in the search params so an old `?run=<id>` link and
 * a refresh both land on the same run; closing removes both.
 */
export function useTechnicalDetails() {
  const [params, setParams] = useSearchParams();
  const tab: TechnicalTab | null =
    params.get('details') === 'result'
      ? 'result'
      : params.get('details') === 'runs' || params.has('run')
        ? 'runs'
        : null;
  const set = (next: TechnicalTab | null) =>
    setParams((previous) => {
      const out = new URLSearchParams(previous);
      if (next) out.set('details', next);
      else {
        out.delete('details');
        out.delete('run');
      }
      if (next === 'result') out.delete('run');
      return out;
    });
  return { tab, open: set, close: () => set(null) };
}
