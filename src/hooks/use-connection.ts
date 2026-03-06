import { useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useConnectionStore, type ConnectionInfo } from "@/stores/connection-store";
import { useSettingsStore } from "@/stores/settings-store";
import { sshConnect, sshDisconnect, localOpen, localClose, detectShells } from "@/lib/tauri";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useConnectionHandlers() {
  const { addTab, updateTab, removeTab } = useSessionStore();

  const doConnect = useCallback(
    async (tabId: string, conn: ConnectionInfo, password: string) => {
      const pushLog = (msg: string) => {
        const current = useSessionStore.getState().tabs.find((t) => t.id === tabId);
        const prev = current?.logs ?? [];
        updateTab(tabId, { logs: [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`] });
      };

      pushLog(`Connecting to ${conn.host}:${conn.port}...`);
      updateTab(tabId, { status: "connecting", error: null });
      await delay(1000);

      pushLog(`Authenticating as ${conn.username} (${conn.authType})...`);
      updateTab(tabId, { status: "authenticating" });

      try {
        const authMethod =
          conn.authType === "password"
            ? { type: "password" as const, password }
            : { type: "key" as const, key_path: conn.keyPath ?? "", passphrase: password || undefined };

        const result = await sshConnect({
          host: conn.host,
          port: conn.port,
          username: conn.username,
          auth_method: authMethod,
        });

        pushLog("Session established.");
        updateTab(tabId, { status: "connected" });
        await delay(800);
        updateTab(tabId, { sessionId: result.session_id });

        if (conn.id && password) {
          useConnectionStore.getState().updateConnection(conn.id, {
            password: conn.authType === "password" ? password : undefined,
            keyPassphrase: conn.authType === "key" ? password : undefined,
          });
        }
      } catch (err) {
        pushLog(`Error: ${String(err)}`);
        updateTab(tabId, { status: "error", error: String(err) });
      }
    },
    [updateTab]
  );

  const handleConnect = useCallback(
    (conn: ConnectionInfo) => {
      const tabId = crypto.randomUUID();
      const hasCredentials =
        (conn.authType === "password" && conn.password) ||
        (conn.authType === "key" && conn.keyPath);

      const baseTitle = conn.name || conn.host;
      const currentTabs = useSessionStore.getState().tabs;
      const existingCount = currentTabs.filter(
        (t) => t.title === baseTitle || t.title.startsWith(baseTitle + " (")
      ).length;
      const title = existingCount > 0 ? `${baseTitle} (${existingCount + 1})` : baseTitle;

      addTab({
        id: tabId,
        sessionId: null,
        connectionId: conn.id,
        title,
        type: "terminal",
        status: hasCredentials ? "connecting" : "waiting_auth",
        error: null,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authType: conn.authType,
      });

      if (hasCredentials) {
        doConnect(tabId, conn, conn.password ?? "");
      }
    },
    [addTab, doConnect]
  );

  const handleSubmitAuth = useCallback(
    (tabId: string, password: string) => {
      const { tabs: currentTabs } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.id === tabId);
      if (!tab) return;
      const conn = useConnectionStore.getState().connections.find((c) => c.id === tab.connectionId);
      if (conn) {
        doConnect(tabId, conn, password);
      } else {
        doConnect(tabId, {
          id: tab.connectionId, name: tab.title, host: tab.host,
          port: tab.port, username: tab.username, authType: tab.authType, group: "",
        }, password);
      }
    },
    [doConnect]
  );

  const handleRetry = useCallback(
    (tabId: string) => updateTab(tabId, { status: "waiting_auth", error: null, sessionId: null }),
    [updateTab]
  );

  const handleDisconnect = useCallback(
    (sessionId: string, reason: string) => {
      const { tabs: currentTabs, updateTab: update } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.sessionId === sessionId);
      if (tab) update(tab.id, { status: "disconnected", error: reason, sessionId: null });
    },
    []
  );

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const { tabs: currentTabs } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        if (tab.type === "local") {
          await localClose(tab.sessionId).catch(() => {});
        } else {
          await sshDisconnect(tab.sessionId).catch(() => {});
        }
      }
      removeTab(tabId);
    },
    [removeTab]
  );

  const handleOpenLocal = useCallback(async () => {
    try {
      const shellId = useSettingsStore.getState().defaultShell;
      let shell: string | undefined;
      let shellArgs: string[] | undefined;

      if (shellId !== "auto") {
        const profiles = await detectShells();
        const profile = profiles.find((p) => p.id === shellId);
        if (profile) {
          shell = profile.path;
          shellArgs = profile.args.length > 0 ? profile.args : undefined;
        }
      }

      const result = await localOpen(80, 24, shell, shellArgs);

      const tabId = crypto.randomUUID();
      const currentTabs = useSessionStore.getState().tabs;
      const localCount = currentTabs.filter((t) => t.type === "local").length;
      const title = localCount > 0 ? `Terminal (${localCount + 1})` : "Terminal";

      addTab({
        id: tabId,
        sessionId: result.session_id,
        connectionId: "",
        title,
        type: "local",
        status: "connected",
        error: null,
        host: "localhost",
        port: 0,
        username: "",
        authType: "password",
      });
    } catch (err) {
      console.error("Failed to open local terminal:", err);
    }
  }, [addTab]);

  return {
    handleConnect,
    handleSubmitAuth,
    handleRetry,
    handleDisconnect,
    handleCloseTab,
    handleOpenLocal,
  };
}
