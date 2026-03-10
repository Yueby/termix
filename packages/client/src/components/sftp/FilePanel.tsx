import { ConnectionProgress } from "@/components/connection/ConnectionProgress";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createLogger } from "@/lib/logger";
import type { FileEntry } from "@/lib/tauri";
import { executeTransfer } from "@/lib/transfer";
import { cn } from "@/lib/utils";
import type { SessionTab } from "@/stores/session-store";
import { useSftpStore, type PanelSide } from "@/stores/sftp-store";
import { useUiStore } from "@/stores/ui-store";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Eye, EyeOff, FolderPlus, HardDrive, Monitor, MoreHorizontal, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { EditPermissionsDialog } from "./EditPermissionsDialog";
import { FileTable, type FileAction } from "./FileTable";
import { HostSelector } from "./HostSelector";
import { NewFolderDialog } from "./NewFolderDialog";
import { PathBreadcrumb } from "./PathBreadcrumb";
import { RenameDialog } from "./RenameDialog";

const logger = createLogger("file-panel");

interface FilePanelProps {
  side: PanelSide;
  isDragOver?: boolean;
}

export function FilePanel({ side, isDragOver }: FilePanelProps) {
  const panel = useSftpStore((s) => side === "left" ? s.leftPanel : s.rightPanel);
  const navigateTo = useSftpStore((s) => s.navigateTo);
  const refresh = useSftpStore((s) => s.refresh);
  const goBack = useSftpStore((s) => s.goBack);
  const goForward = useSftpStore((s) => s.goForward);
  const showHostSelect = useSftpStore((s) => s.showHostSelect);
  const switchToLocal = useSftpStore((s) => s.switchToLocal);
  const goBackFromHostSelectAction = useSftpStore((s) => s.goBackFromHostSelect);
  const createDir = useSftpStore((s) => s.createDir);
  const deleteEntry = useSftpStore((s) => s.deleteEntry);
  const renameEntry = useSftpStore((s) => s.renameEntry);
  const chmod = useSftpStore((s) => s.chmod);
  const showHiddenFiles = useSftpStore((s) => s.showHiddenFiles);
  const toggleHiddenFiles = useSftpStore((s) => s.toggleHiddenFiles);

  const [refreshing, setRefreshing] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [permTarget, setPermTarget] = useState<FileEntry | null>(null);

  const title =
    panel.mode === "local"
      ? "Local"
      : panel.connectedHost?.name ?? "Remote";

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh(side);
    setRefreshing(false);
  };

  const handleNavigate = (path: string) => {
    navigateTo(side, path);
  };

  const handleFileDoubleClick = (name: string, isDir: boolean) => {
    if (!isDir) return;

    const isWinPath = panel.mode === "local" && /^[A-Z]:/i.test(panel.currentPath);
    const sep = isWinPath ? "\\" : "/";

    let newPath: string;

    if (name === "..") {
      if (isWinPath && /^[A-Z]:\\?$/i.test(panel.currentPath)) {
        return;
      }
      if (panel.currentPath === "/") {
        return;
      }
      const normalized = panel.currentPath.replace(/[\\/]+$/, "");
      const parts = normalized.split(/[\\/]/);
      parts.pop();

      if (isWinPath && parts.length === 1 && /^[A-Z]:$/i.test(parts[0])) {
        newPath = parts[0] + "\\";
      } else if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) {
        newPath = "/";
      } else {
        newPath = parts.join(sep);
      }
    } else {
      const base = panel.currentPath.replace(/[\\/]+$/, "");
      if (isWinPath && /^[A-Z]:$/i.test(base)) {
        newPath = base + "\\" + name;
      } else if (base === "/" || base === "") {
        newPath = "/" + name;
      } else {
        newPath = base + sep + name;
      }
    }

    navigateTo(side, newPath);
  };

  const handleGoBackFromHostSelect = () => {
    goBackFromHostSelectAction(side);
  };

  const getFullPath = (name: string) => {
    const isRemote = panel.mode === "remote";
    const sep = isRemote ? "/" : (/^[A-Z]:/i.test(panel.currentPath) ? "\\" : "/");
    return panel.currentPath.replace(/[\\/]+$/, "") + sep + name;
  };

  const handleOpenFile = async (file: FileEntry) => {
    if (panel.mode !== "local") return;
    try {
      const path = getFullPath(file.name);
      await openPath(path);
    } catch (err) {
      logger.error("Failed to open file:", err);
    }
  };

  const handleOpenWith = async (file: FileEntry) => {
    if (panel.mode !== "local") return;
    try {
      const result = await openDialog({
        title: "Choose application",
        filters: [{ name: "Application", extensions: ["exe", "app", "sh"] }],
      });
      if (result) {
        const filePath = getFullPath(file.name);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("local_open_with", { program: result, filePath });
      }
    } catch (err) {
      logger.error("Failed to open with:", err);
    }
  };

  const handleAction = (action: FileAction, file?: FileEntry) => {
    switch (action) {
      case "open":
        if (file) handleOpenFile(file);
        break;
      case "open-with":
        if (file) handleOpenWith(file);
        break;
      case "copy-to-target":
        if (file) {
          const otherSide = side === "left" ? "right" : "left";
          const sourcePanel = panel;
          const destPanel = useSftpStore.getState()[otherSide === "left" ? "leftPanel" : "rightPanel"];

          if (destPanel.view !== "files") return;

          void executeTransfer({
            sourceFile: file,
            sourcePath: sourcePanel.currentPath,
            destPath: destPanel.currentPath,
            sourceSessionId: sourcePanel.sftpSessionId,
            destSessionId: destPanel.sftpSessionId,
            sourceMode: sourcePanel.mode,
            destMode: destPanel.mode,
          }).then(() => {
            useSftpStore.getState().refresh(otherSide);
          }).catch((e) => logger.error("executeTransfer failed:", e));
        }
        break;
      case "rename":
        if (file) setRenameTarget(file);
        break;
      case "delete":
        if (file) setDeleteTarget(file);
        break;
      case "refresh":
        handleRefresh();
        break;
      case "new-folder":
        setNewFolderOpen(true);
        break;
      case "edit-permissions":
        if (file) setPermTarget(file);
        break;
    }
  };

  // Placeholder view: "Connect to host"
  if (panel.view === "placeholder") {
    return (
      <div className="flex flex-col h-full relative animate-in fade-in-0 duration-150">
        <div className="flex items-center gap-2 px-3 h-10 border-b bg-muted/30 shrink-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Monitor className="h-4 w-4 shrink-0" />
            Remote
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Monitor className="h-10 w-10 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm font-medium">Connect to host</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start by connecting to a saved host to manage your files with SFTP.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => showHostSelect(side)}
          >
            Select host
          </Button>
        </div>
      </div>
    );
  }

  // Connecting view: reuse SSH ConnectionProgress (with animation)
  if (panel.view === "connecting") {
    const conn = panel.pendingConnection;
    const fakeTab: SessionTab = {
      id: `sftp-${side}`,
      sessionId: panel.sftpSessionId,
      connectionId: panel.connectedHost?.id ?? "",
      title: panel.connectedHost?.name ?? "Remote",
      type: "terminal",
      status: panel.connectionStatus as SessionTab["status"],
      error: panel.error,
      host: conn?.host ?? "",
      port: conn?.port ?? 22,
      username: conn?.username ?? "",
      authType: (conn?.authType as "password" | "key") ?? "password",
      logs: panel.connectionLogs,
    };

    return (
      <div className="h-full animate-in fade-in-0 duration-150">
      <ConnectionProgress
        tab={fakeTab}
        protocol="SFTP"
        onSubmitAuth={(_tabId, password) => {
          useSftpStore.getState().submitAuth(side, password);
        }}
        onClose={() => {
          useSftpStore.getState().disconnectRemote(side);
        }}
        onRetry={() => {
          useSftpStore.getState().retryConnect(side);
        }}
        onEdit={(connectionId) => {
          useUiStore.getState().setDetailPanel({ type: "host", id: connectionId, source: side === "left" ? "sftp-left" : "sftp-right" });
        }}
      />
      </div>
    );
  }

  // Host selection view
  if (panel.view === "host-select") {
    return (
      <div className="flex flex-col h-full relative animate-in fade-in-0 duration-150">
        <div className="flex items-center gap-2 px-3 h-10 border-b bg-muted/30 shrink-0">
          <button
            onClick={handleGoBackFromHostSelect}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors -ml-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">Select Host</span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => switchToLocal(side)}
          >
            <HardDrive className="h-3 w-3 mr-1" />
            Local
          </Button>
        </div>
        <HostSelector side={side} />
      </div>
    );
  }

  // File browser view
  const isRemote = panel.mode === "remote";

  return (
    <div className="flex flex-col h-full relative animate-in fade-in-0 duration-150">
      <div className="flex items-center gap-2 px-3 h-10 border-b bg-muted/30 shrink-0">
        <button
          onClick={() => showHostSelect(side)}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium transition-colors rounded-md px-1.5 py-0.5 -ml-1.5",
            "hover:bg-accent/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          {panel.mode === "local" ? (
            <HardDrive className="h-4 w-4 shrink-0" />
          ) : (
            <Monitor className="h-4 w-4 shrink-0" />
          )}
          <span>{title}</span>
        </button>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRefresh}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", refreshing && "animate-spin")} />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleHiddenFiles(); }}>
              {showHiddenFiles
                ? <Eye className="mr-2 h-3.5 w-3.5" />
                : <EyeOff className="mr-2 h-3.5 w-3.5" />
              }
              Hidden Files
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PathBreadcrumb
        path={panel.currentPath}
        canGoBack={panel.historyIndex > 0}
        canGoForward={panel.historyIndex < panel.history.length - 1}
        onGoBack={() => goBack(side)}
        onGoForward={() => goForward(side)}
        onNavigate={handleNavigate}
        isLocal={panel.mode === "local"}
        disabled={panel.loading}
      />
      <FileTable
        files={panel.files}
        loading={panel.loading}
        error={panel.error}
        showParent={
          panel.currentPath !== "/" &&
          panel.currentPath !== "" &&
          !/^[A-Z]:\\?$/i.test(panel.currentPath)
        }
        showHiddenFiles={showHiddenFiles}
        onDoubleClick={handleFileDoubleClick}
        onAction={handleAction}
        isRemote={isRemote}
        isDragOver={isDragOver}
      />

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onConfirm={(name) => createDir(side, name)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        name={deleteTarget?.name ?? ""}
        isDir={deleteTarget?.is_dir ?? false}
        onConfirm={() => {
          if (deleteTarget) deleteEntry(side, deleteTarget.name, deleteTarget.is_dir);
          setDeleteTarget(null);
        }}
      />

      <RenameDialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        currentName={renameTarget?.name ?? ""}
        onConfirm={(newName) => {
          if (renameTarget) renameEntry(side, renameTarget.name, newName);
          setRenameTarget(null);
        }}
      />

      {isRemote && (
        <EditPermissionsDialog
          open={!!permTarget}
          onClose={() => setPermTarget(null)}
          path={permTarget ? getFullPath(permTarget.name) : ""}
          permissions={permTarget?.permissions}
          onSave={(mode) => {
            if (permTarget) chmod(side, permTarget.name, mode);
            setPermTarget(null);
          }}
        />
      )}
    </div>
  );
}
