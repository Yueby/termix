import { ConnectionProgress } from "@/components/connection/ConnectionProgress";
import { HostDetail } from "@/components/connection/HostDetail";
import { HostList } from "@/components/connection/HostList";
import { KeychainDetail } from "@/components/keychain/KeychainDetail";
import { KeychainList } from "@/components/keychain/KeychainList";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileSessionList } from "@/components/terminal/MobileSessionList";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { NavSidebar } from "@/components/layout/NavSidebar";
import { MobileSettingsPage, SettingsDialog } from "@/components/layout/SettingsDialog";
import { TitleBar } from "@/components/layout/TitleBar";
import { LogsList } from "@/components/logs/LogsList";
import { LogViewer } from "@/components/logs/LogViewer";
import { SftpPage } from "@/components/sftp/SftpPage";
import { SnippetDetail } from "@/components/snippet/SnippetDetail";
import { SnippetList } from "@/components/snippet/SnippetList";
import { TerminalView } from "@/components/terminal/Terminal";
import { MobileTerminalHeader, MobileTerminalToolbar } from "@/components/terminal/MobileTerminalToolbar";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConnectionHandlers } from "@/hooks/use-connection";
import { readFromClipboard } from "@/lib/clipboard";
import { getThemeById } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { isKeychainItemEmpty, useKeychainStore } from "@/stores/keychain-store";
import { useSessionStore } from "@/stores/session-store";
import { useSettingsStore } from "@/stores/settings-store";
import { isSnippetEmpty, useSnippetStore } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUpdateStore } from "@/hooks/use-updater";
import { ReleaseNotes } from "@/components/updater/ReleaseNotes";
import { focusTerminal, pasteToTerminal } from "@/lib/terminal-registry";
import { localWrite, sshWrite } from "@/lib/tauri";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AlertCircle, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { formatDownloadProgress, getUpdateErrorDetails } from "@/components/updater/updater-utils";
import { pullAtStartup, startAutoSync } from "@/lib/auto-sync";
import { useCallback, useEffect, useRef, useState } from "react";

function SlidingPanel({ open, children, onClose }: { open: boolean; children: React.ReactNode; onClose?: () => void }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
        <SheetContent side="right" showCloseButton={false} className="w-full sm:w-80 p-0">
          <div className="h-full">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className={cn("shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-in-out", open ? "w-80 border-l" : "w-0")}>
      <div className="w-80 h-full">{children}</div>
    </div>
  );
}

function App() {
  const { tabs, activeTabId } = useSessionStore();
  const { navPage, activeView, detailPanel, settingsOpen, setSettingsOpen, mobileShowSessions } = useUiStore();
  const { terminalThemeId } = useSettingsStore();

  const [showHostDiscard, setShowHostDiscard] = useState(false);
  const pendingEditHostRef = useRef<string | null>(null);

  const {
    status: updateStatus,
    update,
    progress: updateProgress,
    error: updateError,
    errorKind: updateErrorKind,
    downloadAndInstall,
    checkForUpdate,
    dismiss: dismissUpdate,
  } = useUpdateStore();

  const progressInfo = formatDownloadProgress(
    updateProgress?.downloaded ?? 0,
    updateProgress?.total ?? 0
  );
  const errorDetails = getUpdateErrorDetails(updateErrorKind);

  useEffect(() => {
    startAutoSync();
    Promise.all([
      useSettingsStore.getState().loadSettings(),
      useConnectionStore.getState().loadConnections(),
      useSnippetStore.getState().loadSnippets(),
      useKeychainStore.getState().loadItems(),
    ])
      .finally(() => {
        getCurrentWindow().show();
        setTimeout(() => useUpdateStore.getState().checkForUpdate({ explicit: false }), 3000);
      })
      // After the settings this just loaded, and after the window is up: an unreachable
      // remote must not be able to hold the app closed.
      .then(() => void pullAtStartup());
  }, []);

  const {
    handleConnect,
    handleSubmitAuth,
    handleRetry,
    handleDisconnect,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleOpenLocal,
  } = useConnectionHandlers();

  const isHome = activeTabId === null;
  const terminalTheme = getThemeById(terminalThemeId);
  const terminalBg = terminalTheme.colors.background as string;
  const terminalFg = terminalTheme.colors.foreground as string;

  const isMobile = useIsMobile();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeIsConnectedTerminal = activeTab?.type === "log" || (activeTab?.status === "connected" && !!activeTab.sessionId);

  const handleTryCloseHostDetail = useCallback(() => {
    const { editingHostId, setEditingHostId } = useUiStore.getState();
    if (!editingHostId) return;
    const conn = useConnectionStore.getState().connections.find((c) => c.id === editingHostId);
    if (!conn || conn.host.trim()) {
      setEditingHostId(null);
    } else {
      setShowHostDiscard(true);
    }
  }, []);

  const handleTryCloseSnippetDetail = useCallback(() => {
    const { editingSnippetId, setEditingSnippetId, selectedSnippetId, setSelectedSnippetId } = useUiStore.getState();
    if (!editingSnippetId) return;
    const s = useSnippetStore.getState().snippets.find((sn) => sn.id === editingSnippetId);
    if (s && isSnippetEmpty(s)) {
      useSnippetStore.getState().removeSnippet(editingSnippetId);
      if (selectedSnippetId === editingSnippetId) setSelectedSnippetId(null);
    }
    setEditingSnippetId(null);
  }, []);

  const handleTryCloseKeychainDetail = useCallback(() => {
    const { editingKeychainId, setEditingKeychainId, selectedKeychainId, setSelectedKeychainId } = useUiStore.getState();
    if (!editingKeychainId) return;
    const item = useKeychainStore.getState().items.find((k) => k.id === editingKeychainId);
    if (item && isKeychainItemEmpty(item)) {
      useKeychainStore.getState().removeItem(editingKeychainId);
      if (selectedKeychainId === editingKeychainId) setSelectedKeychainId(null);
    }
    setEditingKeychainId(null);
  }, []);

  const handleContentAreaClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [role='button'], [data-radix-menu-content]")) return;
    if (e.detail === 0) return;
    const { navPage, setSelectedHostId, setSelectedSnippetId, setSelectedKeychainId } = useUiStore.getState();
    if (navPage === "hosts") {
      setSelectedHostId(null);
      handleTryCloseHostDetail();
    } else if (navPage === "snippets") {
      setSelectedSnippetId(null);
      handleTryCloseSnippetDetail();
    } else if (navPage === "keychain") {
      setSelectedKeychainId(null);
      handleTryCloseKeychainDetail();
    }
  }, [handleTryCloseHostDetail, handleTryCloseSnippetDetail, handleTryCloseKeychainDetail]);

  const handleSwitchEditHost = useCallback((targetId: string) => {
    const { editingHostId, setEditingHostId, setSelectedHostId } = useUiStore.getState();
    if (editingHostId && editingHostId !== targetId) {
      const curr = useConnectionStore.getState().connections.find((c) => c.id === editingHostId);
      if (curr && !curr.host.trim()) {
        pendingEditHostRef.current = targetId;
        setShowHostDiscard(true);
        return;
      }
    }
    setSelectedHostId(targetId);
    setEditingHostId(targetId);
  }, []);

  const handleEditHost = useCallback((connectionId: string) => {
    useUiStore.getState().setDetailPanel({ type: "host", id: connectionId, source: "ssh-tab" });
  }, []);

  const handleDiscardHost = useCallback(() => {
    const { editingHostId, setEditingHostId, selectedHostId, setSelectedHostId } = useUiStore.getState();
    if (editingHostId) {
      useConnectionStore.getState().removeConnection(editingHostId);
      if (selectedHostId === editingHostId) setSelectedHostId(null);
    }
    const pending = pendingEditHostRef.current;
    pendingEditHostRef.current = null;
    if (pending) {
      setSelectedHostId(pending);
      setEditingHostId(pending);
    } else {
      setEditingHostId(null);
    }
    setShowHostDiscard(false);
  }, []);

  return (
    <TooltipProvider>
      <div
        className="flex h-screen flex-col overflow-hidden select-none text-foreground bg-background"
        style={activeIsConnectedTerminal ? { backgroundColor: terminalBg } : undefined}
      >
        {!(isMobile && activeIsConnectedTerminal) && (
          <TitleBar
            onCloseTab={handleCloseTab}
            onCloseOtherTabs={handleCloseOtherTabs}
            onCloseAllTabs={handleCloseAllTabs}
            terminalBg={activeIsConnectedTerminal ? terminalBg : undefined}
            terminalFg={activeIsConnectedTerminal ? terminalFg : undefined}
          />
        )}

        <div className="flex flex-1 min-h-0">
          {(isMobile || (isHome && activeView !== "sftp")) && <NavSidebar />}

          <main className="flex-1 min-w-0 relative">
            {isHome && activeView === "sftp" && (
              <div className="h-full bg-content relative z-10 animate-in fade-in-0 duration-150">
                <SftpPage />
              </div>
            )}

            {isHome && activeView === "settings" && isMobile && (
              <div className="h-full bg-content relative z-10 animate-in fade-in-0 duration-150">
                <MobileSettingsPage />
              </div>
            )}

            {isMobile && mobileShowSessions && isHome && activeView === "home" && (
              <div className="h-full bg-content relative z-10 animate-in fade-in-0 duration-150">
                <MobileSessionList onCloseTab={handleCloseTab} />
              </div>
            )}

            <div className={isHome && activeView === "home" && !(isMobile && mobileShowSessions) ? "h-full bg-content relative z-10" : "hidden"}>
              <div className="h-full" onClick={handleContentAreaClick}>
                <div key={navPage} className="h-full animate-in fade-in-0 duration-150">
                {navPage === "hosts" ? (
                  <HostList onConnect={handleConnect} onOpenLocal={handleOpenLocal} onSwitchEdit={handleSwitchEditHost} />
                ) : navPage === "snippets" ? (
                  <SnippetList />
                ) : navPage === "keychain" ? (
                  <KeychainList />
                ) : navPage === "logs" ? (
                  <LogsList />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <p className="text-sm">{navPage} — coming soon</p>
                  </div>
                )}
                </div>
              </div>
            </div>

            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;

              if (tab.type === "log" && tab.logContent) {
                return (
                  <div key={tab.id} className={cn("absolute inset-0 animate-in fade-in-0 duration-150", !isActive && "invisible")}>
                    <LogViewer content={tab.logContent} isActive={isActive} />
                  </div>
                );
              }

              if (tab.status === "connected" && tab.sessionId) {
                return (
                  <div key={tab.id} className={cn("absolute inset-0 animate-in fade-in-0 duration-150", !isActive && "invisible")}>
                    {isMobile ? (
                      <div className="flex flex-col h-full">
                        <MobileTerminalHeader
                          title={tab.title}
                          onBack={() => {
                            useSessionStore.getState().setActiveTab(null);
                          }}
                          terminalBg={terminalBg}
                          terminalFg={terminalFg}
                        />
                        <div className="flex-1 min-h-0">
                          <TerminalView
                            tabId={tab.id}
                            sessionId={tab.sessionId}
                            isActive={isActive}
                            mode={tab.type === "local" ? "local" : "ssh"}
                            onDisconnect={handleDisconnect}
                          />
                        </div>
                        <MobileTerminalToolbar
                          onSendKey={(data) => {
                            const bytes = Array.from(new TextEncoder().encode(data));
                            const write = tab.type === "local" ? localWrite : sshWrite;
                            write(tab.sessionId!, bytes).catch(() => {});
                          }}
                          onToggleKeyboard={() => focusTerminal(tab.id)}
                          onPaste={() => {
                            void readFromClipboard().then((text) => {
                              if (!text) return;
                              pasteToTerminal(tab.id, text);
                              focusTerminal(tab.id);
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <TerminalView
                        tabId={tab.id}
                        sessionId={tab.sessionId}
                        isActive={isActive}
                        mode={tab.type === "local" ? "local" : "ssh"}
                        onDisconnect={handleDisconnect}
                      />
                    )}
                  </div>
                );
              }

              if (isActive) {
                if (tab.type === "local") {
                  return (
                    <div key={tab.id} className="absolute inset-0 flex items-center justify-center bg-background animate-in fade-in-0 duration-150">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <p className="text-sm">
                          {tab.status === "error" ? tab.error : "Starting local shell..."}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={tab.id} className="absolute inset-0 bg-content animate-in fade-in-0 duration-150">
                    <ConnectionProgress
                      tab={tab}
                      onSubmitAuth={handleSubmitAuth}
                      onClose={handleCloseTab}
                      onRetry={handleRetry}
                      onEdit={handleEditHost}
                    />
                  </div>
                );
              }

              return null;
            })}
          </main>

          <SlidingPanel
            open={!!detailPanel}
            onClose={() => {
              if (detailPanel?.type === "host") handleTryCloseHostDetail();
              else if (detailPanel?.type === "snippet") handleTryCloseSnippetDetail();
              else if (detailPanel?.type === "keychain") handleTryCloseKeychainDetail();
            }}
          >
            {detailPanel?.type === "host" && (
              <HostDetail onConnect={handleConnect} onClose={handleTryCloseHostDetail} />
            )}
            {detailPanel?.type === "snippet" && (
              <SnippetDetail />
            )}
            {detailPanel?.type === "keychain" && (
              <KeychainDetail />
            )}
          </SlidingPanel>
        </div>

        {isMobile && !activeIsConnectedTerminal && <MobileTabBar />}

        <CommandPalette onConnect={handleConnect} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        <AlertDialog open={showHostDiscard} onOpenChange={(open) => {
          if (!open) pendingEditHostRef.current = null;
          setShowHostDiscard(open);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This host has no address configured. Do you want to discard it?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continue editing</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscardHost}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={updateStatus === "available"} onOpenChange={(open) => { if (!open) dismissUpdate(); }}>
          <AlertDialogContent className="sm:max-w-xl max-h-[min(540px,calc(100dvh-2rem))] flex flex-col gap-3 overflow-hidden p-5">
            <AlertDialogHeader className="shrink-0 text-left">
              <AlertDialogTitle className="text-base font-semibold">Update Available</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-xs text-muted-foreground">
                  A new version <span className="font-semibold text-foreground">v{update?.version}</span> is available.
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {update?.body && update.body.trim() ? (
              <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                <ReleaseNotes notes={update.body} />
              </div>
            ) : null}

            <AlertDialogFooter className="shrink-0 pt-1">
              <AlertDialogCancel>Later</AlertDialogCancel>
              <AlertDialogAction onClick={downloadAndInstall}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={updateStatus === "downloading" || updateStatus === "installing"}>
          <AlertDialogContent className="sm:max-w-md p-6">
            <AlertDialogHeader className="text-left space-y-3">
              <AlertDialogTitle className="text-base font-semibold">
                {updateStatus === "installing"
                  ? "Installing Update..."
                  : update?.version
                  ? `Downloading Update v${update.version}`
                  : "Downloading Update..."}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                      <span>
                        {updateStatus === "installing"
                          ? "Applying update package..."
                          : progressInfo.percent !== null && progressInfo.percent > 0
                          ? "Downloading update package..."
                          : "Connecting to server..."}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">
                      {updateStatus === "installing" ? "100%" : progressInfo.text}
                    </span>
                  </div>

                  <div className="w-full bg-muted/80 rounded-full h-2 overflow-hidden relative">
                    {updateStatus === "installing" ? (
                      <div
                        className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: "100%" }}
                      />
                    ) : progressInfo.percent !== null ? (
                      <div
                        className="bg-primary h-full rounded-full transition-[width] duration-75 ease-out"
                        style={{ width: `${progressInfo.percent}%` }}
                      />
                    ) : (
                      <div className="absolute inset-y-0 bg-primary/90 rounded-full animate-indeterminate" />
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {updateStatus === "installing"
                      ? "Termix will restart automatically once installation completes."
                      : "Please keep Termix open while the download completes."}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={updateStatus === "error"} onOpenChange={(open) => { if (!open) dismissUpdate(); }}>
          <AlertDialogContent className="sm:max-w-md p-6">
            <AlertDialogHeader className="text-left space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  {errorDetails.title}
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1">
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {errorDetails.description}
                  </p>
                  {updateError && (
                    <details className="group rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs">
                      <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors select-none flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90 shrink-0" />
                        <span>Error details</span>
                      </summary>
                      <pre className="mt-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap break-all select-text overflow-x-auto max-h-32 p-2 rounded bg-background/60 border border-border/40">
                        {updateError}
                      </pre>
                    </details>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-2">
              <AlertDialogCancel onClick={dismissUpdate}>
                {errorDetails.canRetry ? "Cancel" : "Close"}
              </AlertDialogCancel>
              {errorDetails.canRetry && (
                <AlertDialogAction
                  onClick={() => {
                    dismissUpdate();
                    if (errorDetails.retryAction === "download") {
                      void downloadAndInstall();
                    } else {
                      void checkForUpdate({ explicit: true });
                    }
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Try Again
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
