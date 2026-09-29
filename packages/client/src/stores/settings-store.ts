import { createLogger } from "@/lib/logger";
import {
    getSettings,
    getSystemProxy,
    saveSettings as saveSettingsApi,
    type AppSettings,
    type ProxyConfig,
    type ProxyMode,
    type SyncBackend,
} from "@/lib/tauri";
import { getThemeById } from "@/lib/terminal-themes";
import { create } from "zustand";

export type { AppSettings, SyncBackend } from "@/lib/tauri";

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
  syncBackend: SyncBackend;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavRemoteDir: string;
  serverUrl: string;
  serverToken: string;
  vaultVersion: number;
  syncEncryptionPassword: string;
  /** Retry an SSH session automatically when it drops unexpectedly. */
  autoReconnect: boolean;
  /** Where connections go by default. */
  proxy: ProxyMode;
  /** What this machine's OS proxy resolves to; shown beside the "System" option. */
  systemProxy: ProxyConfig | null;

  loaded: boolean;
  loadSettings: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  setCursorStyle: (cursorStyle: "block" | "underline" | "bar") => void;
  setScrollBack: (scrollBack: number) => void;
  setTerminalThemeId: (id: string) => void;
  setDefaultShell: (shell: string) => void;
  setSyncBackend: (backend: SyncBackend) => void;
  setWebdavUrl: (url: string) => void;
  setWebdavUsername: (username: string) => void;
  setWebdavPassword: (password: string) => void;
  setWebdavRemoteDir: (dir: string) => void;
  setServerUrl: (url: string) => void;
  setServerToken: (token: string) => void;
  setSyncEncryptionPassword: (password: string) => void;
  setProxy: (proxy: ProxyMode) => void;
  setAutoReconnect: (enabled: boolean) => void;
  refreshSystemProxy: () => Promise<void>;
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
      syncBackend: state.syncBackend,
      webdavUrl: state.webdavUrl,
      webdavUsername: state.webdavUsername,
      webdavPassword: state.webdavPassword,
      webdavRemoteDir: state.webdavRemoteDir,
      serverUrl: state.serverUrl,
      serverToken: state.serverToken,
      vaultVersion: state.vaultVersion,
      syncEncryptionPassword: state.syncEncryptionPassword,
      autoReconnect: state.autoReconnect,
      proxy: state.proxy,
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
  syncBackend: "none" as SyncBackend,
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavRemoteDir: "/termix",
  serverUrl: "",
  serverToken: "",
  vaultVersion: 0,
  syncEncryptionPassword: "",
  autoReconnect: true,
  proxy: { mode: "direct" },
  systemProxy: null,
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
        syncBackend: (s.syncBackend as SyncBackend) || "none",
        webdavUrl: s.webdavUrl || "",
        webdavUsername: s.webdavUsername || "",
        webdavPassword: s.webdavPassword || "",
        webdavRemoteDir: s.webdavRemoteDir || "/termix",
        serverUrl: s.serverUrl || "",
        serverToken: s.serverToken || "",
        vaultVersion: s.vaultVersion ?? 0,
        syncEncryptionPassword: s.syncEncryptionPassword || "",
        autoReconnect: s.autoReconnect ?? true,
        proxy: s.proxy ?? { mode: "direct" },
        loaded: true,
      });
      void get().refreshSystemProxy();

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
  setSyncBackend: (syncBackend) => {
    set({ syncBackend });
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
  setServerUrl: (url) => {
    set({ serverUrl: url });
    persistToBackend(get);
  },
  setServerToken: (token) => {
    set({ serverToken: token });
    persistToBackend(get);
  },
  setSyncEncryptionPassword: (password) => {
    set({ syncEncryptionPassword: password });
    persistToBackend(get);
  },
  setProxy: (proxy) => {
    set({ proxy });
    persistToBackend(get);
  },
  setAutoReconnect: (autoReconnect) => {
    set({ autoReconnect });
    persistToBackend(get);
  },
  refreshSystemProxy: async () => {
    try {
      set({ systemProxy: await getSystemProxy() });
    } catch (e) {
      logger.warn("Failed to read the system proxy:", e);
      set({ systemProxy: null });
    }
  },
}));
