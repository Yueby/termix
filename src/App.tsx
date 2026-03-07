import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { TitleBar } from "@/components/layout/TitleBar";
import { NavSidebar } from "@/components/layout/NavSidebar";
import { HostList } from "@/components/connection/HostList";
import { HostDetail } from "@/components/connection/HostDetail";
import { SnippetList } from "@/components/snippet/SnippetList";
import { SnippetDetail } from "@/components/snippet/SnippetDetail";
import { ConnectionProgress } from "@/components/connection/ConnectionProgress";
import { TerminalView } from "@/components/terminal/Terminal";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useSnippetStore, isSnippetEmpty } from "@/stores/snippet-store";
import { useConnectionHandlers } from "@/hooks/use-connection";
import { getThemeById } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";

function SlidingPanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-in-out", open ? "w-80 border-l" : "w-0")}>
      <div className="w-80 h-full">{children}</div>
    </div>
  );
}

function App() {
  const { tabs, activeTabId } = useSessionStore();
  const { navPage, editingHostId, editingSnippetId, settingsOpen, setSettingsOpen } = useUiStore();
  const { terminalThemeId } = useSettingsStore();

  const [showHostDiscard, setShowHostDiscard] = useState(false);
  const pendingEditHostRef = useRef<string | null>(null);

  useEffect(() => {
    useSettingsStore.getState().loadSettings();
    useConnectionStore.getState().loadConnections();
    useSnippetStore.getState().loadSnippets();
  }, []);

  const {
    handleConnect,
    handleSubmitAuth,
    handleRetry,
    handleDisconnect,
    handleCloseTab,
    handleOpenLocal,
  } = useConnectionHandlers();

  const isHome = activeTabId === null;
  const terminalTheme = getThemeById(terminalThemeId);
  const terminalBg = terminalTheme.colors.background as string;
  const themeAccent = terminalTheme.colors.cursor as string;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeIsConnectedTerminal = activeTab?.status === "connected" && !!activeTab.sessionId;

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

  const handleContentAreaClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [role='button'], [data-radix-menu-content]")) return;
    if (e.detail === 0) return;
    const { navPage, setSelectedHostId, setSelectedSnippetId } = useUiStore.getState();
    if (navPage === "hosts") {
      setSelectedHostId(null);
      handleTryCloseHostDetail();
    } else if (navPage === "snippets") {
      setSelectedSnippetId(null);
      handleTryCloseSnippetDetail();
    }
  }, [handleTryCloseHostDetail, handleTryCloseSnippetDetail]);

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
        <TitleBar
          onCloseTab={handleCloseTab}
          terminalBg={activeIsConnectedTerminal ? terminalBg : undefined}
          themeAccent={themeAccent}
          themeVariant={terminalTheme.variant}
        />

        <div className="flex flex-1 min-h-0">
          {isHome && <NavSidebar />}

          <main className="flex-1 min-w-0 relative">
            <div className={isHome ? "flex h-full bg-content" : "hidden"}>
              <div className="flex-1 min-w-0" onClick={handleContentAreaClick}>
                {navPage === "hosts" ? (
                  <HostList onConnect={handleConnect} onOpenLocal={handleOpenLocal} onSwitchEdit={handleSwitchEditHost} />
                ) : navPage === "snippets" ? (
                  <SnippetList />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <p className="text-sm">{navPage} — coming soon</p>
                  </div>
                )}
              </div>
              <SlidingPanel open={!!editingHostId && navPage === "hosts"}>
                <HostDetail onConnect={handleConnect} onClose={handleTryCloseHostDetail} />
              </SlidingPanel>
              <SlidingPanel open={!!editingSnippetId && navPage === "snippets"}>
                <SnippetDetail />
              </SlidingPanel>
            </div>

            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;

              if (tab.status === "connected" && tab.sessionId) {
                return (
                  <div key={tab.id} className={isActive ? "absolute inset-0" : "absolute inset-0 invisible"}>
                    <TerminalView
                      sessionId={tab.sessionId}
                      isActive={isActive}
                      mode={tab.type === "local" ? "local" : "ssh"}
                      onDisconnect={handleDisconnect}
                    />
                  </div>
                );
              }

              if (isActive) {
                if (tab.type === "local") {
                  return (
                    <div key={tab.id} className="absolute inset-0 flex items-center justify-center bg-background">
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
                  <div key={tab.id} className="absolute inset-0 bg-content">
                    <ConnectionProgress
                      tab={tab}
                      onSubmitAuth={handleSubmitAuth}
                      onClose={handleCloseTab}
                      onRetry={handleRetry}
                    />
                  </div>
                );
              }

              return null;
            })}
          </main>
        </div>

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
      </div>
    </TooltipProvider>
  );
}

export default App;
