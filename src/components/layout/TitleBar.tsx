import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContextMenu } from "@/hooks/use-context-menu";
import { createLogger } from "@/lib/logger";
import { terminalThemes } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import {
    Check,
    FolderOpen,
    Info,
    Loader2,
    Menu,
    Minus,
    Palette,
    Pencil,
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

function getThemeClasses(inTerminal: boolean, isDark: boolean) {
  if (!inTerminal) {
    return {
      tabActive: "bg-primary/15 text-primary font-medium",
      tabInactive: "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
      iconBtn: "h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent",
      closeHover: "hover:bg-destructive hover:text-destructive-foreground",
      separator: "bg-border",
      tabClose: "hover:bg-muted",
      activeTabText: "",
    };
  }
  if (isDark) {
    return {
      tabActive: "",
      tabInactive: "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white/90",
      iconBtn: "h-7 w-7 text-white/70 hover:text-white hover:bg-white/10",
      closeHover: "hover:bg-red-500/80 hover:text-white",
      separator: "bg-white/20",
      tabClose: "hover:bg-white/20",
      activeTabText: "text-white",
    };
  }
  return {
    tabActive: "",
    tabInactive: "bg-black/8 text-black/60 hover:bg-black/12 hover:text-black/80",
    iconBtn: "h-7 w-7 text-black/60 hover:text-black/80 hover:bg-black/8",
    closeHover: "hover:bg-red-500/80 hover:text-white",
    separator: "bg-black/15",
    tabClose: "hover:bg-black/12",
    activeTabText: "text-black/90",
  };
}

interface TitleBarProps {
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (keepTabId: string) => void;
  onCloseAllTabs: () => void;
  terminalBg?: string;
  themeAccent?: string;
  themeVariant?: "dark" | "light";
}

export function TitleBar({ onCloseTab, onCloseOtherTabs, onCloseAllTabs, terminalBg, themeAccent, themeVariant }: TitleBarProps) {
  const { tabs, activeTabId, setActiveTab, updateTab } = useSessionStore();
  const { activeView, setActiveView, setSelectedHostId, setEditingHostId, setSettingsOpen } = useUiStore();
  const { terminalThemeId, setTerminalThemeId } = useSettingsStore();

  const [tabMenuTarget, setTabMenuTarget] = useState<string | null>(null);
  const { menu, menuRef, open, close } = useContextMenu();
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isHome = activeTabId === null;
  const isSftp = isHome && activeView === "sftp";
  const inTerminal = !isHome && !!terminalBg;
  const isDarkTerminal = inTerminal && themeVariant !== "light";
  const styles = getThemeClasses(inTerminal, isDarkTerminal);

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

  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center select-none",
        !inTerminal && "border-b bg-background"
      )}
      style={inTerminal ? { backgroundColor: terminalBg } : undefined}
      onMouseDown={handleTitleBarMouseDown}
    >
      {/* Left: hamburger dropdown menu */}
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
          <DropdownMenuItem>
            <Info className="mr-2 h-4 w-4" />
            About Termix
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
                isActive
                  ? (inTerminal ? styles.activeTabText : styles.tabActive)
                  : styles.tabInactive
              )}
              style={isActive && inTerminal && themeAccent
                ? { backgroundColor: themeAccent + "59" }
                : undefined}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
            >
              {isProgressing ? (
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
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground outline-none"
              onClick={() => startRename(tabMenuTarget)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground outline-none"
              onClick={() => { onCloseTab(tabMenuTarget); close(); }}
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
            {tabs.length > 1 && (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground outline-none"
                  onClick={() => { onCloseOtherTabs(tabMenuTarget); close(); }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Close Others
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground outline-none"
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
    </div>
  );
}
