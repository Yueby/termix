import { useContextMenu } from "@/hooks/use-context-menu";
import type { FileEntry } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    AppWindow,
    ArrowDown,
    ArrowUp,
    Copy,
    ExternalLink,
    File,
    Folder,
    FolderPlus,
    Loader2,
    Pencil,
    RefreshCw,
    Shield,
    Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type FileAction =
  | "open"
  | "open-with"
  | "copy-to-target"
  | "rename"
  | "delete"
  | "refresh"
  | "new-folder"
  | "edit-permissions";

interface FileTableProps {
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  showParent: boolean;
  showHiddenFiles?: boolean;
  onDoubleClick: (name: string, isDir: boolean) => void;
  onAction?: (action: FileAction, file?: FileEntry) => void;
  isRemote?: boolean;
  isDragOver?: boolean;
}

type SortKey = "name" | "modified" | "size" | "kind";
type SortDir = "asc" | "desc";

function sortFiles(files: FileEntry[], key: SortKey, dir: SortDir): FileEntry[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;

    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "modified":
        cmp = (a.modified ?? 0) - (b.modified ?? 0);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "kind":
        cmp = a.kind.localeCompare(b.kind, undefined, { sensitivity: "base" });
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export function FileTable({ files, loading, error, showParent, showHiddenFiles, onDoubleClick, onAction, isRemote, isDragOver }: FileTableProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [menuFile, setMenuFile] = useState<FileEntry | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const containerRef = useRef<HTMLDivElement>(null);
  const { menu, menuRef, open, close } = useContextMenu();

  const visibleFiles = useMemo(
    () => showHiddenFiles ? files : files.filter((f) => !f.name.startsWith(".")),
    [files, showHiddenFiles],
  );
  const sortedFiles = useMemo(() => sortFiles(visibleFiles, sortKey, sortDir), [visibleFiles, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    if (!menu) setMenuFile(undefined);
  }, [menu]);

  if (loading && files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error && files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground px-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-center break-all">{error}</p>
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest("[data-file-name]");
    let file: FileEntry | undefined;
    if (row) {
      const name = row.getAttribute("data-file-name");
      if (name) {
        file = files.find((f) => f.name === name);
        if (file) setSelectedName(file.name);
      }
    }
    setMenuFile(file);
    open(e);
  };

  const fireAction = (action: FileAction) => {
    onAction?.(action, menuFile);
    close();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && files.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-destructive/10 text-destructive border-b border-destructive/20 shrink-0 animate-in fade-in-0 duration-150">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_160px_80px_80px] gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/20 shrink-0">
        <SortHeader label="Name" sortKey="name" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Date Modified" sortKey="modified" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
        <SortHeader label="Size" sortKey="size" currentKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
        <SortHeader label="Kind" sortKey="kind" currentKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
      </div>

      <div
        className="flex-1 overflow-y-auto min-h-0"
        onContextMenu={handleContextMenu}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedName(null);
        }}
      >
        <div className="divide-y divide-border/50">
          {showParent && (
            <FileRow
              name=".."
              isDir={true}
              size={0}
              kind="folder"
              selected={false}
              onClick={() => setSelectedName(null)}
              onDoubleClick={() => onDoubleClick("..", true)}
            />
          )}

          {sortedFiles.map((file) => (
            <FileRow
              key={`${file.name}-${file.modified ?? 0}`}
              name={file.name}
              isDir={file.is_dir}
              size={file.size}
              modified={file.modified}
              kind={file.kind}
              permissions={file.permissions}
              selected={selectedName === file.name}
              onClick={() => setSelectedName(file.name)}
              onDoubleClick={() => onDoubleClick(file.name, file.is_dir)}
            />
          ))}

          {sortedFiles.length === 0 && !showParent && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
              Empty directory
            </div>
          )}
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-md animate-in fade-in-0 duration-150">
          <svg
            className="h-12 w-12 text-muted-foreground/40 mb-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          <span className="text-sm font-medium text-foreground">Drop files here</span>
        </div>
      )}

      {menu && (
        <div
          className="fixed inset-0 z-50"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={close}
        >
          <div
            ref={menuRef}
            className="fixed min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: menu.x, top: menu.y, visibility: "hidden", opacity: 0 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menuFile && !menuFile.is_dir && !isRemote && (
              <>
                <MenuItem icon={ExternalLink} label="Open" onClick={() => fireAction("open")} />
                <MenuItem icon={AppWindow} label="Open with..." onClick={() => fireAction("open-with")} />
              </>
            )}
            {menuFile && (
              <>
                <MenuItem icon={Copy} label="Copy to target directory" onClick={() => fireAction("copy-to-target")} />
                <MenuItem icon={Pencil} label="Rename" onClick={() => fireAction("rename")} />
                <MenuItem icon={Trash2} label="Delete" variant="destructive" onClick={() => fireAction("delete")} />
                <div className="-mx-1 my-1 h-px bg-border" />
              </>
            )}
            <MenuItem icon={RefreshCw} label="Refresh" onClick={() => fireAction("refresh")} />
            <MenuItem icon={FolderPlus} label="New Folder" onClick={() => fireAction("new-folder")} />
            {menuFile && isRemote && (
              <MenuItem icon={Shield} label="Edit Permissions" onClick={() => fireAction("edit-permissions")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  variant,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  variant?: "destructive";
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
        "hover:bg-accent hover:text-accent-foreground transition-colors",
        variant === "destructive" && "text-destructive hover:bg-destructive/10 hover:text-destructive"
      )}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4 shrink-0", variant !== "destructive" && "text-muted-foreground")} />
      {label}
    </button>
  );
}

function SortHeader({
  label,
  sortKey: key,
  currentKey,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = key === currentKey;
  return (
    <button
      className={cn(
        "flex items-center gap-1 select-none transition-colors hover:text-foreground",
        align === "right" && "justify-end",
        active && "text-foreground"
      )}
      onClick={() => onSort(key)}
    >
      <span>{label}</span>
      {active && (
        dir === "asc"
          ? <ArrowUp className="h-3 w-3 shrink-0" />
          : <ArrowDown className="h-3 w-3 shrink-0" />
      )}
    </button>
  );
}

function FileRow({
  name,
  isDir,
  size,
  modified,
  kind,
  permissions,
  selected,
  onClick,
  onDoubleClick,
}: {
  name: string;
  isDir: boolean;
  size: number;
  modified?: number;
  kind: string;
  permissions?: string;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      data-file-name={name === ".." ? undefined : name}
      className={cn(
        "grid grid-cols-[1fr_160px_80px_80px] gap-2 px-3 py-1.5 text-xs cursor-default",
        "hover:bg-accent/50 transition-colors select-none",
        selected && "bg-primary/15 hover:bg-primary/20"
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="flex items-center gap-2 min-w-0">
        {isDir ? (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">
          {name}
          {permissions && (
            <span className="ml-2 text-muted-foreground/60">{permissions}</span>
          )}
        </span>
      </span>
      <span className="text-muted-foreground truncate">
        {modified ? formatDate(modified) : "- -"}
      </span>
      <span className="text-right text-muted-foreground">
        {isDir ? "- -" : formatSize(size)}
      </span>
      <span className="text-right text-muted-foreground truncate">
        {kind}
      </span>
    </div>
  );
}

function formatDate(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }) + ", " + d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
