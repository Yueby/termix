import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as XTerm } from "@xterm/xterm";

interface TerminalEntry {
  xterm: XTerm;
  serializeAddon: SerializeAddon;
  tabId: string;
  createdAt: number;
}

const registry = new Map<string, TerminalEntry>();

export function registerTerminal(tabId: string, xterm: XTerm, serializeAddon: SerializeAddon) {
  registry.set(tabId, { xterm, serializeAddon, tabId, createdAt: Date.now() });
}

export function unregisterTerminal(tabId: string) {
  registry.delete(tabId);
}

export function serializeTerminal(tabId: string): string | null {
  const entry = registry.get(tabId);
  if (!entry) return null;
  try {
    return entry.serializeAddon.serialize();
  } catch {
    return null;
  }
}

export function getTerminalCreatedAt(tabId: string): number | null {
  return registry.get(tabId)?.createdAt ?? null;
}

export function getTerminalPreviewLines(tabId: string, maxLines = 6): string[] {
  const entry = registry.get(tabId);
  if (!entry) return [];
  try {
    const buf = entry.xterm.buffer.active;
    const lines: string[] = [];
    const start = Math.max(0, buf.baseY + buf.cursorY - maxLines + 1);
    const end = buf.baseY + buf.cursorY + 1;
    for (let i = start; i < end; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    while (lines.length > 0 && lines[0].trim() === "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

export function focusTerminal(tabId: string) {
  const entry = registry.get(tabId);
  if (entry) entry.xterm.focus();
}

export function pasteToTerminal(tabId: string, data: string) {
  const entry = registry.get(tabId);
  if (entry) {
    entry.xterm.paste(data);
    entry.xterm.scrollToBottom();
  }
}
