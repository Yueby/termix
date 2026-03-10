import { cn } from "@/lib/utils";
import { useSessionStore, type SessionTab } from "@/stores/session-store";
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, CircleStop, ClipboardPaste, Eraser, Keyboard, Terminal, Wifi, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";

interface MobileTerminalToolbarProps {
  onSendKey: (data: string) => void;
  onToggleKeyboard?: () => void;
  onPaste?: () => void;
}

interface SpecialKey {
  label: string;
  data: string;
  isModifier?: boolean;
  icon?: LucideIcon;
}

const SPECIAL_KEYS: SpecialKey[] = [
  { label: "↵", data: "\r" },
  { label: "C-c", data: "\x03", icon: CircleStop },
  { label: "Tab", data: "\t" },
  { label: "↑", data: "\x1b[A" },
  { label: "↓", data: "\x1b[B" },
  { label: "←", data: "\x1b[D" },
  { label: "→", data: "\x1b[C" },
  { label: "C-l", data: "\x0c", icon: Eraser },
  { label: "C-a", data: "\x01", icon: ArrowLeftToLine },
  { label: "C-e", data: "\x05", icon: ArrowRightToLine },
  { label: "Ctrl", data: "", isModifier: true },
  { label: "Esc", data: "\x1b" },
  { label: "|", data: "|" },
  { label: "/", data: "/" },
  { label: "~", data: "~" },
  { label: "-", data: "-" },
];

export function MobileTerminalToolbar({ onSendKey, onToggleKeyboard, onPaste }: MobileTerminalToolbarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);

  const handleKey = useCallback((key: SpecialKey) => {
    if (key.isModifier) {
      setCtrlActive((prev) => !prev);
      return;
    }

    if (ctrlActive && key.label.length === 1) {
      const code = key.label.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 27) {
        onSendKey(String.fromCharCode(code));
      } else {
        onSendKey(key.data);
      }
      setCtrlActive(false);
    } else {
      onSendKey(key.data);
    }
  }, [ctrlActive, onSendKey]);

  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5 bg-card border-t overflow-x-auto no-scrollbar safe-area-bottom">
      {onToggleKeyboard && (
        <button
          className="shrink-0 flex items-center justify-center h-8 w-9 rounded-md bg-muted text-muted-foreground active:bg-foreground/15 active:text-foreground active:scale-95 transition-all"
          onClick={onToggleKeyboard}
        >
          <Keyboard className="h-4 w-4" />
        </button>
      )}
      {onPaste && (
        <button
          className="shrink-0 flex items-center justify-center h-8 w-9 rounded-md bg-muted text-muted-foreground active:bg-foreground/15 active:text-foreground active:scale-95 transition-all"
          onClick={onPaste}
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      )}
      {SPECIAL_KEYS.map((key) => (
        <button
          key={key.label}
          className={cn(
            "shrink-0 flex items-center justify-center h-8 min-w-[2.5rem] px-2 rounded-md text-xs font-medium transition-all active:scale-95",
            key.isModifier && ctrlActive
              ? "bg-foreground/15 text-foreground font-semibold"
              : "bg-muted text-muted-foreground active:bg-foreground/15 active:text-foreground"
          )}
          onClick={() => handleKey(key)}
        >
          {key.icon ? <key.icon className="h-3.5 w-3.5" /> : key.label}
        </button>
      ))}
    </div>
  );
}

interface MobileTerminalHeaderProps {
  title?: string;
  onBack: () => void;
  terminalBg?: string;
  terminalFg?: string;
}

function SessionTabButton({ tab, isActive, onSelect, hasBg }: {
  tab: SessionTab;
  isActive: boolean;
  onSelect: () => void;
  hasBg: boolean;
}) {
  const isLocal = tab.type === "local";
  const Icon = isLocal ? Terminal : Wifi;

  return (
    <button
      className={cn(
        "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors",
        isActive
          ? hasBg
            ? "bg-foreground/10 font-medium"
            : "bg-accent text-accent-foreground font-medium"
          : hasBg
            ? "opacity-50 active:bg-foreground/10"
            : "text-muted-foreground active:bg-accent/50"
      )}
      onClick={onSelect}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="max-w-[120px] truncate">{tab.title}</span>
    </button>
  );
}

export function MobileTerminalHeader({ onBack, terminalBg, terminalFg }: MobileTerminalHeaderProps) {
  const hasBg = !!terminalBg;
  const { tabs, activeTabId, setActiveTab } = useSessionStore();

  const connectedTabs = tabs.filter(
    (t) => (t.status === "connected" && t.sessionId) || t.type === "log"
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-2 shrink-0",
        !hasBg && "border-b bg-card"
      )}
      style={hasBg ? {
        backgroundColor: terminalBg,
        color: terminalFg,
      } : undefined}
    >
      <button
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md transition-colors shrink-0",
          hasBg
            ? "active:bg-foreground/10"
            : "text-muted-foreground active:bg-accent/50"
        )}
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {connectedTabs.map((tab) => (
          <SessionTabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => setActiveTab(tab.id)}
            hasBg={hasBg}
          />
        ))}
      </div>
    </div>
  );
}
