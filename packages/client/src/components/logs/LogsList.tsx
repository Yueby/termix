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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TerminalLogEntry } from "@/lib/tauri";
import { getTerminalLogContent } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useLogStore } from "@/stores/log-store";
import { useSessionStore } from "@/stores/session-store";
import { Monitor, ScrollText, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatDate(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeRange(start: number, end: number): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function LogsList() {
  const { logs, loading, loadLogs, removeLog, clearLogs } = useLogStore();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleOpenLog = useCallback(async (entry: TerminalLogEntry) => {
    try {
      const content = await getTerminalLogContent(entry.id);
      if (!content) return;

      const tabId = crypto.randomUUID();
      const title = `Log: ${entry.connectionName}, ${formatTime(entry.startedAt)}`;

      useSessionStore.getState().addTab({
        id: tabId,
        sessionId: null,
        connectionId: entry.connectionId,
        title,
        type: "log",
        status: "connected",
        error: null,
        host: entry.host,
        port: 0,
        username: entry.username,
        authType: "password",
        logId: entry.id,
        logContent: content,
      });
    } catch {
      // ignore
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (deleteTarget) {
      await removeLog(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, removeLog]);

  const handleClear = useCallback(async () => {
    await clearLogs();
    setClearOpen(false);
  }, [clearLogs]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 bg-card">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setClearOpen(true)}
          disabled={logs.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          CLEAR ALL
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {logs.length} {logs.length === 1 ? "log" : "logs"}
        </span>
      </div>

      <div className="px-4 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Session Logs
        </h3>
      </div>

      <ScrollArea className="flex-1">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Loading...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ScrollText className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">No logs yet</p>
            <p className="text-xs mt-1 text-muted-foreground/70">
              Logs are saved when you close a terminal tab.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {logs.map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                onClick={() => handleOpenLog(entry)}
                onDelete={() => setDeleteTarget(entry.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete log?</AlertDialogTitle>
            <AlertDialogDescription>
              This terminal log will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
            <AlertDialogDescription>
              All terminal logs will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClear}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogRow({
  entry,
  onClick,
  onDelete,
}: {
  entry: TerminalLogEntry;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b cursor-pointer",
        "hover:bg-accent/50 transition-colors group"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
        {entry.sessionType === "local" ? (
          <Monitor className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Server className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {entry.connectionName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {entry.sessionType}
            {entry.username && `, ${entry.username}`}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatDate(entry.startedAt)} · {formatTimeRange(entry.startedAt, entry.endedAt)}
        </div>
      </div>

      <button
        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
