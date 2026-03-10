import { Button } from "@/components/ui/button";
import { useTransferStore, type TransferTask } from "@/stores/transfer-store";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";

export function TransferBar() {
  const tasks = useTransferStore((s) => s.tasks);

  if (tasks.length === 0) return null;

  return (
    <div className="border-t bg-muted/20 shrink-0 max-h-32 overflow-y-auto animate-in slide-in-from-bottom-2 fade-in-0 duration-200">
      {tasks.map((task) => (
        <TransferRow key={task.id} task={task} />
      ))}
    </div>
  );
}

function TransferRow({ task }: { task: TransferTask }) {
  const retryTask = useTransferStore((s) => s.retryTask);
  const discardTask = useTransferStore((s) => s.discardTask);

  const progress = task.totalBytes > 0
    ? Math.round((task.transferredBytes / task.totalBytes) * 100)
    : 0;

  const speed = task.status === "in_progress" && task.transferredBytes > 0
    ? formatSpeed(task.transferredBytes, task.createdAt)
    : "";

  const eta = task.status === "in_progress" && task.transferredBytes > 0 && task.totalBytes > 0
    ? formatEta(task.transferredBytes, task.totalBytes, task.createdAt)
    : "";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-border/50 last:border-b-0">
      <StatusIcon status={task.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-foreground">{task.fileName}</span>
          {task.status === "in_progress" && speed && (
            <span className="shrink-0 text-muted-foreground">
              {formatSize(task.transferredBytes)}/{formatSize(task.totalBytes)}, {speed}{eta && `, about ${eta}`}
            </span>
          )}
        </div>

        {(task.status === "in_progress" || task.status === "pending") && (
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {task.status === "failed" && (
        <span className="shrink-0 text-destructive flex items-center gap-1 max-w-[300px]" title={task.error}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {task.direction === "upload" ? "Upload" : task.direction === "download" ? "Download" : "Copy"} failed
            {task.error && `: ${task.error}`}
          </span>
        </span>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {task.status === "failed" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-primary"
            onClick={() => retryTask(task.id)}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            RETRY
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => discardTask(task.id)}
        >
          {task.status === "in_progress" || task.status === "pending" ? (
            <X className="h-3 w-3" />
          ) : (
            "DISCARD"
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TransferTask["status"] }) {
  switch (status) {
    case "pending":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />;
    case "in_progress":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 text-primary animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />;
    case "failed":
      return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "kB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function formatSpeed(transferred: number, startTime: number): string {
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed <= 0) return "";
  const bps = transferred / elapsed;
  return `${formatSize(bps)}/s`;
}

function formatEta(transferred: number, total: number, startTime: number): string {
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed <= 0 || transferred <= 0) return "";
  const bps = transferred / elapsed;
  const remaining = (total - transferred) / bps;
  if (remaining < 60) return `~${Math.ceil(remaining)} seconds remaining`;
  return `~${Math.ceil(remaining / 60)} minutes remaining`;
}
