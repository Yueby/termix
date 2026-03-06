import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Snippet {
  id: string;
  name: string;
  content: string;
  tags: string[];
}

export function isSnippetEmpty(s: Snippet): boolean {
  return !s.name.trim() && !s.content.trim() && s.tags.length === 0;
}

interface SnippetState {
  snippets: Snippet[];
  addSnippet: (snippet: Snippet) => void;
  updateSnippet: (id: string, partial: Partial<Snippet>) => void;
  removeSnippet: (id: string) => void;
}

export const useSnippetStore = create<SnippetState>()(
  persist(
    (set) => ({
      snippets: [],

      addSnippet: (snippet) =>
        set((state) => ({
          snippets: [...state.snippets, snippet],
        })),

      updateSnippet: (id, partial) =>
        set((state) => ({
          snippets: state.snippets.map((s) =>
            s.id === id ? { ...s, ...partial } : s
          ),
        })),

      removeSnippet: (id) =>
        set((state) => ({
          snippets: state.snippets.filter((s) => s.id !== id),
        })),
    }),
    {
      name: "termix-snippets",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const seen = new Set<string>();
        state.snippets = state.snippets.filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      },
    }
  )
);
