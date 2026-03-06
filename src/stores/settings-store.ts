import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getThemeById } from "@/lib/terminal-themes";

interface SettingsState {
  theme: "dark" | "light";
  fontFamily: string;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  scrollBack: number;
  terminalThemeId: string;
  defaultShell: string;
  setTheme: (theme: "dark" | "light") => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  setCursorStyle: (cursorStyle: "block" | "underline" | "bar") => void;
  setScrollBack: (scrollBack: number) => void;
  setTerminalThemeId: (id: string) => void;
  setDefaultShell: (shell: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      fontFamily: "JetBrains Mono, Consolas, monospace",
      fontSize: 14,
      cursorStyle: "block",
      scrollBack: 10000,
      terminalThemeId: "default-dark",
      defaultShell: "auto",

      setTheme: (theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        const currentTermTheme = getThemeById(get().terminalThemeId);
        if (currentTermTheme.variant !== theme) {
          const fallback = theme === "dark" ? "default-dark" : "github-light";
          set({ theme, terminalThemeId: fallback });
        } else {
          set({ theme });
        }
      },
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
      setCursorStyle: (cursorStyle) => set({ cursorStyle }),
      setScrollBack: (scrollBack) => set({ scrollBack }),
      setTerminalThemeId: (id) => set({ terminalThemeId: id }),
      setDefaultShell: (shell) => set({ defaultShell: shell }),
    }),
    {
      name: "termix-settings",
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle("dark", state.theme === "dark");
        }
      },
    }
  )
);
