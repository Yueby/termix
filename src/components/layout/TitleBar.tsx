import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContextMenu } from "@/hooks/use-context-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUpdateStore } from "@/hooks/use-updater";
import { createLogger } from "@/lib/logger";
import { terminalThemes } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
    Check,
    ExternalLink,
    FolderOpen,
    Info,
    Loader2,
    Menu,
    Minus,
    Palette,
    Pencil,
    ScrollText,
    Server,
    Settings,
    Square,
    Terminal,
    Wifi,
    WifiOff,
    X,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const logger = createLogger("titlebar");

let appWindow: Window | null = null;
function getAppWindow() {
  if (!appWindow) appWindow = getCurrentWindow();
  return appWindow;
}

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function getThemeClasses(inTerminal: boolean) {
  if (!inTerminal) {
    return {
      tabActive: "bg-primary/15 text-primary font-medium",
      tabInactive: "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
      iconBtn: "h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent",
      closeHover: "hover:bg-destructive hover:text-destructive-foreground",
      separator: "bg-border",
      tabClose: "hover:bg-muted",
    };
  }
  const termBase = {
    tabActive: "bg-[var(--tf-bg)] text-[var(--tf-bright)] font-semibold",
    tabInactive: "bg-[var(--tf-bg-dim)] text-[var(--tf-dim)] font-medium hover:bg-[var(--tf-bg)] hover:text-[var(--tf-hover)]",
    iconBtn: "h-7 w-7 text-[var(--tf-dim)] hover:text-[var(--tf)] hover:bg-[var(--tf-bg)]",
    closeHover: "hover:bg-destructive hover:text-destructive-foreground",
    separator: "bg-[var(--tf-sep)]",
    tabClose: "hover:bg-[var(--tf-bg)]",
  };
  return termBase;
}

interface TitleBarProps {
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (keepTabId: string) => void;
  onCloseAllTabs: () => void;
  terminalBg?: string;
  terminalFg?: string;
}

export function TitleBar({ onCloseTab, onCloseOtherTabs, onCloseAllTabs, terminalBg, terminalFg }: TitleBarProps) {
  const { tabs, activeTabId, setActiveTab, updateTab } = useSessionStore();
  const { activeView, setActiveView, setSelectedHostId, setEditingHostId, setSettingsOpen, setMobileNavOpen } = useUiStore();
  const { terminalThemeId, setTerminalThemeId } = useSettingsStore();
  const isMobile = useIsMobile();

  const [tabMenuTarget, setTabMenuTarget] = useState<string | null>(null);
  const { menu, menuRef, open, close } = useContextMenu();
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("0.1.0"));
  }, []);

  const isHome = activeTabId === null;
  const isSftp = isHome && activeView === "sftp";
  const inTerminal = !isHome && !!terminalBg;
  const styles = getThemeClasses(inTerminal);

  const goHome = () => {
    useSessionStore.getState().setActiveTab(null);
    setActiveView("home");
    setSelectedHostId(null);
    setEditingHostId(null);
  };

  const goSftp = () => {
    useSessionStore.getState().setActiveTab(null);
    setActiveView("sftp");
  };

  useEffect(() => {
    if (!menu) setTabMenuTarget(null);
  }, [menu]);

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    setTabMenuTarget(tabId);
    open(e);
  };

  const startRename = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.title);
    close();
  };

  const commitRename = () => {
    if (renamingTabId && renameValue.trim()) {
      updateTab(renamingTabId, { title: renameValue.trim() });
    }
    setRenamingTabId(null);
  };

  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  const lastClickRef = useRef(0);

  const handleTitleBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role='button'], [role='menuitem'], [role='option'], [data-radix-collection-item]")) return;
    if (e.button !== 0) return;

    e.preventDefault();
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      lastClickRef.current = 0;
      getAppWindow().toggleMaximize().catch((e) => logger.warn("toggleMaximize failed:", e));
    } else {
      lastClickRef.current = now;
      getAppWindow().startDragging();
    }
  };

  const { navPage: currentNavPage, activeView: currentActiveView, mobileShowSessions } = useUiStore();

  const getMobileTitle = () => {
    if (mobileShowSessions) return "Connections";
    if (currentActiveView === "settings") return "Settings";
    const titles: Record<string, string> = {
      hosts: "Hosts", snippets: "Snippets", keychain: "Keychain",
      "port-forwarding": "Port Forwarding", "known-hosts": "Known Hosts", logs: "Logs",
    };
    return titles[currentNavPage] || "Home";
  };

  if (isMobile) {
    const showMenuBtn = currentActiveView === "home" && !mobileShowSessions;
    return (
      <div className="flex h-12 shrink-0 items-center select-none border-b bg-background px-2">
        {showMenuBtn ? (
          <button
            type="button"
            className={cn("inline-flex items-center justify-center rounded-md h-8 w-8 shrink-0 transition-all text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/80 active:scale-95", focusRing)}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )}
        <h1 className="text-base font-semibold flex-1 text-center truncate">{getMobileTitle()}</h1>
        <div className="w-8 shrink-0" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center select-none",
        !inTerminal && "border-b bg-background"
      )}
      style={inTerminal ? {
        backgroundColor: terminalBg,
        '--tf': terminalFg,
        '--tf-dim': terminalFg ? `color-mix(in srgb, ${terminalFg} 60%, transparent)` : undefined,
        '--tf-hover': terminalFg ? `color-mix(in srgb, ${terminalFg} 80%, transparent)` : undefined,
        '--tf-bright': terminalFg ? `color-mix(in srgb, ${terminalFg} 75%, white)` : undefined,
        '--tf-bg': terminalFg ? `color-mix(in srgb, ${terminalFg} 18%, transparent)` : undefined,
        '--tf-bg-dim': terminalFg ? `color-mix(in srgb, ${terminalFg} 6%, transparent)` : undefined,
        '--tf-sep': terminalFg ? `color-mix(in srgb, ${terminalFg} 20%, transparent)` : undefined,
      } as React.CSSProperties : undefined}
      onMouseDown={handleTitleBarMouseDown}
    >
      {/* Left: hamburger dropdown menu */}
      <div className="flex items-center shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-md mx-1.5 shrink-0 transition-colors",
                styles.iconBtn, focusRing
              )}
            >
              <Menu className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAboutOpen(true)}>
              <Info className="mr-2 h-4 w-4" />
              About Termix
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs area */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto px-1 py-1">
        {/* Hosts tab */}
        <button
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors shrink-0",
            isHome && !isSftp ? styles.tabActive : styles.tabInactive, focusRing
          )}
          onClick={goHome}
        >
          <Server className="h-3 w-3 shrink-0" />
          <span>Hosts</span>
        </button>

        {/* SFTP tab */}
        <button
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors shrink-0",
            isSftp ? styles.tabActive : styles.tabInactive, focusRing
          )}
          onClick={goSftp}
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span>SFTP</span>
        </button>

        {/* Separator */}
        {tabs.length > 0 && (
          <div className={cn(
            "h-4 w-px shrink-0",
            styles.separator
          )} />
        )}

        {/* SSH session tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isProgressing = ["connecting", "authenticating"].includes(tab.status);
          const isRenaming = renamingTabId === tab.id;

          return (
            <button
              key={tab.id}
              className={cn(
                `group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors min-w-0 max-w-[180px] shrink-0 animate-in fade-in-0 slide-in-from-left-2 duration-150 ${focusRing}`,
                isActive ? styles.tabActive : styles.tabInactive
              )}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
            >
              {tab.type === "log" ? (
                <ScrollText className="h-3 w-3 shrink-0" />
              ) : isProgressing ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : tab.status === "connected" && tab.type === "local" ? (
                <Terminal className="h-3 w-3 shrink-0" />
              ) : tab.status === "connected" ? (
                <Wifi className="h-3 w-3 shrink-0" />
              ) : tab.status === "error" || tab.status === "disconnected" ? (
                <WifiOff className="h-3 w-3 shrink-0" />
              ) : (
                <Terminal className="h-3 w-3 shrink-0" />
              )}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="bg-transparent border-b border-current text-xs outline-none w-20 min-w-0"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingTabId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{tab.title}</span>
              )}
              <span
                className={cn(
                  "shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100",
                  styles.tabClose
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab context menu */}
      {menu && tabMenuTarget && (
        <div
          className="fixed inset-0 z-50"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={close}
        >
          <div
            ref={menuRef}
            className="fixed min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: menu.x, top: menu.y, visibility: "hidden", opacity: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
              onClick={() => startRename(tabMenuTarget)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
              onClick={() => { onCloseTab(tabMenuTarget); close(); }}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
            {tabs.length > 1 && (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
                  onClick={() => { onCloseOtherTabs(tabMenuTarget); close(); }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Close Others
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
                  onClick={() => { onCloseAllTabs(); close(); }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Close All
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Window controls */}
      <div className="flex items-center gap-0.5 shrink-0 mr-1">
        {inTerminal && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn("inline-flex items-center justify-center rounded-md transition-colors mr-1", styles.iconBtn, focusRing)}
              >
                <Palette className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-72 overflow-y-auto">
              {terminalThemes.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => setTerminalThemeId(t.id)}
                  className="flex items-center gap-2"
                >
                  <div
                    className="h-3 w-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: t.colors.background }}
                  />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t.variant === "light" ? "Light" : "Dark"}
                  </span>
                  {t.id === terminalThemeId && <Check className="h-3 w-3 shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          aria-label="Minimize"
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn, focusRing)}
          onClick={() => getAppWindow().minimize().catch((e) => logger.warn("minimize failed:", e))}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn, focusRing)}
          onClick={() => getAppWindow().toggleMaximize().catch((e) => logger.warn("toggleMaximize failed:", e))}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Close"
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn, styles.closeHover, focusRing)}
          onClick={() => getAppWindow().close().catch((e) => logger.warn("close failed:", e))}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-sm" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="items-center">
            <svg className="h-16 w-16 rounded-xl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
              <defs>
                <linearGradient id="about-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1a1b26"/>
                  <stop offset="100%" stopColor="#24283b"/>
                </linearGradient>
                <linearGradient id="about-accent" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7aa2f7"/>
                  <stop offset="100%" stopColor="#bb9af7"/>
                </linearGradient>
              </defs>
              <rect x="16" y="16" width="480" height="480" rx="96" fill="url(#about-bg)"/>
              <rect x="16" y="16" width="480" height="480" rx="96" stroke="url(#about-accent)" strokeWidth="3" strokeOpacity="0.3" fill="none"/>
              <path d="M 128 192 L 224 264 L 128 336" stroke="url(#about-accent)" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <line x1="260" y1="320" x2="384" y2="320" stroke="#a9b1d6" strokeWidth="36" strokeLinecap="round" opacity="0.7"/>
            </svg>
            <DialogTitle className="text-lg">Termix</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              A modern, cross-platform SSH terminal client built with Tauri.
            </p>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">{appVersion}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">Stack</span>
              <span className="text-xs">Tauri v2 + React + Rust</span>
            </div>
            <div
              className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
              role="link"
              onClick={() => openUrl("https://github.com/Yueby/termix")}
            >
              <span className="text-muted-foreground">GitHub</span>
              <span className="flex items-center gap-1 text-xs text-primary">
                Yueby/termix
                <ExternalLink className="h-3 w-3" />
              </span>
            </div>
            <CheckUpdateButton />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckUpdateButton() {
  const { status, checkForUpdate } = useUpdateStore();
  const isChecking = status === "checking";

  return (
    <button
      className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
      onClick={checkForUpdate}
      disabled={isChecking}
    >
      <span className="text-muted-foreground">Update</span>
      <span className="flex items-center gap-1 text-xs">
        {isChecking && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "error" ? "Check failed" : status === "up-to-date" ? "Up to date" : isChecking ? "Checking..." : "Check for updates"}
      </span>
    </button>
  );
}
