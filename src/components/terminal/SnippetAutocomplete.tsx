import { useEffect, useRef, useMemo } from "react";
import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Snippet } from "@/stores/snippet-store";

interface CursorPosition {
  x: number;
  y: number;
}

interface SnippetAutocompleteProps {
  suggestions: Snippet[];
  selectedIndex: number;
  onSelect: (snippet: Snippet) => void;
  cursorPos?: CursorPosition;
  containerWidth?: number;
  containerHeight?: number;
}

const POPUP_WIDTH = 280;
const MAX_VISIBLE = 3;
const MARGIN = 8;

export function SnippetAutocomplete({
  suggestions,
  selectedIndex,
  onSelect,
  cursorPos,
  containerWidth = 800,
  containerHeight = 600,
}: SnippetAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const hasAnyName = suggestions.some((s) => !!s.name);
  const itemHeight = hasAnyName ? 44 : 28;
  const popupMaxHeight = itemHeight * MAX_VISIBLE + 8;

  const style = useMemo(() => {
    if (!cursorPos) return { left: MARGIN, bottom: MARGIN };

    const pos: React.CSSProperties = {};

    if (cursorPos.x + POPUP_WIDTH + MARGIN > containerWidth) {
      pos.right = MARGIN;
    } else {
      pos.left = cursorPos.x;
    }

    if (cursorPos.y - popupMaxHeight - MARGIN < 0) {
      pos.top = cursorPos.y + 24;
    } else {
      pos.bottom = containerHeight - cursorPos.y + MARGIN;
    }

    return pos;
  }, [cursorPos, containerWidth, containerHeight, popupMaxHeight]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className="absolute z-50 w-[280px] rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        ref={listRef}
        className="flex flex-col overflow-y-auto py-1"
        style={{ maxHeight: popupMaxHeight }}
      >
        {suggestions.map((snippet, i) => (
          <button
            key={snippet.id}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              i === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
            onClick={() => onSelect(snippet)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Code2 className="h-3 w-3 shrink-0 text-primary" />
            <div className="flex flex-col min-w-0 flex-1">
              {snippet.name && (
                <span className="font-medium truncate">{snippet.name}</span>
              )}
              <span className="text-[10px] text-muted-foreground truncate font-mono">
                {snippet.content}
              </span>
            </div>
            {i === selectedIndex && (
              <kbd className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                Tab
              </kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
