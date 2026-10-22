import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type ReactElement,
  type SetStateAction,
} from 'react';

/**
 * NocoReach: the selected tab of a top-level page, for the header trail. A tab is not a level of the trail — tab routes
 * declare no `breadcrumb`, a `?tab=` is not a route at all, and the compact header offers no way back from one — so it
 * is not declared with `usePageBreadcrumb`, which would make the page read as one below another. Once the page's
 * heading has scrolled away, the header names the tab after the page instead: "GitHub › Trending" (`Breadcrumbs`).
 *
 * Tabs are built several ways (shadcn `Tabs`, route links, `?tab=` buttons), so the page says which one is selected
 * rather than the shell guessing it from the DOM. Tabs inside a block, such as a report's table tabs, are not declared.
 */
const SetPageTabContext = createContext<Dispatch<
  SetStateAction<string | undefined>
> | null>(null);
const PageTabContext = createContext<string | undefined>(undefined);

/** Holds the tab the current page declares; the layout wraps both its header and its pages in it. */
export function PageTabProvider({ children }: PropsWithChildren): ReactElement {
  const [label, setLabel] = useState<string>();
  return createElement(
    SetPageTabContext.Provider,
    { value: setLabel },
    createElement(PageTabContext.Provider, { value: label }, children),
  );
}

/** Declares the label of the page's selected tab, without counts; `undefined` while it is not known. */
export function usePageTab(label: string | undefined): void {
  const setLabel = useContext(SetPageTabContext);
  useEffect(() => {
    if (!setLabel) return;
    setLabel(label);
    return () => setLabel(undefined);
  }, [setLabel, label]);
}

/** The tab the current page declared, for the layout's header. */
export function usePageTabLabel(): string | undefined {
  return useContext(PageTabContext);
}
