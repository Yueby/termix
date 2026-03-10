import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createLogger } from "@/lib/logger";
import { isSnippetEmpty, useSnippetStore, type Snippet } from "@/stores/snippet-store";
import { useUiStore } from "@/stores/ui-store";
import { Code2, Copy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const logger = createLogger("snippet");

export function SnippetDetail() {
  const { editingSnippetId } = useUiStore();
  const { snippets, updateSnippet } = useSnippetStore();

  const snippet = snippets.find((s) => s.id === editingSnippetId);

  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const handleClose = useCallback(() => {
    const { editingSnippetId: eid, setEditingSnippetId: setEid, selectedSnippetId, setSelectedSnippetId } = useUiStore.getState();
    if (eid) {
      const s = useSnippetStore.getState().snippets.find((sn) => sn.id === eid);
      if (s && isSnippetEmpty(s)) {
        useSnippetStore.getState().removeSnippet(eid);
        if (selectedSnippetId === eid) setSelectedSnippetId(null);
      }
    }
    setEid(null);
  }, []);

  useEffect(() => {
    if (snippet) {
      setName(snippet.name);
      setContent(snippet.content);
      setTags(snippet.tags ?? []);
      setTagsInput("");
    }
  }, [editingSnippetId]);

  if (!snippet) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a snippet to edit</p>
      </div>
    );
  }

  const save = (patch: Partial<Snippet>) => {
    updateSnippet(snippet.id, patch);
  };

  const handleAddTag = () => {
    const tag = tagsInput.trim();
    if (tag && !tags.includes(tag)) {
      const newTags = [...tags, tag];
      setTags(newTags);
      save({ tags: newTags });
    }
    setTagsInput("");
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    save({ tags: newTags });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch((e) => logger.warn("Clipboard write failed:", e));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold">Snippet Details</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-5">
          {/* Name */}
          <section>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Name
            </Label>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Code2 className="h-5 w-5" />
              </div>
              <Input
                placeholder="Snippet name"
                value={name}
                onChange={(e) => { setName(e.target.value); save({ name: e.target.value }); }}
              />
            </div>
          </section>

          <Separator />

          {/* Command */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Command
            </Label>
            <Textarea
              className="min-h-[160px] font-mono text-sm resize-none"
              placeholder="echo 'Hello World'"
              value={content}
              onChange={(e) => { setContent(e.target.value); save({ content: e.target.value }); }}
            />
          </section>

          <Separator />

          {/* Tags */}
          <section className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Tags
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                  {tag}
                  <button
                    className="ml-0.5 rounded-sm hover:text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Add tag and press Enter"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={handleAddTag}
              className="h-8 text-sm"
            />
          </section>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button className="w-full" variant="secondary" onClick={handleCopy} disabled={!content}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy to Clipboard
        </Button>
      </div>
    </div>
  );
}
