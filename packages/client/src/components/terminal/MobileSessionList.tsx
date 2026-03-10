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
import { getTerminalPreviewLines } from "@/lib/terminal-registry";
import { cn } from "@/lib/utils";
import { useSessionStore, type SessionTab } from "@/stores/session-store";
import { useEffect, useState } from "react";
import { Loader2, Terminal, Wifi, WifiOff, X } from "lucide-react";

interface MobileSessionListProps {
  onCloseTab: (tabId: string) => void;
}

export function MobileSessionList({ onCloseTab }: MobileSessionListProps) {
  const { tabs, setActiveTab } = useSessionStore();

  return (
    <div className="flex flex-col h-full bg-content">
      {tabs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Terminal className="h-10 w-10 opacity-30" />
          <p className="text-sm">No active sessions</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-2">
          {tabs.map((tab) => (
            <SessionCard
              key={tab.id}
              tab={tab}
              onSelect={() => setActiveTab(tab.id)}
              onClose={() => onCloseTab(tab.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  tab,
  onSelect,
  onClose,
}: {
  tab: SessionTab;
  onSelect: () => void;
  onClose: () => void;
}) {
  const isConnected = tab.status === "connected";
  const isProgressing = ["connecting", "authenticating"].includes(tab.status);
  const [preview, setPreview] = useState<string[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!isConnected) { setPreview([]); return; }
    const update = () => setPreview(getTerminalPreviewLines(tab.id, 4));
    update();
    const timer = setInterval(update, 2000);
    return () => clearInterval(timer);
  }, [isConnected, tab.id]);

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnected || isProgressing) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className="relative rounded-xl border bg-card overflow-hidden active:bg-accent/30 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <div className={cn(
            "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
            isConnected ? "bg-success/10 text-success" :
            isProgressing ? "bg-warning/10 text-warning" :
            "bg-muted/50 text-muted-foreground"
          )}>
            {isProgressing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConnected && tab.type === "local" ? (
              <Terminal className="h-4 w-4" />
            ) : isConnected ? (
              <Wifi className="h-4 w-4" />
            ) : tab.status === "error" || tab.status === "disconnected" ? (
              <WifiOff className="h-4 w-4" />
            ) : (
              <Terminal className="h-4 w-4" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{tab.title}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {tab.type === "local" ? "Local" : "SSH"} · {tab.status}
            </span>
          </div>
          <button
            aria-label={`Close ${tab.title}`}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground active:bg-accent/50"
            onClick={handleCloseClick}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {preview.length > 0 && (
          <div className="mx-3 mb-3 rounded-md bg-muted/40 px-3 py-2 font-mono text-[10px] leading-[1.4] text-muted-foreground overflow-hidden">
            {preview.map((line, i) => (
              <div key={i} className="truncate whitespace-pre">{line || "\u00A0"}</div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close the {isConnected ? "active" : "pending"} connection to <span className="font-medium text-foreground">{tab.title}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
