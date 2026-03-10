import { createLogger } from "@/lib/logger";
import {
    getSettings,
    saveSettings as saveSettingsApi,
    type AppSettings,
} from "@/lib/tauri";
import { getThemeById } from "@/lib/terminal-themes";
import { create } from "zustand";

export type { AppSettings } from "@/lib/tauri";

const logger = createLogger("settings-store");

type ThemeMode = "dark" | "light" | "system";

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? getSystemTheme() : mode;
}

interface SettingsState {
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  scrollBack: number;
  terminalThemeId: string;
  defaultShell: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavRemoteDir: string;
  syncEncryptionPassword: string;

  loaded: boolean;
  loadSettings: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  setCursorStyle: (cursorStyle: "block" | "underline" | "bar") => void;
  setScrollBack: (scrollBack: number) => void;
  setTerminalThemeId: (id: string) => void;
  setDefaultShell: (shell: string) => void;
  setWebdavUrl: (url: string) => void;
  setWebdavUsername: (username: string) => void;
  setWebdavPassword: (password: string) => void;
  setWebdavRemoteDir: (dir: string) => void;
  setSyncEncryptionPassword: (password: string) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistToBackend(getState: () => SettingsState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const state = getState();
    const settings: AppSettings = {
      theme: state.theme,
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      cursorStyle: state.cursorStyle,
      scrollBack: state.scrollBack,
      terminalThemeId: state.terminalThemeId,
      defaultShell: state.defaultShell,
      webdavUrl: state.webdavUrl,
      webdavUsername: state.webdavUsername,
      webdavPassword: state.webdavPassword,
      webdavRemoteDir: state.webdavRemoteDir,
      syncEncryptionPassword: state.syncEncryptionPassword,
    };
    saveSettingsApi(settings).catch((e) =>
      logger.warn("Failed to persist settings:", e)
    );
  }, 500);
}

const DEFAULT_FONT_FAMILY = "monospace";

const LEGACY_FONT_FAMILIES = new Set([
  "Consolas, Menlo, Monaco, Courier New, monospace",
]);

function migrateFontFamily(stored: string): string {
  if (!stored || LEGACY_FONT_FAMILIES.has(stored)) return DEFAULT_FONT_FAMILY;
  return stored;
}

function applyResolvedTheme(state: SettingsState) {
  const resolved = resolveTheme(state.theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  const currentTermTheme = getThemeById(state.terminalThemeId);
  if (currentTermTheme.variant !== resolved) {
    const fallback = resolved === "dark" ? "default-dark" : "github-light";
    useSettingsStore.setState({ terminalThemeId: fallback });
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: "system" as ThemeMode,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 14,
  cursorStyle: "block",
  scrollBack: 10000,
  terminalThemeId: "default-dark",
  defaultShell: "auto",
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavRemoteDir: "/termix",
  syncEncryptionPassword: "",
  loaded: false,

  loadSettings: async () => {
    try {
      const s = await getSettings();
      const theme: ThemeMode = s.theme === "light" ? "light" : s.theme === "system" ? "system" : "dark";
      const resolved = resolveTheme(theme);
      document.documentElement.classList.toggle("dark", resolved === "dark");
      set({
        theme,
        fontFamily: migrateFontFamily(s.fontFamily),
        fontSize: s.fontSize || 14,
        cursorStyle: (s.cursorStyle as "block" | "underline" | "bar") || "block",
        scrollBack: s.scrollBack || 10000,
        terminalThemeId: s.terminalThemeId || "default-dark",
        defaultShell: s.defaultShell || "auto",
        webdavUrl: s.webdavUrl || "",
        webdavUsername: s.webdavUsername || "",
        webdavPassword: s.webdavPassword || "",
        webdavRemoteDir: s.webdavRemoteDir || "/termix",
        syncEncryptionPassword: s.syncEncryptionPassword || "",
        loaded: true,
      });

      if (theme === "system") {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        mql.addEventListener("change", () => {
          const state = useSettingsStore.getState();
          if (state.theme === "system") {
            applyResolvedTheme(state);
          }
        });
      }
    } catch (e) {
      logger.warn("Failed to load settings:", e);
      document.documentElement.classList.add("dark");
      set({ loaded: true });
    }
  },

  setTheme: (theme) => {
    const resolved = resolveTheme(theme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    const currentTermTheme = getThemeById(get().terminalThemeId);
    if (currentTermTheme.variant !== resolved) {
      const fallback = resolved === "dark" ? "default-dark" : "github-light";
      set({ theme, terminalThemeId: fallback });
    } else {
      set({ theme });
    }

    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", () => {
        const state = useSettingsStore.getState();
        if (state.theme === "system") {
          applyResolvedTheme(state);
        }
      });
    }

    persistToBackend(get);
  },

  setFontFamily: (fontFamily) => {
    set({ fontFamily });
    persistToBackend(get);
  },
  setFontSize: (fontSize) => {
    set({ fontSize });
    persistToBackend(get);
  },
  setCursorStyle: (cursorStyle) => {
    set({ cursorStyle });
    persistToBackend(get);
  },
  setScrollBack: (scrollBack) => {
    set({ scrollBack });
    persistToBackend(get);
  },
  setTerminalThemeId: (id) => {
    set({ terminalThemeId: id });
    persistToBackend(get);
  },
  setDefaultShell: (shell) => {
    set({ defaultShell: shell });
    persistToBackend(get);
  },
  setWebdavUrl: (url) => {
    set({ webdavUrl: url });
    persistToBackend(get);
  },
  setWebdavUsername: (username) => {
    set({ webdavUsername: username });
    persistToBackend(get);
  },
  setWebdavPassword: (password) => {
    set({ webdavPassword: password });
    persistToBackend(get);
  },
  setWebdavRemoteDir: (dir) => {
    set({ webdavRemoteDir: dir });
    persistToBackend(get);
  },
  setSyncEncryptionPassword: (password) => {
    set({ syncEncryptionPassword: password });
    persistToBackend(get);
  },
}));
