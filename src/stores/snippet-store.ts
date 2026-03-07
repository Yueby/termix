import { create } from "zustand";
import {
  getSnippets,
  saveSnippet,
  deleteSnippet,
  type Snippet,
} from "@/lib/tauri";

export type { Snippet } from "@/lib/tauri";

export function isSnippetEmpty(s: Snippet): boolean {
  return !s.name.trim() && !s.content.trim() && (s.tags ?? []).length === 0;
}

interface SnippetState {
  snippets: Snippet[];
  loaded: boolean;
  loadSnippets: () => Promise<void>;
  addSnippet: (snippet: Snippet) => Promise<void>;
  updateSnippet: (id: string, partial: Partial<Snippet>) => Promise<void>;
  removeSnippet: (id: string) => Promise<void>;
}

export const useSnippetStore = create<SnippetState>()((set, get) => ({
  snippets: [],
  loaded: false,

  loadSnippets: async () => {
    try {
      const snippets = await getSnippets();
      set({ snippets, loaded: true });
    } catch (e) {
      console.warn("Failed to load snippets from backend:", e);
      set({ loaded: true });
    }
  },

  addSnippet: async (snippet) => {
    set((state) => ({ snippets: [...state.snippets, snippet] }));
    try {
      await saveSnippet(snippet);
    } catch (e) {
      console.warn("Failed to save snippet:", e);
    }
  },

  updateSnippet: async (id, partial) => {
    const existing = get().snippets.find((s) => s.id === id);
    if (!existing) return;
    const updated = { ...existing, ...partial };
    set((state) => ({
      snippets: state.snippets.map((s) => (s.id === id ? updated : s)),
    }));
    try {
      await saveSnippet(updated);
    } catch (e) {
      console.warn("Failed to update snippet:", e);
    }
  },

  removeSnippet: async (id) => {
    set((state) => ({
      snippets: state.snippets.filter((s) => s.id !== id),
    }));
    try {
      await deleteSnippet(id);
    } catch (e) {
      console.warn("Failed to delete snippet:", e);
    }
  },
}));
