import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

const STORAGE_KEY = 'side:active-panel';
const ACTIVE_PANEL_EVENT = 'librechat:set-active-panel';
export const DEFAULT_PANEL = 'conversations';

export function setActivePanelFromOutside(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent<string>(ACTIVE_PANEL_EVENT, { detail: id }));
}

function getInitialActivePanel(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? saved : DEFAULT_PANEL;
}

interface ActivePanelContextType {
  active: string;
  setActive: (id: string) => void;
}

const ActivePanelContext = createContext<ActivePanelContextType | undefined>(undefined);

export function ActivePanelProvider({ children }: { children: ReactNode }) {
  const [active, _setActive] = useState<string>(getInitialActivePanel);

  const setActive = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    _setActive(id);
  }, []);

  useEffect(() => {
    const handleExternalActivePanel = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string' && id.length > 0) {
        _setActive(id);
      }
    };

    window.addEventListener(ACTIVE_PANEL_EVENT, handleExternalActivePanel);
    return () => window.removeEventListener(ACTIVE_PANEL_EVENT, handleExternalActivePanel);
  }, []);

  const value = useMemo(() => ({ active, setActive }), [active, setActive]);

  return <ActivePanelContext.Provider value={value}>{children}</ActivePanelContext.Provider>;
}

export function useActivePanel() {
  const context = useContext(ActivePanelContext);
  if (context === undefined) {
    throw new Error('useActivePanel must be used within an ActivePanelProvider');
  }
  return context;
}

/** Returns `active` when it matches a known link, otherwise the first link's id. */
export function resolveActivePanel(active: string, links: { id: string }[]): string {
  if (links.length > 0 && links.some((l) => l.id === active)) {
    return active;
  }
  return links[0]?.id ?? active;
}
