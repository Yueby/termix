import { createLogger } from "@/lib/logger";
import { detectShells, localClose, localOpen, sshConnect, sshDisconnect } from "@/lib/tauri";
import { useConnectionStore, type ConnectionInfo } from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useSessionStore } from "@/stores/session-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useCallback } from "react";

const logger = createLogger("connection");

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
      await delay(600);

      pushLog(`Authenticating as ${conn.username} (${conn.authType})...`);
      updateTab(tabId, { status: "authenticating" });

      try {
        let authMethod: { type: "password"; password: string } | { type: "key"; key_path: string; passphrase?: string } | { type: "key_content"; key_content: string; passphrase?: string };

        if (conn.authType === "password") {
          authMethod = { type: "password", password };
        } else if (conn.keychainId) {
          const keyItem = useKeychainStore.getState().items.find((k) => k.id === conn.keychainId);
          if (keyItem) {
            authMethod = {
              type: "key_content",
              key_content: keyItem.privateKey,
              passphrase: password || keyItem.passphrase || undefined,
            };
          } else if (conn.keyPath) {
            pushLog("Warning: Keychain key not found, falling back to key path.");
            authMethod = { type: "key", key_path: conn.keyPath, passphrase: password || undefined };
          } else {
            pushLog("Error: Selected keychain key not found and no key path configured.");
            updateTab(tabId, { status: "error", error: "Keychain key not found. Please re-select the key in host settings." });
            return;
          }
        } else {
          authMethod = { type: "key", key_path: conn.keyPath ?? "", passphrase: password || undefined };
        }

        const result = await sshConnect({
          host: conn.host,
          port: conn.port,
          username: conn.username,
          auth_method: authMethod,
        });

        pushLog("Session established.");
        updateTab(tabId, { status: "connected" });
        await delay(400);
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
        (conn.authType === "key" && (conn.keychainId || conn.keyPath));

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
        authType: conn.authType as "password" | "key",
      });

      if (hasCredentials) {
        const credentialPassword = conn.authType === "password" ? (conn.password ?? "") : (conn.keyPassphrase ?? "");
        doConnect(tabId, conn, credentialPassword);
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
          password: "", keyPath: "", keyPassphrase: "", keychainId: "",
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

  const disconnectTab = useCallback(async (tab: { sessionId: string | null; type: string; id: string }) => {
    if (tab.sessionId) {
      if (tab.type === "local") {
        await localClose(tab.sessionId).catch((e) => logger.warn("localClose failed:", tab.id, e));
      } else {
        await sshDisconnect(tab.sessionId).catch((e) => logger.warn("sshDisconnect failed:", tab.id, e));
      }
    }
  }, []);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const { tabs: currentTabs } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.id === tabId);
      removeTab(tabId);
      if (tab) await disconnectTab(tab);
    },
    [removeTab, disconnectTab]
  );

  const handleCloseOtherTabs = useCallback(
    async (keepTabId: string) => {
      const { tabs: currentTabs, removeOtherTabs } = useSessionStore.getState();
      const others = currentTabs.filter((t) => t.id !== keepTabId);
      removeOtherTabs(keepTabId);
      await Promise.all(others.map(disconnectTab));
    },
    [disconnectTab]
  );

  const handleCloseAllTabs = useCallback(
    async () => {
      const { tabs: currentTabs, removeAllTabs } = useSessionStore.getState();
      removeAllTabs();
      await Promise.all(currentTabs.map(disconnectTab));
    },
    [disconnectTab]
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
      logger.error("Failed to open local terminal:", err);
    }
  }, [addTab]);

  return {
    handleConnect,
    handleSubmitAuth,
    handleRetry,
    handleDisconnect,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleOpenLocal,
  };
}
