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
