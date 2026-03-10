import { useContextMenu } from "@/hooks/use-context-menu";
import { useSnippetAutocomplete } from "@/hooks/use-snippet-autocomplete";
import { createLogger } from "@/lib/logger";
import { attachConsumer, detachConsumer } from "@/lib/session-data-bridge";
import { localResize, localWrite, sshResize, sshWrite } from "@/lib/tauri";
import { registerTerminal, unregisterTerminal } from "@/lib/terminal-registry";
import { getThemeById } from "@/lib/terminal-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { useSnippetStore } from "@/stores/snippet-store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText as clipboardRead, writeText as clipboardWrite } from "@tauri-apps/plugin-clipboard-manager";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ClipboardPaste, Copy, Eraser, Plus, TextSelect } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SnippetAutocomplete } from "./SnippetAutocomplete";

const logger = createLogger("terminal");

interface SshDisconnectEvent {
  session_id: string;
  reason: string;
}

export interface TerminalProps {
  tabId: string;
  sessionId: string | null;
  isActive: boolean;
  mode?: "ssh" | "local";
  onDisconnect?: (sessionId: string, reason: string) => void;
}

export function TerminalView({
  tabId,
  sessionId,
  isActive,
  mode = "ssh",
  onDisconnect,
}: TerminalProps) {
  const { fontSize, fontFamily, cursorStyle, scrollBack, terminalThemeId: themeId } = useSettingsStore();

  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  const fontFamilyRef = useRef(fontFamily);
  fontFamilyRef.current = fontFamily;

  const cursorStyleRef = useRef(cursorStyle);
  cursorStyleRef.current = cursorStyle;

  const scrollBackRef = useRef(scrollBack);
  scrollBackRef.current = scrollBack;

  const themeIdRef = useRef(themeId);
  themeIdRef.current = themeId;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const writeToSession = useCallback((sid: string, data: number[]) => {
    if (modeRef.current === "local") {
      return localWrite(sid, data);
    }
    return sshWrite(sid, data);
  }, []);

  const resizeSession = useCallback((sid: string, cols: number, rows: number) => {
    if (modeRef.current === "local") {
      return localResize(sid, cols, rows);
    }
    return sshResize(sid, cols, rows);
  }, []);

  const {
    suggestions,
    selectedIndex,
    autocompleteVisible,
    insertSnippet,
    handleTerminalData,
    handleKeyDown,
    resetBuffer,
  } = useSnippetAutocomplete(sessionId, writeToSession);

  // Refit when becoming active (delayed to let layout settle after sidebar unmount)
  useEffect(() => {
    if (!isActive || !fitAddonRef.current || !xtermRef.current) return;
    const raf = requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      if (sessionId && xtermRef.current) {
        resizeSession(sessionId, xtermRef.current.cols, xtermRef.current.rows).catch((e) => logger.warn("resize failed:", e));
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, sessionId, resizeSession]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      xtermRef.current.options.fontFamily = fontFamily;
      if (isActiveRef.current) {
        fitAddonRef.current?.fit();
      }
    }
  }, [fontSize, fontFamily]);

  // Update theme without destroying the terminal
  useEffect(() => {
    if (xtermRef.current) {
      const theme = getThemeById(themeId);
      xtermRef.current.options.theme = theme.colors;
    }
  }, [themeId]);

  // Create terminal instance — only recreated when sessionId changes
  useEffect(() => {
    if (!termRef.current) return;

    const theme = getThemeById(themeIdRef.current);

    const xterm = new XTerm({
      fontSize: fontSizeRef.current,
      fontFamily: fontFamilyRef.current,
      cursorBlink: true,
      cursorStyle: cursorStyleRef.current,
      allowProposedApi: true,
      scrollback: scrollBackRef.current,
      theme: theme.colors,
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    const unicode11Addon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(serializeAddon);
    xterm.loadAddon(unicode11Addon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(termRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      xterm.loadAddon(webglAddon);
    } catch {
      // WebGL not available
    }

    xterm.unicode.activeVersion = "11";

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    registerTerminal(tabId, xterm, serializeAddon);

    if (isActiveRef.current) {
      fitAddon.fit();
    }

    if (sessionId) {
      xterm.attachCustomKeyEventHandler((event) => {
        const suggestionsEl = document.querySelector("[data-snippet-autocomplete]");
        if (!suggestionsEl) return true;
        if (event.type !== "keydown") return true;
        if (["Tab", "ArrowUp", "ArrowDown", "Escape"].includes(event.key)) {
          event.preventDefault();
          return false;
        }
        return true;
      });

      xterm.onData((data) => {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(data));
        handleTerminalData(data);
        writeToSession(sessionId, bytes).catch((e) => logger.warn("write failed:", e));
      });

      if (isActiveRef.current) {
        resizeSession(sessionId, xterm.cols, xterm.rows).catch((e) => logger.warn("resize failed:", e));
      }
    } else {
      xterm.writeln("\x1b[1;36m  Welcome to Termix\x1b[0m");
      xterm.writeln("\x1b[90m  Create a new connection to get started.\x1b[0m");
      xterm.writeln("");
    }

    let disposed = false;
    const unlistenPromises: Promise<UnlistenFn>[] = [];

    if (sessionId) {
      const sid = sessionId;
      const currentMode = modeRef.current;
      const disconnectEvent = currentMode === "local" ? "local_disconnect" : "ssh_disconnect";

      attachConsumer(sid, (data) => {
        if (!disposed) xterm.write(data);
      });

      unlistenPromises.push(
        listen<SshDisconnectEvent>(disconnectEvent, (event) => {
          if (disposed) return;
          if (event.payload.session_id === sid) {
            xterm.writeln(
              `\r\n\x1b[1;31m[Disconnected: ${event.payload.reason}]\x1b[0m`
            );
            onDisconnectRef.current?.(sid, event.payload.reason);
          }
        })
      );
    }

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!isActiveRef.current) return;
        fitAddon.fit();
        if (sessionId) {
          resizeSession(sessionId, xterm.cols, xterm.rows).catch((e) => logger.warn("resize failed:", e));
        }
      }, 100);
    });
    resizeObserver.observe(termRef.current);

    return () => {
      disposed = true;
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      if (sessionId) detachConsumer(sessionId);
      Promise.all(unlistenPromises).then((fns) => {
        fns.forEach((fn) => fn());
      });
      unregisterTerminal(tabId);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      resetBuffer();
    };
  }, [sessionId]);

  const getCursorPixelPos = useCallback(() => {
    if (!xtermRef.current || !termRef.current) return undefined;
    const xterm = xtermRef.current;
    const screenEl = termRef.current.querySelector(".xterm-screen");
    if (!screenEl) return undefined;

    const cellWidth = screenEl.clientWidth / xterm.cols;
    const cellHeight = screenEl.clientHeight / xterm.rows;

    return {
      x: 10 + xterm.buffer.active.cursorX * cellWidth,
      y: 2 + xterm.buffer.active.cursorY * cellHeight,
    };
  }, []);

  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | undefined>();
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (autocompleteVisible) {
      setCursorPos(getCursorPixelPos());
      if (termRef.current) {
        const rect = termRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    }
  }, [autocompleteVisible, suggestions, getCursorPixelPos]);

  const theme = getThemeById(themeId);

  const { menu: termMenu, menuRef: termMenuRef, open: openTermMenu, close: closeTermMenu } = useContextMenu();


  const focusTerminal = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  const handleCopy = useCallback(() => {
    const sel = xtermRef.current?.getSelection();
    if (sel) clipboardWrite(sel).catch((e) => logger.warn("copy failed:", e));
    closeTermMenu();
    requestAnimationFrame(focusTerminal);
  }, [focusTerminal]);

  const handlePaste = useCallback(() => {
    clipboardRead().then((text) => {
      if (text && xtermRef.current) {
        xtermRef.current.paste(text);
        xtermRef.current.clearSelection();
        xtermRef.current.scrollToBottom();
        xtermRef.current.focus();
      }
    }).catch((e) => logger.warn("paste failed:", e));
    closeTermMenu();
  }, []);

  const handleSelectAll = useCallback(() => {
    xtermRef.current?.selectAll();
    closeTermMenu();
    requestAnimationFrame(focusTerminal);
  }, [focusTerminal]);

  const [snippetDialog, setSnippetDialog] = useState<{ content: string } | null>(null);
  const [snippetName, setSnippetName] = useState("");
  const snippetNameRef = useRef<HTMLInputElement>(null);

  const handleAddToSnippets = useCallback(() => {
    const sel = xtermRef.current?.getSelection();
    if (sel?.trim()) {
      setSnippetDialog({ content: sel.trim() });
      setSnippetName("");
    }
    closeTermMenu();
  }, []);

  const handleSaveSnippet = useCallback(() => {
    if (!snippetDialog) return;
    const id = crypto.randomUUID();
    useSnippetStore.getState().addSnippet({
      id,
      name: snippetName.trim() || "Untitled",
      content: snippetDialog.content,
      tags: [],
    });
    setSnippetDialog(null);
  }, [snippetDialog, snippetName]);

  useEffect(() => {
    if (snippetDialog && snippetNameRef.current) {
      snippetNameRef.current.focus();
    }
  }, [snippetDialog]);

  const handleClearTerminal = useCallback(() => {
    xtermRef.current?.clear();
    closeTermMenu();
    requestAnimationFrame(focusTerminal);
  }, [focusTerminal]);

  const [hasSelection, setHasSelection] = useState(false);

  const handleTermContextMenuWrapped = useCallback((e: React.MouseEvent) => {
    setHasSelection(!!xtermRef.current?.getSelection());
    openTermMenu(e);
  }, [openTermMenu]);

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: theme.colors.background }}
      onKeyDown={handleKeyDown}
      onContextMenu={handleTermContextMenuWrapped}
    >
      <div className="h-full w-full pt-0.5 pb-2.5 pl-2.5 pr-1.5">
        <div ref={termRef} className="h-full w-full" />
      </div>
      {autocompleteVisible && (
        <div data-snippet-autocomplete>
          <SnippetAutocomplete
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={insertSnippet}
            cursorPos={cursorPos}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        </div>
      )}

      {/* Add to Snippets dialog */}
      {snippetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <div className="w-[400px] rounded-lg border bg-popover p-4 shadow-lg text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-150">
            <h3 className="text-sm font-medium mb-3">Add to Snippets</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <input
                  ref={snippetNameRef}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Snippet name..."
                  value={snippetName}
                  onChange={(e) => setSnippetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveSnippet();
                    if (e.key === "Escape") setSnippetDialog(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                <pre className="max-h-32 overflow-auto rounded-md border bg-muted/50 p-2 text-xs whitespace-pre-wrap break-all">
                  {snippetDialog.content}
                </pre>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="rounded-md px-3 py-1.5 text-xs border hover:bg-accent active:bg-accent/80 active:scale-95 transition-all"
                  onClick={() => setSnippetDialog(null)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 active:scale-95 transition-all"
                  onClick={handleSaveSnippet}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terminal content context menu */}
      {termMenu && (
        <div className="fixed inset-0 z-50">
          <div
            ref={termMenuRef}
            className="absolute min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ visibility: "hidden" }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none disabled:opacity-50 disabled:pointer-events-none"
              disabled={!hasSelection}
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
              onClick={handlePaste}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
              onClick={handleSelectAll}
            >
              <TextSelect className="h-3.5 w-3.5" />
              Select All
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none disabled:opacity-50 disabled:pointer-events-none"
              disabled={!hasSelection}
              onClick={handleAddToSnippets}
            >
              <Plus className="h-3.5 w-3.5" />
              Add to Snippets
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground active:bg-accent/80 outline-none"
              onClick={handleClearTerminal}
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear Terminal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
