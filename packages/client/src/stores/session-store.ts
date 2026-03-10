import { create } from "zustand";

export type ConnectionStatus =
  | "waiting_auth"
  | "connecting"
  | "authenticating"
  | "connected"
  | "disconnected"
  | "error";

export interface SessionTab {
  id: string;
  sessionId: string | null;
  connectionId: string;
  title: string;
  type: "terminal" | "local" | "log";
  status: ConnectionStatus;
  error: string | null;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  logs?: string[];
  logId?: string;
  logContent?: string;
}

interface SessionState {
  tabs: SessionTab[];
  activeTabId: string | null;
  addTab: (tab: SessionTab) => void;
  removeTab: (id: string) => void;
  removeOtherTabs: (id: string) => void;
  removeAllTabs: () => void;
  setActiveTab: (id: string | null) => void;
  updateTab: (id: string, partial: Partial<SessionTab>) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) =>
    set((state) => {
      const remaining = state.tabs.filter((t) => t.id !== id);
      const newActive =
        state.activeTabId === id
          ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
          : state.activeTabId;
      return { tabs: remaining, activeTabId: newActive };
    }),

  removeOtherTabs: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === id),
      activeTabId: id,
    })),

  removeAllTabs: () => set({ tabs: [], activeTabId: null }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })),
}));
