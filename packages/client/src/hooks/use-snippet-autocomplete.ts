import { createLogger } from "@/lib/logger";
import { useSnippetStore, type Snippet } from "@/stores/snippet-store";
import { useCallback, useRef, useState } from "react";

const logger = createLogger("snippet-autocomplete");

export function useSnippetAutocomplete(
  sessionId: string | null,
  writeToSession: (sid: string, data: number[]) => Promise<void>,
) {
  const [suggestions, setSuggestions] = useState<Snippet[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const inputBufferRef = useRef("");

  const matchSnippets = useCallback((query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setAutocompleteVisible(false);
      return;
    }
    const snippets = useSnippetStore.getState().snippets;
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const matched = snippets.filter((s) => {
      if (seen.has(s.id)) return false;
      const match =
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.content && s.content.toLowerCase().startsWith(q));
      if (match) seen.add(s.id);
      return match;
    }).slice(0, 8);

    setSuggestions(matched);
    setSelectedIndex(0);
    setAutocompleteVisible(matched.length > 0);
  }, []);

  const insertSnippet = useCallback((snippet: Snippet) => {
    if (!sessionId) return;
    const buffer = inputBufferRef.current;
    const backspaces = new Uint8Array(buffer.length).fill(0x7f);
    const encoder = new TextEncoder();
    const backBytes = Array.from(backspaces);
    const contentBytes = Array.from(encoder.encode(snippet.content));
    writeToSession(sessionId, [...backBytes, ...contentBytes]).catch((e) => logger.warn("writeToSession failed:", e));
    inputBufferRef.current = "";
    setSuggestions([]);
    setAutocompleteVisible(false);
  }, [sessionId, writeToSession]);

  const closeAutocomplete = useCallback(() => {
    setSuggestions([]);
    setAutocompleteVisible(false);
    inputBufferRef.current = "";
  }, []);

  const handleTerminalData = useCallback((data: string) => {
    if (data === "\r" || data === "\n") {
      inputBufferRef.current = "";
      setSuggestions([]);
      setAutocompleteVisible(false);
    } else if (data === "\x7f" || data === "\b") {
      inputBufferRef.current = inputBufferRef.current.slice(0, -1);
      matchSnippets(inputBufferRef.current);
    } else if (data === "\x1b" || data.startsWith("\x1b[")) {
      // Escape sequences — ignore for buffer
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      inputBufferRef.current += data;
      matchSnippets(inputBufferRef.current);
    } else if (data === "\t") {
      inputBufferRef.current = "";
      setSuggestions([]);
      setAutocompleteVisible(false);
    }
  }, [matchSnippets]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!autocompleteVisible || suggestions.length === 0) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev >= suggestions.length - 1 ? 0 : prev + 1));
          break;
        case "Tab":
        case "Enter":
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            e.stopPropagation();
            insertSnippet(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closeAutocomplete();
          break;
      }
    },
    [autocompleteVisible, suggestions, selectedIndex, insertSnippet, closeAutocomplete]
  );

  const resetBuffer = useCallback(() => {
    inputBufferRef.current = "";
    setSuggestions([]);
    setAutocompleteVisible(false);
  }, []);

  return {
    suggestions,
    selectedIndex,
    autocompleteVisible,
    insertSnippet,
    closeAutocomplete,
    handleTerminalData,
    handleKeyDown,
    resetBuffer,
  };
}
