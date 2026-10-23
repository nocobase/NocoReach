/* eslint-disable react-refresh/only-export-components -- context and its hook share their private token */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useOnlineResource, type OnlineSettings } from './api.js';

interface OnlineChatState {
  /** Chat panel › Settings, once read; undefined while loading or unreadable. */
  settings: OnlineSettings | undefined;
  /** The online assistant may be chosen: Chat panel › Settings has it on. */
  enabled: boolean;
  refresh: () => void;
  /** The panel's composer holds unsent text, so changing agent asks first. */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** Counts the messages sent from the panel, so a page showing conversations knows to read them again. */
  activity: number;
  touch: () => void;
}
const Context = createContext<OnlineChatState | null>(null);
export function OnlineChatProvider({ children }: { children: ReactNode }) {
  const [refresh, setRefresh] = useState(0);
  const settings = useOnlineResource<OnlineSettings>('settings', refresh);
  const [dirty, setDirty] = useState(false);
  const [activity, setActivity] = useState(0);
  return (
    <Context.Provider
      value={{
        settings: settings.data,
        enabled: settings.data?.enabled ?? false,
        refresh: () => setRefresh((n) => n + 1),
        dirty,
        setDirty,
        activity,
        touch: () => setActivity((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOnlineChat() {
  const context = useContext(Context);
  if (!context) throw new Error('OnlineChatProvider is required');
  return context;
}
/** The chat when the page sits inside the app layout, else null (pages rendered on their own, as in tests). */
export function useOptionalOnlineChat() {
  return useContext(Context);
}
