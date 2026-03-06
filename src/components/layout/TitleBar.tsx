import { useRef } from "react";
import {
  Menu,
  Server,
  X,
  Minus,
  Square,
  Terminal,
  Loader2,
  Wifi,
  WifiOff,
  Settings,
  Info,
  Palette,
  Check,
} from "lucide-react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { terminalThemes } from "@/lib/terminal-themes";

let appWindow: Window | null = null;
function getAppWindow() {
  if (!appWindow) appWindow = getCurrentWindow();
  return appWindow;
}

function getThemeClasses(inTerminal: boolean, isDark: boolean) {
  if (!inTerminal) {
    return {
      tabActive: "bg-accent text-accent-foreground",
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
  terminalBg?: string;
  themeAccent?: string;
  themeVariant?: "dark" | "light";
}

export function TitleBar({ onCloseTab, terminalBg, themeAccent, themeVariant }: TitleBarProps) {
  const { tabs, activeTabId, setActiveTab } = useSessionStore();
  const { setSelectedHostId, setEditingHostId, setSettingsOpen } = useUiStore();
  const { terminalThemeId, setTerminalThemeId } = useSettingsStore();

  const isHome = activeTabId === null;
  const inTerminal = !isHome && !!terminalBg;
  const isDarkTerminal = inTerminal && themeVariant !== "light";
  const styles = getThemeClasses(inTerminal, isDarkTerminal);

  const goHome = () => {
    useSessionStore.getState().setActiveTab(null);
    setSelectedHostId(null);
    setEditingHostId(null);
  };

  const lastClickRef = useRef(0);

  const handleTitleBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role='button'], [role='menuitem'], [role='option'], [data-radix-collection-item]")) return;
    if (e.button !== 0) return;

    e.preventDefault();
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      lastClickRef.current = 0;
      getAppWindow().toggleMaximize().catch(console.error);
    } else {
      lastClickRef.current = now;
      getAppWindow().startDragging();
    }
  };

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center select-none",
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
              styles.iconBtn
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
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto px-1">
        {/* Hosts tab — always uses default shadcn colors */}
        <button
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors shrink-0",
            isHome ? styles.tabActive : styles.tabInactive
          )}
          onClick={goHome}
        >
          <Server className="h-3 w-3 shrink-0" />
          <span>Hosts</span>
        </button>

        {/* Separator */}
        {tabs.length > 0 && (
          <div className={cn(
            "mx-1 h-4 w-px shrink-0",
            styles.separator
          )} />
        )}

        {/* SSH session tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isProgressing = ["connecting", "authenticating"].includes(tab.status);

          return (
            <button
              key={tab.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors min-w-0 max-w-[180px] shrink-0",
                isActive
                  ? (inTerminal ? styles.activeTabText : styles.tabActive)
                  : styles.tabInactive
              )}
              style={isActive && inTerminal && themeAccent
                ? { backgroundColor: themeAccent + "59" }
                : undefined}
              onClick={() => setActiveTab(tab.id)}
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
              <span className="truncate">{tab.title}</span>
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

      {/* Window controls */}
      <div className="flex items-center gap-0.5 shrink-0 mr-1">
        {inTerminal && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn("inline-flex items-center justify-center rounded-md transition-colors mr-1", styles.iconBtn)}
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
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn)}
          onClick={() => getAppWindow().minimize().catch(console.error)}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn)}
          onClick={() => getAppWindow().toggleMaximize().catch(console.error)}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Close"
          className={cn("inline-flex items-center justify-center rounded-md transition-colors", styles.iconBtn, styles.closeHover)}
          onClick={() => getAppWindow().close().catch(console.error)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
