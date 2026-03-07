import { ListPage } from "@/components/layout/ListPage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useContextMenu } from "@/hooks/use-context-menu";
import {
    useConnectionStore,
    type ConnectionInfo,
} from "@/stores/connection-store";
import { useUiStore } from "@/stores/ui-store";
import { Pencil, Plug, Server, Terminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface HostListProps {
  onConnect: (conn: ConnectionInfo) => void;
  onOpenLocal?: () => void;
  onSwitchEdit: (targetId: string) => void;
}

export function HostList({ onConnect, onOpenLocal, onSwitchEdit }: HostListProps) {
  const { connections } = useConnectionStore();
  const { selectedHostId, setSelectedHostId, setEditingHostId } = useUiStore();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<ConnectionInfo | null>(null);
  const { menu, menuRef, open, close } = useContextMenu();

  useEffect(() => {
    if (!menu) setMenuTarget(null);
  }, [menu]);

  const filtered = useMemo(() => {
    if (!search) return connections;
    const q = search.toLowerCase();
    return connections.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q)
    );
  }, [connections, search]);

  const handleNewHost = () => {
    const id = crypto.randomUUID();
    useConnectionStore.getState().addConnection({
      id, name: "", host: "", port: 22,
      username: "root", authType: "password", group: "Default",
      password: "", keyPath: "", keyPassphrase: "", keychainId: "",
    });
    setSelectedHostId(id);
    setEditingHostId(id);
  };

  const handleDelete = (connId: string) => {
    useConnectionStore.getState().removeConnection(connId);
    if (selectedHostId === connId) setSelectedHostId(null);
    if (useUiStore.getState().editingHostId === connId) setEditingHostId(null);
  };

  const handleQuickConnect = useCallback(() => {
    const input = search.trim();
    if (!input) return;

    let username = "root";
    let host = input;
    let port = 22;

    if (input.includes("@")) {
      const atIdx = input.indexOf("@");
      username = input.slice(0, atIdx) || "root";
      host = input.slice(atIdx + 1);
    }

    if (host.includes(":")) {
      const colonIdx = host.lastIndexOf(":");
      const portStr = host.slice(colonIdx + 1);
      const parsed = parseInt(portStr, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
        host = host.slice(0, colonIdx);
      }
    }

    if (!host) return;

    onConnect({
      id: crypto.randomUUID(),
      name: `${username}@${host}`,
      host, port, username, authType: "password", group: "Quick Connect",
      password: "", keyPath: "", keyPassphrase: "", keychainId: "",
    });
  }, [search, onConnect]);

  const deleteConn = connections.find((c) => c.id === deleteTarget);

  return (
    <>
      <ListPage
        items={filtered}
        totalCount={connections.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Find a host or ssh user@hostname..."
        searchExtra={
          <Button
            size="sm"
            variant="outline"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-3 text-xs"
            onClick={handleQuickConnect}
            disabled={!search.trim()}
          >
            CONNECT
          </Button>
        }
        onSearchKeyDown={(e) => {
          if (e.key === "Enter" && search.trim()) handleQuickConnect();
        }}
        actionButtons={
          <>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleNewHost}>
              <Server className="h-3 w-3" /> NEW HOST
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onOpenLocal}>
              <Terminal className="h-3 w-3" /> TERMINAL
            </Button>
          </>
        }
        sectionTitle="Hosts"
        EmptyIcon={Server}
        emptyText="No matching hosts"
        noItemsText="No hosts yet"
        renderItem={(conn) => (
          <div
            key={conn.id}
            role="button"
            tabIndex={0}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selectedHostId === conn.id
                ? "border-primary/40 bg-muted/30 hover:bg-accent/50"
                : "border-transparent bg-muted/30 hover:bg-accent/50"
            )}
            onClick={() => setSelectedHostId(selectedHostId === conn.id ? null : conn.id)}
            onDoubleClick={() => onConnect(conn)}
            onContextMenu={(e) => {
              setMenuTarget(conn);
              open(e);
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Server className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium truncate">
                {conn.name || conn.host || "New Host"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                ssh, {conn.username || "root"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onSwitchEdit(conn.id);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        deleteOpen={!!deleteTarget}
        onDeleteOpenChange={(open) => !open && setDeleteTarget(null)}
        deleteTitle="Delete Host"
        deleteDescription={`Are you sure you want to delete "${deleteConn?.name || deleteConn?.host || "this host"}"? This action cannot be undone.`}
        onDeleteConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
      {menu && menuTarget && (
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
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => { onConnect(menuTarget); close(); }}
            >
              <Plug className="h-4 w-4 text-muted-foreground" /> Connect
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => { onSwitchEdit(menuTarget.id); close(); }}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => { setDeleteTarget(menuTarget.id); close(); }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}
