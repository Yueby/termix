import { useState, useMemo, useCallback } from "react";
import { Code2, Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ListPage } from "@/components/layout/ListPage";
import { useSnippetStore, isSnippetEmpty, type Snippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";

export function SnippetList() {
  const { snippets } = useSnippetStore();
  const { selectedSnippetId, setSelectedSnippetId, setEditingSnippetId } = useUiStore();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return snippets;
    const q = search.toLowerCase();
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
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
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const deleteSnippet = snippets.find((s) => s.id === deleteTarget);

  return (
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
        <ContextMenu key={snippet.id}>
          <ContextMenuTrigger asChild>
            <button
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selectedSnippetId === snippet.id
                  ? "border-primary/40 bg-muted/30 hover:bg-accent/50"
                  : "border-transparent bg-muted/30 hover:bg-accent/50"
              )}
              onClick={() => setSelectedSnippetId(selectedSnippetId === snippet.id ? null : snippet.id)}
              onDoubleClick={() => switchEditingSnippet(snippet.id)}
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
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => handleCopy(snippet.content)}>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => switchEditingSnippet(snippet.id)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </ContextMenuItem>
            <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(snippet.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
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
  );
}
