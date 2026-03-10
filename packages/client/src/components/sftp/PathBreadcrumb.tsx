import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PathBreadcrumbProps {
  path: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onNavigate: (path: string) => void;
  isLocal: boolean;
  disabled?: boolean;
}

export function PathBreadcrumb({
  path,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onNavigate,
  isLocal,
  disabled = false,
}: PathBreadcrumbProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sep = isLocal && path.includes("\\") ? "\\" : "/";
  const segments = splitPath(path, sep);

  const startEditing = () => {
    setEditValue(path);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleEditSubmit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== path) {
      onNavigate(trimmed);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  return (
    <div className={cn(
      "flex items-center gap-1 px-3 h-8 border-b bg-muted/10 shrink-0 overflow-x-auto",
      disabled && "pointer-events-none opacity-50"
    )}>
      <NavButton disabled={!canGoBack || disabled} onClick={onGoBack}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </NavButton>
      <NavButton disabled={!canGoForward || disabled} onClick={onGoForward}>
        <ChevronRight className="h-3.5 w-3.5" />
      </NavButton>

      {editing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditSubmit}
          onKeyDown={handleEditKeyDown}
          className="flex-1 h-6 text-xs ml-1 px-2"
        />
      ) : (
        <div
          className="flex items-center gap-0.5 ml-1 min-w-0 flex-1 cursor-text rounded px-1 -mx-1 hover:bg-accent/30 transition-colors"
          onClick={startEditing}
        >
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
              <button
                className={cn(
                  "flex items-center gap-1 px-1 py-0.5 rounded text-xs transition-colors",
                  i === segments.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(seg.fullPath);
                }}
              >
                <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{seg.label}</span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NavButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1 rounded-md transition-colors shrink-0",
        disabled
          ? "text-muted-foreground/30 cursor-not-allowed"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

interface PathSegment {
  label: string;
  fullPath: string;
}

function splitPath(path: string, sep: string): PathSegment[] {
  if (!path) return [];

  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  const segments: PathSegment[] = [];

  if (normalized.startsWith("/")) {
    segments.push({ label: "/", fullPath: "/" });
  }

  const isWindowsDrive = /^[A-Z]:$/i.test(parts[0] ?? "");

  parts.forEach((part, i) => {
    let fullPath: string;
    if (i === 0 && isWindowsDrive) {
      fullPath = part + sep;
    } else if (segments.length === 0) {
      fullPath = part;
    } else {
      const prev = segments[segments.length - 1].fullPath.replace(/[\\/]+$/, "");
      fullPath = prev + sep + part;
    }
    segments.push({ label: part, fullPath });
  });

  return segments;
}
