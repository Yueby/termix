import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NavPage = "hosts" | "snippets" | "port-forwarding" | "known-hosts";
export type ListLayout = "list" | "grid";

interface UiState {
  navPage: NavPage;
  selectedHostId: string | null;
  editingHostId: string | null;
  selectedSnippetId: string | null;
  editingSnippetId: string | null;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  listLayout: ListLayout;
  setNavPage: (page: NavPage) => void;
  setSelectedHostId: (id: string | null) => void;
  setEditingHostId: (id: string | null) => void;
  setSelectedSnippetId: (id: string | null) => void;
  setEditingSnippetId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setListLayout: (layout: ListLayout) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      navPage: "hosts",
      selectedHostId: null,
      editingHostId: null,
      selectedSnippetId: null,
      editingSnippetId: null,
      commandPaletteOpen: false,
      settingsOpen: false,
      listLayout: "grid",

      setNavPage: (page) => set({
        navPage: page,
        selectedHostId: null,
        editingHostId: null,
        selectedSnippetId: null,
        editingSnippetId: null,
      }),
      setSelectedHostId: (id) => set({ selectedHostId: id }),
      setEditingHostId: (id) => set({ editingHostId: id }),
      setSelectedSnippetId: (id) => set({ selectedSnippetId: id }),
      setEditingSnippetId: (id) => set({ editingSnippetId: id }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setListLayout: (layout) => set({ listLayout: layout }),
    }),
    {
      name: "termix-ui",
      partialize: (state) => ({ listLayout: state.listLayout }),
    }
  )
);
