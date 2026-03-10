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
import { focusTerminal, pasteToTerminal } from "@/lib/terminal-registry";
import { localWrite, sshWrite } from "@/lib/tauri";
import { readText as clipboardRead } from "@tauri-apps/plugin-clipboard-manager";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Download, Loader2 } from "lucide-react";
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

  const { status: updateStatus, update, progress: updateProgress, downloadAndInstall, dismiss: dismissUpdate } = useUpdateStore();

  useEffect(() => {
    Promise.all([
      useSettingsStore.getState().loadSettings(),
      useConnectionStore.getState().loadConnections(),
      useSnippetStore.getState().loadSnippets(),
      useKeychainStore.getState().loadItems(),
    ]).finally(() => {
      getCurrentWindow().show();
      setTimeout(() => useUpdateStore.getState().checkForUpdate(), 3000);
    });
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
                            clipboardRead().then((text) => {
                              if (text) {
                                pasteToTerminal(tab.id, text);
                                focusTerminal(tab.id);
                              }
                            }).catch((e) => console.warn("clipboard read failed:", e));
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Available</AlertDialogTitle>
              <AlertDialogDescription>
                A new version <span className="font-semibold text-foreground">v{update?.version}</span> is available.
                {update?.body && <span className="block mt-1 text-xs">{update.body}</span>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Later</AlertDialogCancel>
              <AlertDialogAction onClick={downloadAndInstall}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={updateStatus === "downloading" || updateStatus === "installing"}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {updateStatus === "installing" ? "Installing Update..." : "Downloading Update..."}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>{updateStatus === "installing" ? "Installing, app will restart..." : "Downloading update..."}</span>
                  </div>
                  {updateProgress && updateProgress.total > 0 && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-[width] duration-300"
                        style={{ width: `${Math.min(100, (updateProgress.downloaded / updateProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={updateStatus === "error"} onOpenChange={(open) => { if (!open) dismissUpdate(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update Check Failed</AlertDialogTitle>
              <AlertDialogDescription>
                {useUpdateStore.getState().error || "An unknown error occurred while checking for updates."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>OK</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

export default App;
