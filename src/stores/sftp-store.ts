import { createLogger } from "@/lib/logger";
import type { ConnectionInfo, ConnectPayload, FileEntry } from "@/lib/tauri";
import {
    localCreateDir,
    localGetHomeDir,
    localListDir,
    localRemove,
    localRename,
    sftpChmod,
    sftpConnect,
    sftpDisconnect,
    sftpHomeDir,
    sftpListDir,
    sftpMkdir,
    sftpRemove,
    sftpRename,
} from "@/lib/tauri";
import { create } from "zustand";

const logger = createLogger("sftp");

export type SftpConnectionStatus =
  | "disconnected"
  | "waiting_auth"
  | "connecting"
  | "authenticating"
  | "connected"
  | "error";
export type PanelSide = "left" | "right";

export interface SftpPanelState {
  mode: "local" | "remote";
  view: "files" | "host-select" | "placeholder" | "connecting";
  previousView: "files" | "placeholder";
  currentPath: string;
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
  sftpSessionId: string | null;
  connectedHost: { id: string; name: string } | null;
  connectionStatus: SftpConnectionStatus;
  savedLocalPath: string | null;
  connectionLogs: string[];
  pendingConnection: ConnectionInfo | null;
  navRequestId: number;
}

function createDefaultPanel(mode: "local" | "remote"): SftpPanelState {
  return {
    mode,
    view: mode === "local" ? "files" : "placeholder",
    previousView: mode === "local" ? "files" : "placeholder",
    currentPath: "",
    files: [],
    loading: false,
    error: null,
    history: [],
    historyIndex: -1,
    sftpSessionId: null,
    connectedHost: null,
    connectionStatus: "disconnected",
    savedLocalPath: null,
    connectionLogs: [],
    pendingConnection: null,
    navRequestId: 0,
  };
}

interface SftpState {
  leftPanel: SftpPanelState;
  rightPanel: SftpPanelState;
  initialized: boolean;

  init: () => Promise<void>;
  navigateTo: (side: PanelSide, path: string) => Promise<void>;
  refresh: (side: PanelSide) => Promise<void>;
  goBack: (side: PanelSide) => Promise<void>;
  goForward: (side: PanelSide) => Promise<void>;
  startConnect: (side: PanelSide, conn: ConnectionInfo) => Promise<void>;
  submitAuth: (side: PanelSide, password: string) => void;
  connectRemote: (side: PanelSide, conn: ConnectionInfo, password: string) => Promise<void>;
  disconnectRemote: (side: PanelSide) => Promise<void>;
  retryConnect: (side: PanelSide) => void;
  switchToLocal: (side: PanelSide) => Promise<void>;
  showHostSelect: (side: PanelSide) => void;
  goBackFromHostSelect: (side: PanelSide) => void;
  createDir: (side: PanelSide, name: string) => Promise<void>;
  deleteEntry: (side: PanelSide, name: string, isDir: boolean) => Promise<void>;
  renameEntry: (side: PanelSide, oldName: string, newName: string) => Promise<void>;
  chmod: (side: PanelSide, name: string, mode: number) => Promise<void>;
}

function panelKey(side: PanelSide): "leftPanel" | "rightPanel" {
  return side === "left" ? "leftPanel" : "rightPanel";
}

type SetFn = (fn: ((s: SftpState) => Partial<SftpState>) | Partial<SftpState>) => void;

async function loadPathAtIndex(
  get: () => SftpState,
  set: SetFn,
  side: PanelSide,
  index: number,
) {
  const key = panelKey(side);
  const panel = get()[key];
  const path = panel.history[index];
  const requestId = panel.navRequestId + 1;

  set((s) => ({ [key]: { ...s[key], loading: true, error: null, navRequestId: requestId } }));

  try {
    let files: FileEntry[];
    if (panel.mode === "local") {
      files = await localListDir(path);
    } else {
      if (!panel.sftpSessionId) throw new Error("Not connected");
      files = await sftpListDir(panel.sftpSessionId, path);
    }
    if (get()[key].navRequestId !== requestId) return;
    set((s) => ({ [key]: { ...s[key], currentPath: path, files, loading: false } }));
  } catch (err) {
    if (get()[key].navRequestId !== requestId) return;
    set((s) => ({ [key]: { ...s[key], loading: false, error: String(err) } }));
  }
}

export const useSftpStore = create<SftpState>()((set, get) => ({
  leftPanel: createDefaultPanel("local"),
  rightPanel: createDefaultPanel("remote"),
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    try {
      const home = await localGetHomeDir();
      set((s) => ({
        leftPanel: { ...s.leftPanel, currentPath: home },
      }));
      await get().navigateTo("left", home);
    } catch {
      await get().navigateTo("left", "");
    }
  },

  navigateTo: async (side, path) => {
    const key = panelKey(side);
    const panel = get()[key];
    const requestId = panel.navRequestId + 1;

    set((s) => ({
      [key]: { ...s[key], loading: true, error: null, navRequestId: requestId },
    }));

    try {
      let files: FileEntry[];
      if (panel.mode === "local") {
        files = await localListDir(path);
      } else {
        if (!panel.sftpSessionId) {
          throw new Error("Not connected to remote host");
        }
        files = await sftpListDir(panel.sftpSessionId, path);
      }

      if (get()[key].navRequestId !== requestId) return;

      const newHistory = panel.history.slice(0, panel.historyIndex + 1);
      newHistory.push(path);

      const extra = panel.mode === "local" ? { savedLocalPath: path } : {};
      set((s) => ({
        [key]: {
          ...s[key],
          currentPath: path,
          files,
          loading: false,
          error: null,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          ...extra,
        },
      }));
    } catch (err) {
      if (get()[key].navRequestId !== requestId) return;
      set((s) => ({
        [key]: {
          ...s[key],
          loading: false,
          error: String(err),
        },
      }));
    }
  },

  refresh: async (side) => {
    const panel = get()[panelKey(side)];
    if (panel.currentPath) {
      await get().navigateTo(side, panel.currentPath);
    }
  },

  goBack: async (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    if (panel.historyIndex <= 0) return;
    const newIndex = panel.historyIndex - 1;
    set((s) => ({ [key]: { ...s[key], historyIndex: newIndex } }));
    await loadPathAtIndex(get, set, side, newIndex);
  },

  goForward: async (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    if (panel.historyIndex >= panel.history.length - 1) return;
    const newIndex = panel.historyIndex + 1;
    set((s) => ({ [key]: { ...s[key], historyIndex: newIndex } }));
    await loadPathAtIndex(get, set, side, newIndex);
  },

  startConnect: async (side, conn) => {
    const key = panelKey(side);
    const panel = get()[key];

    if (
      panel.mode === "remote" &&
      panel.connectionStatus === "connected" &&
      panel.connectedHost?.id === conn.id
    ) {
      set((s) => ({
        [key]: { ...s[key], view: "files" },
      }));
      return;
    }

    if (panel.sftpSessionId) {
      await sftpDisconnect(panel.sftpSessionId).catch((e) => logger.warn("sftpDisconnect failed:", e));
    }

    const hasCredentials =
      (conn.authType === "password" && conn.password) ||
      (conn.authType === "key" && (conn.keychainId || conn.keyPath));

    if (hasCredentials) {
      get().connectRemote(side, conn, conn.authType === "password" ? (conn.password ?? "") : (conn.keyPassphrase ?? ""));
    } else {
      set((s) => ({
        [key]: {
          ...s[key],
          view: "connecting",
          connectionStatus: "waiting_auth",
          connectedHost: { id: conn.id, name: conn.name || conn.host },
          pendingConnection: conn,
          connectionLogs: [],
          error: null,
          sftpSessionId: null,
        },
      }));
    }
  },

  submitAuth: (side, password) => {
    const key = panelKey(side);
    const panel = get()[key];
    if (!panel.pendingConnection) return;
    get().connectRemote(side, panel.pendingConnection, password);
  },

  connectRemote: async (side, conn, password) => {
    const key = panelKey(side);
    const now = () => new Date().toLocaleTimeString([], { hour12: false });
    const addLog = (msg: string) => {
      set((s) => ({
        [key]: {
          ...s[key],
          connectionLogs: [...s[key].connectionLogs, `[${now()}] ${msg}`],
        },
      }));
    };

    set((s) => ({
      [key]: {
        ...s[key],
        connectionStatus: "connecting",
        view: "connecting",
        error: null,
        connectionLogs: [],
        connectedHost: { id: conn.id, name: conn.name || conn.host },
      },
    }));

    addLog(`Connecting to ${conn.host}:${conn.port}...`);

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      let authMethod: ConnectPayload["auth_method"];
      if (conn.authType === "password") {
        authMethod = { type: "password", password };
      } else if (conn.keychainId) {
        const { useKeychainStore } = await import("@/stores/keychain-store");
        const keyItem = useKeychainStore.getState().items.find((k) => k.id === conn.keychainId);
        if (keyItem) {
          authMethod = {
            type: "key_content",
            key_content: keyItem.privateKey,
            passphrase: password || keyItem.passphrase || undefined,
          };
        } else if (conn.keyPath) {
          addLog("Warning: Keychain key not found, falling back to key path.");
          authMethod = { type: "key", key_path: conn.keyPath, passphrase: password || undefined };
        } else {
          addLog("Error: Selected keychain key not found.");
          set((s) => ({
            [key]: { ...s[key], connectionStatus: "error", error: "Keychain key not found. Please re-select the key in host settings." },
          }));
          return;
        }
      } else {
        authMethod = { type: "key", key_path: conn.keyPath ?? "", passphrase: password || undefined };
      }

      await delay(800);

      set((s) => ({
        [key]: { ...s[key], connectionStatus: "authenticating" },
      }));
      addLog(`Authenticating as ${conn.username} (${conn.authType})...`);

      const result = await sftpConnect({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        auth_method: authMethod,
      });

      addLog("SFTP session established.");

      set((s) => ({
        [key]: {
          ...s[key],
          sftpSessionId: result.session_id,
          connectionStatus: "connected",
          mode: "remote",
        },
      }));

      await delay(600);

      let homePath = "/";
      try {
        homePath = await sftpHomeDir(result.session_id);
        addLog(`Home directory: ${homePath}`);
      } catch {
        addLog("Fallback to root directory.");
      }

      set((s) => ({
        [key]: { ...s[key], view: "files" },
      }));

      await get().navigateTo(side, homePath);
    } catch (err) {
      logger.error(`connectRemote failed for ${conn.host}:${conn.port}`, err);
      addLog(`Error: ${String(err)}`);
      set((s) => ({
        [key]: {
          ...s[key],
          connectionStatus: "error",
          error: String(err),
          sftpSessionId: null,
        },
      }));
    }
  },

  retryConnect: (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    if (panel.pendingConnection) {
      get().startConnect(side, panel.pendingConnection);
    } else {
      get().showHostSelect(side);
    }
  },

  disconnectRemote: async (side) => {
    const key = panelKey(side);
    const panel = get()[key];

    if (panel.sftpSessionId) {
      await sftpDisconnect(panel.sftpSessionId).catch((e) => logger.warn("sftpDisconnect failed:", e));
    }

    set(() => ({
      [key]: {
        ...createDefaultPanel("remote"),
      },
    }));
  },

  switchToLocal: async (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    const cachedPath = panel.savedLocalPath;

    if (panel.sftpSessionId) {
      await sftpDisconnect(panel.sftpSessionId).catch((e) => logger.warn("sftpDisconnect failed:", e));
    }

    const localPanel = createDefaultPanel("local");
    localPanel.view = "files";
    localPanel.savedLocalPath = cachedPath;
    set(() => ({ [key]: localPanel }));

    if (cachedPath) {
      await get().navigateTo(side, cachedPath);
    } else {
      try {
        const home = await localGetHomeDir();
        await get().navigateTo(side, home);
      } catch {
        await get().navigateTo(side, "");
      }
    }
  },

  showHostSelect: (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    const prev = panel.view === "host-select" ? panel.previousView : (panel.view as "files" | "placeholder");
    set((s) => ({
      [key]: { ...s[key], view: "host-select", previousView: prev },
    }));
  },

  goBackFromHostSelect: (side) => {
    const key = panelKey(side);
    const panel = get()[key];
    set((s) => ({
      [key]: { ...s[key], view: panel.previousView },
    }));
  },

  createDir: async (side, name) => {
    const key = panelKey(side);
    const panel = get()[key];
    const sep = panel.mode === "local" && /^[A-Z]:/i.test(panel.currentPath) ? "\\" : "/";
    const fullPath = panel.currentPath.replace(/[\\/]+$/, "") + sep + name;

    if (panel.mode === "remote" && panel.sftpSessionId) {
      await sftpMkdir(panel.sftpSessionId, fullPath);
    } else {
      await localCreateDir(fullPath);
    }
    await get().refresh(side);
  },

  deleteEntry: async (side, name, isDir) => {
    const key = panelKey(side);
    const panel = get()[key];
    const sep = panel.mode === "local" && /^[A-Z]:/i.test(panel.currentPath) ? "\\" : "/";
    const fullPath = panel.currentPath.replace(/[\\/]+$/, "") + sep + name;

    if (panel.mode === "remote" && panel.sftpSessionId) {
      await sftpRemove(panel.sftpSessionId, fullPath, isDir);
    } else {
      await localRemove(fullPath, isDir);
    }
    await get().refresh(side);
  },

  renameEntry: async (side, oldName, newName) => {
    const key = panelKey(side);
    const panel = get()[key];
    const sep = panel.mode === "local" && /^[A-Z]:/i.test(panel.currentPath) ? "\\" : "/";
    const base = panel.currentPath.replace(/[\\/]+$/, "");
    const oldPath = base + sep + oldName;
    const newPath = base + sep + newName;

    if (panel.mode === "remote" && panel.sftpSessionId) {
      await sftpRename(panel.sftpSessionId, oldPath, newPath);
    } else {
      await localRename(oldPath, newPath);
    }
    await get().refresh(side);
  },

  chmod: async (side, name, mode) => {
    const key = panelKey(side);
    const panel = get()[key];
    if (panel.mode !== "remote" || !panel.sftpSessionId) return;

    const sep = "/";
    const fullPath = panel.currentPath.replace(/\/+$/, "") + sep + name;
    await sftpChmod(panel.sftpSessionId, fullPath, mode);
    await get().refresh(side);
  },
}));
