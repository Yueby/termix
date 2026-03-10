import { createLogger } from "@/lib/logger";
import {
    deleteSnippet,
    getSnippets,
    saveSnippet,
    type Snippet,
} from "@/lib/tauri";
import { create } from "zustand";

export type { Snippet } from "@/lib/tauri";

const logger = createLogger("snippet-store");

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
      logger.warn("Failed to load snippets:", e);
      set({ loaded: true });
    }
  },

  addSnippet: async (snippet) => {
    const prev = get().snippets;
    set({ snippets: [...prev, snippet] });
    try {
      await saveSnippet(snippet);
    } catch (e) {
      logger.warn("Failed to save snippet, rolling back:", e);
      set({ snippets: prev });
    }
  },

  updateSnippet: async (id, partial) => {
    const prev = get().snippets;
    const existing = prev.find((s) => s.id === id);
    if (!existing) return;
    const updated = { ...existing, ...partial };
    set({ snippets: prev.map((s) => (s.id === id ? updated : s)) });
    try {
      await saveSnippet(updated);
    } catch (e) {
      logger.warn("Failed to update snippet, rolling back:", e);
      set({ snippets: prev });
    }
  },

  removeSnippet: async (id) => {
    const prev = get().snippets;
    set({ snippets: prev.filter((s) => s.id !== id) });
    try {
      await deleteSnippet(id);
    } catch (e) {
      logger.warn("Failed to delete snippet, rolling back:", e);
      set({ snippets: prev });
    }
  },
}));
