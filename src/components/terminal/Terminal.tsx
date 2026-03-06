import { localResize, localWrite, sshResize, sshWrite } from "@/lib/tauri";
import { getThemeById } from "@/lib/terminal-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { useSnippetAutocomplete } from "@/hooks/use-snippet-autocomplete";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { SnippetAutocomplete } from "./SnippetAutocomplete";

interface SshDataEvent {
  session_id: string;
  data: number[];
}

interface SshDisconnectEvent {
  session_id: string;
  reason: string;
}

export interface TerminalProps {
  sessionId: string | null;
  isActive: boolean;
  mode?: "ssh" | "local";
  onDisconnect?: (sessionId: string, reason: string) => void;
}

export function TerminalView({
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
    const timer = window.setTimeout(() => {
      fitAddonRef.current?.fit();
      if (sessionId && xtermRef.current) {
        resizeSession(sessionId, xtermRef.current.cols, xtermRef.current.rows).catch(console.warn);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isActive, sessionId, resizeSession]);

  // Update font settings without destroying the terminal
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
    const unicode11Addon = new Unicode11Addon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
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
        writeToSession(sessionId, bytes).catch(console.warn);
      });

      if (isActiveRef.current) {
        resizeSession(sessionId, xterm.cols, xterm.rows).catch(console.warn);
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
      const dataEvent = currentMode === "local" ? "local_data" : "ssh_data";
      const disconnectEvent = currentMode === "local" ? "local_disconnect" : "ssh_disconnect";

      unlistenPromises.push(
        listen<SshDataEvent>(dataEvent, (event) => {
          if (disposed) return;
          if (event.payload.session_id === sid) {
            xterm.write(new Uint8Array(event.payload.data));
          }
        })
      );

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
          resizeSession(sessionId, xterm.cols, xterm.rows).catch(console.warn);
        }
      }, 100);
    });
    resizeObserver.observe(termRef.current);

    return () => {
      disposed = true;
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
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

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: theme.colors.background }}
      onKeyDown={handleKeyDown}
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
    </div>
  );
}
