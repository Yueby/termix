import { createLogger } from "@/lib/logger";
import { resolveProxyMode } from "@/lib/proxy";
import { startBuffering, stopBuffering } from "@/lib/session-data-bridge";
import { detectShells, localClose, localOpen, saveTerminalLog, sshConnect, sshDisconnect } from "@/lib/tauri";
import { getTerminalCreatedAt, serializeTerminal } from "@/lib/terminal-registry";
import { useConnectionStore, type ConnectionInfo } from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useSessionStore, type SessionTab } from "@/stores/session-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useCallback, useRef } from "react";

const logger = createLogger("connection");

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How often a dropped SSH session is retried before it is left disconnected. */
const AUTO_RECONNECT_MAX_ATTEMPTS = 3;

/** First retry delay; doubles per attempt (1s, 2s, 4s). */
const AUTO_RECONNECT_BASE_DELAY_MS = 1000;

/** Stand-in connection for a tab whose saved connection record is gone. */
function connectionForTab(tab: SessionTab): ConnectionInfo {
  return {
    id: tab.connectionId,
    name: tab.title,
    host: tab.host,
    port: tab.port,
    username: tab.username,
    authType: tab.authType,
    group: "",
    password: "",
    keyPath: "",
    keyPassphrase: "",
    keychainId: "",
    proxy: null,
  };
}

export function useConnectionHandlers() {
  const { addTab, updateTab, removeTab } = useSessionStore();

  const inFlightConnections = useRef<
    Map<string, { attemptId: string; sessionId?: string; cancelled: boolean }>
  >(new Map());

  const cancelInFlight = useCallback((tabId: string) => {
    const inFlight = inFlightConnections.current.get(tabId);
    if (inFlight) {
      inFlight.cancelled = true;
      if (inFlight.sessionId) {
        stopBuffering(inFlight.sessionId);
      }
      inFlightConnections.current.delete(tabId);
    }
  }, []);

  const doConnect = useCallback(
    async (tabId: string, conn: ConnectionInfo, password: string) => {
      cancelInFlight(tabId);

      const attempt = {
        attemptId: crypto.randomUUID(),
        sessionId: undefined as string | undefined,
        cancelled: false,
      };
      inFlightConnections.current.set(tabId, attempt);

      const pushLog = (msg: string) => {
        const current = useSessionStore.getState().tabs.find((t) => t.id === tabId);
        const prev = current?.logs ?? [];
        updateTab(tabId, { logs: [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`] });
      };

      pushLog(`Connecting to ${conn.host}:${conn.port}...`);
      updateTab(tabId, { status: "connecting", error: null });
      await delay(600);

      const tabStillOpen = useSessionStore.getState().tabs.some((t) => t.id === tabId);
      if (attempt.cancelled || !tabStillOpen) {
        attempt.cancelled = true;
        if (inFlightConnections.current.get(tabId) === attempt) {
          inFlightConnections.current.delete(tabId);
        }
        return;
      }

      pushLog(`Authenticating as ${conn.username} (${conn.authType})...`);
      updateTab(tabId, { status: "authenticating" });

      // The session id is generated here so the data channel is registered before
      // the backend can start producing output.
      const sessionId = crypto.randomUUID();
      attempt.sessionId = sessionId;
      const onData = startBuffering(sessionId);

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
            stopBuffering(sessionId);
            if (inFlightConnections.current.get(tabId) === attempt) {
              inFlightConnections.current.delete(tabId);
            }
            return;
          }
        } else {
          authMethod = { type: "key", key_path: conn.keyPath ?? "", passphrase: password || undefined };
        }

        if (attempt.cancelled || !useSessionStore.getState().tabs.some((t) => t.id === tabId)) {
          attempt.cancelled = true;
          stopBuffering(sessionId);
          if (inFlightConnections.current.get(tabId) === attempt) {
            inFlightConnections.current.delete(tabId);
          }
          return;
        }

        const result = await sshConnect(sessionId, {
          host: conn.host,
          port: conn.port,
          username: conn.username,
          auth_method: authMethod,
          proxy: resolveProxyMode(conn.proxy, useSettingsStore.getState().proxy),
        }, onData);

        const isTabStillOpen = useSessionStore.getState().tabs.some((t) => t.id === tabId);
        if (attempt.cancelled || !isTabStillOpen) {
          stopBuffering(sessionId);
          await sshDisconnect(result.session_id).catch((e) =>
            logger.warn("cleanup cancelled in-flight session failed:", e)
          );
          if (inFlightConnections.current.get(tabId) === attempt) {
            inFlightConnections.current.delete(tabId);
          }
          return;
        }

        pushLog("Session established.");
        updateTab(tabId, { status: "connected", sessionId: result.session_id });
        // The session is healthy again, so the retry budget resets.
        reconnectAttempts.current.delete(tabId);
        if (inFlightConnections.current.get(tabId) === attempt) {
          inFlightConnections.current.delete(tabId);
        }

        if (conn.id && password) {
          useConnectionStore.getState().updateConnection(conn.id, {
            password: conn.authType === "password" ? password : undefined,
            keyPassphrase: conn.authType === "key" ? password : undefined,
          });
        }
      } catch (err) {
        stopBuffering(sessionId);
        if (inFlightConnections.current.get(tabId) === attempt) {
          inFlightConnections.current.delete(tabId);
        }
        const isTabStillOpen = useSessionStore.getState().tabs.some((t) => t.id === tabId);
        if (isTabStillOpen && !attempt.cancelled) {
          pushLog(`Error: ${String(err)}`);
          updateTab(tabId, { status: "error", error: String(err) });
        }
      }
    },
    [updateTab, cancelInFlight]
  );

  const reconnectAttempts = useRef<Map<string, number>>(new Map());
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Drops any pending retry for a tab, used when it closes. */
  const cancelReconnect = useCallback((tabId: string) => {
    const timer = reconnectTimers.current.get(tabId);
    if (timer !== undefined) {
      clearTimeout(timer);
      reconnectTimers.current.delete(tabId);
    }
    reconnectAttempts.current.delete(tabId);
  }, []);

  /** Re-opens a tab with its stored connection and credentials. */
  const reconnectTab = useCallback(
    (tabId: string) => {
      cancelInFlight(tabId);
      const tab = useSessionStore.getState().tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const conn =
        useConnectionStore.getState().connections.find((c) => c.id === tab.connectionId) ??
        connectionForTab(tab);
      const credential = conn.authType === "password" ? conn.password : conn.keyPassphrase;
      doConnect(tabId, conn, credential ?? "");
    },
    [doConnect, cancelInFlight]
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
      cancelInFlight(tabId);
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
          password: "", keyPath: "", keyPassphrase: "", keychainId: "", proxy: null,
        }, password);
      }
    },
    [doConnect, cancelInFlight]
  );

  const handleRetry = useCallback(
    (tabId: string) => {
      cancelReconnect(tabId);
      cancelInFlight(tabId);
      const tab = useSessionStore.getState().tabs.find((t) => t.id === tabId);
      const conn = tab
        ? useConnectionStore.getState().connections.find((c) => c.id === tab.connectionId)
        : undefined;
      // Stored credentials mean we can just go again; otherwise prompt, because
      // asking for a password is the only way forward.
      const canRetrySilently =
        !!conn &&
        (conn.authType === "password" ? !!conn.password : !!(conn.keychainId || conn.keyPath));
      if (canRetrySilently) {
        reconnectTab(tabId);
      } else {
        updateTab(tabId, { status: "waiting_auth", error: null, sessionId: null });
      }
    },
    [updateTab, reconnectTab, cancelReconnect, cancelInFlight]
  );

  const handleDisconnect = useCallback(
    (sessionId: string, reason: string) => {
      stopBuffering(sessionId);
      const { tabs: currentTabs, updateTab: update } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.sessionId === sessionId);
      if (!tab) return;

      // A local terminal ends because its process exited; retrying would only
      // spawn another shell, so only SSH sessions are retried.
      const retryable =
        tab.type === "terminal" && useSettingsStore.getState().autoReconnect;
      const attempt = (reconnectAttempts.current.get(tab.id) ?? 0) + 1;

      if (!retryable || attempt > AUTO_RECONNECT_MAX_ATTEMPTS) {
        update(tab.id, { status: "disconnected", error: reason, sessionId: null });
        return;
      }

      reconnectAttempts.current.set(tab.id, attempt);
      const delayMs = AUTO_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1);
      const note = `Disconnected: ${reason} Retrying in ${delayMs / 1000}s (attempt ${attempt}/${AUTO_RECONNECT_MAX_ATTEMPTS}).`;
      update(tab.id, {
        sessionId: null,
        status: "connecting",
        error: reason,
        logs: [...(tab.logs ?? []), `[${new Date().toLocaleTimeString()}] ${note}`],
      });

      reconnectTimers.current.set(
        tab.id,
        setTimeout(() => {
          reconnectTimers.current.delete(tab.id);
          // The tab may have been closed while we were waiting.
          if (!useSessionStore.getState().tabs.some((t) => t.id === tab.id)) return;
          reconnectTab(tab.id);
        }, delayMs)
      );
    },
    [reconnectTab]
  );

  const disconnectTab = useCallback(async (tab: { sessionId: string | null; type: string; id: string }) => {
    cancelInFlight(tab.id);
    if (tab.sessionId) {
      await stopBuffering(tab.sessionId);
      if (tab.type === "local") {
        await localClose(tab.sessionId).catch((e) => logger.warn("localClose failed:", tab.id, e));
      } else {
        await sshDisconnect(tab.sessionId).catch((e) => logger.warn("sshDisconnect failed:", tab.id, e));
      }
    }
  }, [cancelInFlight]);

  const captureAndSaveLog = useCallback((tab: { id: string; connectionId: string; title: string; host: string; username: string; type: string }) => {
    if (tab.type === "log") return;
    const content = serializeTerminal(tab.id);
    if (!content || content.trim().length === 0) return;

    const createdAt = getTerminalCreatedAt(tab.id);
    const now = Math.floor(Date.now() / 1000);

    saveTerminalLog({
      id: crypto.randomUUID(),
      connectionId: tab.connectionId,
      connectionName: tab.title,
      host: tab.host || "localhost",
      username: tab.username || "",
      sessionType: tab.type === "local" ? "local" : "ssh",
      startedAt: createdAt ? Math.floor(createdAt / 1000) : now,
      endedAt: now,
      content,
    }).catch((e) => logger.warn("Failed to save terminal log:", e));
  }, []);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      cancelReconnect(tabId);
      cancelInFlight(tabId);
      const { tabs: currentTabs } = useSessionStore.getState();
      const tab = currentTabs.find((t) => t.id === tabId);
      if (tab) captureAndSaveLog(tab);
      removeTab(tabId);
      if (tab) await disconnectTab(tab);
    },
    [removeTab, disconnectTab, captureAndSaveLog, cancelReconnect, cancelInFlight]
  );

  const handleCloseOtherTabs = useCallback(
    async (keepTabId: string) => {
      const { tabs: currentTabs, removeOtherTabs } = useSessionStore.getState();
      const others = currentTabs.filter((t) => t.id !== keepTabId);
      others.forEach((t) => {
        cancelReconnect(t.id);
        cancelInFlight(t.id);
        captureAndSaveLog(t);
      });
      removeOtherTabs(keepTabId);
      await Promise.all(others.map(disconnectTab));
    },
    [disconnectTab, captureAndSaveLog, cancelReconnect, cancelInFlight]
  );

  const handleCloseAllTabs = useCallback(
    async () => {
      const { tabs: currentTabs, removeAllTabs } = useSessionStore.getState();
      currentTabs.forEach((t) => {
        cancelReconnect(t.id);
        cancelInFlight(t.id);
        captureAndSaveLog(t);
      });
      removeAllTabs();
      await Promise.all(currentTabs.map(disconnectTab));
    },
    [disconnectTab, captureAndSaveLog, cancelReconnect, cancelInFlight]
  );

  const handleOpenLocal = useCallback(async () => {
    let sessionId: string | null = null;
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

      sessionId = crypto.randomUUID();
      const onData = startBuffering(sessionId);
      const result = await localOpen(sessionId, onData, 80, 24, shell, shellArgs);

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
      if (sessionId) {
        stopBuffering(sessionId);
        localClose(sessionId).catch(() => {});
      }
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
