import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react';
import {
  NavigationType,
  useLocation,
  useNavigationType,
  useSearchParams,
} from 'react-router';

// The input is urgent local state; URL writes may be deferred by the router.
// This follows the application's URL-search pattern, retaining push navigation
// for task filters and replacing history only for the debounced search term.
export function useUrlSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  const urlSearch = searchParams.get('q') ?? '';
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(
    mutate: (params: URLSearchParams) => void,
    replace = false,
  ) {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace });
  }

  const [text, setText] = useState(urlSearch);
  const [ownSearch, setOwnSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  const [seenKey, setSeenKey] = useState(locationKey);
  const popped =
    locationKey !== seenKey && navigationType === NavigationType.Pop;
  if (locationKey !== seenKey) setSeenKey(locationKey);
  if (urlSearch !== seenSearch || popped) {
    setSeenSearch(urlSearch);
    // Acknowledging our own write must not erase newer, uncommitted characters.
    // POP restores even an equal q from a different entry. PUSH filters and our
    // own REPLACE writes still preserve newer, uncommitted input.
    if (popped || urlSearch !== ownSearch) {
      setOwnSearch(urlSearch);
      setText(urlSearch);
    }
  }

  const timerRef = useRef<number | undefined>(undefined);
  const composingRef = useRef(false);
  useEffect(() => {
    // Browser history moves before a deferred router render can commit. Cancel
    // immediately, including when the two entries have identical query text.
    const cancel = () => {
      window.clearTimeout(timerRef.current);
      composingRef.current = false;
    };
    window.addEventListener('popstate', cancel);
    return () => {
      cancel();
      window.removeEventListener('popstate', cancel);
    };
  }, []);
  useEffect(() => {
    // Also handle POP from routers without a native browser history event.
    if (navigationType === NavigationType.Pop) {
      window.clearTimeout(timerRef.current);
      composingRef.current = false;
    }
  }, [locationKey, navigationType]);
  function schedule(value: string) {
    window.clearTimeout(timerRef.current);
    const addressSearch = () =>
      new URLSearchParams(window.location.search).get('q') ?? '';
    const startSearch = paramsRef.current.get('q') ?? '';
    const startAddress = addressSearch();
    timerRef.current = window.setTimeout(() => {
      // The address bar changes before router state on back/forward. Neither
      // kind of navigation may be undone by a timer from the page being left.
      if (
        (paramsRef.current.get('q') ?? '') !== startSearch ||
        addressSearch() !== startAddress
      )
        return;
      setOwnSearch(value);
      updateParams((params) => {
        if (value) params.set('q', value);
        else params.delete('q');
      }, true);
    }, 300);
  }

  return {
    searchParams,
    search: urlSearch,
    updateParams,
    inputProps: {
      value: text,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value);
        window.clearTimeout(timerRef.current);
        if (
          !composingRef.current &&
          !(event.nativeEvent as InputEvent).isComposing
        )
          schedule(event.target.value);
      },
      onCompositionStart: () => {
        composingRef.current = true;
        window.clearTimeout(timerRef.current);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        composingRef.current = false;
        setText(event.currentTarget.value);
        schedule(event.currentTarget.value);
      },
    },
  };
}
