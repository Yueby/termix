import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NavPage = "hosts" | "snippets" | "keychain" | "port-forwarding" | "known-hosts" | "logs";
export type ActiveView = "home" | "sftp";
export type ListLayout = "list" | "grid";

export type DetailPanel =
  | { type: "host"; id: string; source?: "sftp-left" | "sftp-right" | "ssh-tab" }
  | { type: "snippet"; id: string }
  | { type: "keychain"; id: string }
  | null;

function deriveEditing(panel: DetailPanel) {
  return {
    editingHostId: panel?.type === "host" ? panel.id : null,
    editingSnippetId: panel?.type === "snippet" ? panel.id : null,
    editingKeychainId: panel?.type === "keychain" ? panel.id : null,
  };
}

interface UiState {
  navPage: NavPage;
  activeView: ActiveView;
  selectedHostId: string | null;
  selectedSnippetId: string | null;
  selectedKeychainId: string | null;
  detailPanel: DetailPanel;
  editingHostId: string | null;
  editingSnippetId: string | null;
  editingKeychainId: string | null;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  listLayout: ListLayout;
  keychainGenerateMode: boolean;
  setNavPage: (page: NavPage) => void;
  setActiveView: (view: ActiveView) => void;
  setSelectedHostId: (id: string | null) => void;
  setSelectedSnippetId: (id: string | null) => void;
  setSelectedKeychainId: (id: string | null) => void;
  setDetailPanel: (panel: DetailPanel) => void;
  setEditingHostId: (id: string | null) => void;
  setEditingSnippetId: (id: string | null) => void;
  setEditingKeychainId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setListLayout: (layout: ListLayout) => void;
  setKeychainGenerateMode: (mode: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      navPage: "hosts",
      activeView: "home",
      selectedHostId: null,
      selectedSnippetId: null,
      selectedKeychainId: null,
      detailPanel: null,
      editingHostId: null,
      editingSnippetId: null,
      editingKeychainId: null,
      commandPaletteOpen: false,
      settingsOpen: false,
      listLayout: "grid",
      keychainGenerateMode: false,

      setNavPage: (page) => set({
        navPage: page,
        selectedHostId: null,
        selectedSnippetId: null,
        selectedKeychainId: null,
        detailPanel: null,
        ...deriveEditing(null),
      }),
      setActiveView: (view) => set({ activeView: view }),
      setSelectedHostId: (id) => set({ selectedHostId: id }),
      setSelectedSnippetId: (id) => set({ selectedSnippetId: id }),
      setSelectedKeychainId: (id) => set({ selectedKeychainId: id }),
      setDetailPanel: (panel) => set({ detailPanel: panel, ...deriveEditing(panel) }),
      setEditingHostId: (id) => {
        const panel: DetailPanel = id ? { type: "host", id } : null;
        set({ detailPanel: panel, ...deriveEditing(panel) });
      },
      setEditingSnippetId: (id) => {
        const panel: DetailPanel = id ? { type: "snippet", id } : null;
        set({ detailPanel: panel, ...deriveEditing(panel) });
      },
      setEditingKeychainId: (id) => {
        const panel: DetailPanel = id ? { type: "keychain", id } : null;
        set({ detailPanel: panel, ...deriveEditing(panel) });
      },
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setListLayout: (layout) => set({ listLayout: layout }),
      setKeychainGenerateMode: (mode) => set({ keychainGenerateMode: mode }),
    }),
    {
      name: "termix-ui",
      partialize: (state) => ({ listLayout: state.listLayout }),
    }
  )
);
