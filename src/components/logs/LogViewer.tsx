import { getThemeById } from "@/lib/terminal-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

interface LogViewerProps {
  content: string;
  isActive: boolean;
}

export function LogViewer({ content, isActive }: LogViewerProps) {
  const { fontSize, fontFamily, terminalThemeId: themeId } = useSettingsStore();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const theme = getThemeById(themeId);

  useEffect(() => {
    if (!termRef.current) return;

    const xterm = new XTerm({
      fontSize,
      fontFamily,
      cursorBlink: false,
      disableStdin: true,
      allowProposedApi: true,
      scrollback: 50000,
      theme: theme.colors,
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(unicode11Addon);

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

    const timer = window.setTimeout(() => {
      fitAddon.fit();
      xterm.write(content, () => {
        xterm.scrollToTop();
      });
    }, 50);

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!isActiveRef.current) return;
        fitAddon.fit();
      }, 100);
    });
    resizeObserver.observe(termRef.current);

    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [content]);

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      const t = window.setTimeout(() => fitAddonRef.current?.fit(), 150);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      xtermRef.current.options.fontFamily = fontFamily;
      if (isActiveRef.current) fitAddonRef.current?.fit();
    }
  }, [fontSize, fontFamily]);

  useEffect(() => {
    if (xtermRef.current) {
      const t = getThemeById(themeId);
      xtermRef.current.options.theme = t.colors;
    }
  }, [themeId]);

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: theme.colors.background }}>
      <div className="h-full w-full pt-0.5 pb-2.5 pl-2.5 pr-1.5">
        <div ref={termRef} className="h-full w-full" />
      </div>
      <div className="absolute top-2 right-3 px-2 py-0.5 rounded text-[10px] font-medium bg-muted/80 text-muted-foreground border pointer-events-none select-none">
        READ-ONLY
      </div>
    </div>
  );
}
