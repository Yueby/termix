import { ListPage } from "@/components/layout/ListPage";
import { Button } from "@/components/ui/button";
import { createLogger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useContextMenu } from "@/hooks/use-context-menu";
import { isSnippetEmpty, useSnippetStore, type Snippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { Code2, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const logger = createLogger("snippet");

export function SnippetList() {
  const { snippets } = useSnippetStore();
  const { selectedSnippetId, setSelectedSnippetId, setEditingSnippetId } = useUiStore();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<Snippet | null>(null);
  const { menu, menuRef, open, close } = useContextMenu();

  useEffect(() => {
    if (!menu) setMenuTarget(null);
  }, [menu]);

  const filtered = useMemo(() => {
    if (!search) return snippets;
    const q = search.toLowerCase();
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [snippets, search]);

  const handleNewSnippet = () => {
    const id = crypto.randomUUID();
    useSnippetStore.getState().addSnippet({ id, name: "", content: "", tags: [] });
    setSelectedSnippetId(id);
    setEditingSnippetId(id);
  };

  const handleDelete = (snippetId: string) => {
    useSnippetStore.getState().removeSnippet(snippetId);
    if (selectedSnippetId === snippetId) setSelectedSnippetId(null);
    if (useUiStore.getState().editingSnippetId === snippetId) setEditingSnippetId(null);
  };

  const switchEditingSnippet = useCallback((targetId: string) => {
    const { editingSnippetId } = useUiStore.getState();
    if (editingSnippetId && editingSnippetId !== targetId) {
      const curr = useSnippetStore.getState().snippets.find((s) => s.id === editingSnippetId);
      if (curr && isSnippetEmpty(curr)) {
        useSnippetStore.getState().removeSnippet(editingSnippetId);
      }
    }
    setSelectedSnippetId(targetId);
    setEditingSnippetId(targetId);
  }, [setSelectedSnippetId, setEditingSnippetId]);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch((e) => logger.warn("Clipboard write failed:", e));
  };

  const deleteSnippet = snippets.find((s) => s.id === deleteTarget);

  return (
    <>
      <ListPage
        items={filtered}
        totalCount={snippets.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search snippets..."
        actionButtons={
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleNewSnippet}>
            <Plus className="h-3 w-3" /> NEW SNIPPET
          </Button>
        }
        sectionTitle="Snippets"
        EmptyIcon={Code2}
        emptyText="No matching snippets"
        noItemsText="No snippets yet"
        renderItem={(snippet: Snippet) => (
          <button
            key={snippet.id}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selectedSnippetId === snippet.id
                ? "border-primary/40 bg-muted/30 hover:bg-accent/50 active:bg-accent/40"
                : "border-transparent bg-muted/30 hover:bg-accent/50 active:bg-accent/40"
            )}
            onClick={() => setSelectedSnippetId(selectedSnippetId === snippet.id ? null : snippet.id)}
            onDoubleClick={() => switchEditingSnippet(snippet.id)}
            onContextMenu={(e) => {
              setMenuTarget(snippet);
              open(e);
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Code2 className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium truncate">
                {snippet.name || snippet.content || "Empty"}
              </span>
              <span className="text-xs text-muted-foreground truncate font-mono">
                {snippet.content || "Empty"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                switchEditingSnippet(snippet.id);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </button>
        )}
        deleteOpen={!!deleteTarget}
        onDeleteOpenChange={(open) => !open && setDeleteTarget(null)}
        deleteTitle="Delete Snippet"
        deleteDescription={`Are you sure you want to delete "${deleteSnippet?.name || "this snippet"}"? This action cannot be undone.`}
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
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
              onClick={() => { handleCopy(menuTarget.content); close(); }}
            >
              <Copy className="h-4 w-4 text-muted-foreground" /> Copy
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80 transition-colors"
              onClick={() => { switchEditingSnippet(menuTarget.id); close(); }}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 transition-colors"
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
