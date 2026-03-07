import { createLogger } from "@/lib/logger";
import {
    deleteConnection,
    getConnections,
    saveConnection,
    type ConnectionInfo,
} from "@/lib/tauri";
import { create } from "zustand";

export type { ConnectionInfo } from "@/lib/tauri";

const logger = createLogger("connection-store");

function deriveGroups(connections: ConnectionInfo[]): string[] {
  const set = new Set(["Default"]);
  for (const c of connections) {
    if (c.group) set.add(c.group);
  }
  return [...set];
}

interface ConnectionState {
  connections: ConnectionInfo[];
  groups: string[];
  loaded: boolean;
  loadConnections: () => Promise<void>;
  addConnection: (conn: ConnectionInfo) => Promise<void>;
  updateConnection: (id: string, partial: Partial<ConnectionInfo>) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  connections: [],
  groups: ["Default"],
  loaded: false,

  loadConnections: async () => {
    try {
      const connections = await getConnections();
      set({ connections, groups: deriveGroups(connections), loaded: true });
    } catch (e) {
      logger.warn("Failed to load connections:", e);
      set({ loaded: true });
    }
  },

  addConnection: async (conn) => {
    const prev = get().connections;
    const next = [...prev, conn];
    set({ connections: next, groups: deriveGroups(next) });
    try {
      await saveConnection(conn);
    } catch (e) {
      logger.warn("Failed to save connection, rolling back:", e);
      set({ connections: prev, groups: deriveGroups(prev) });
    }
  },

  updateConnection: async (id, partial) => {
    const prev = get().connections;
    const existing = prev.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...partial };
    const next = prev.map((c) => (c.id === id ? updated : c));
    set({ connections: next, groups: deriveGroups(next) });
    try {
      await saveConnection(updated);
    } catch (e) {
      logger.warn("Failed to update connection, rolling back:", e);
      set({ connections: prev, groups: deriveGroups(prev) });
    }
  },

  removeConnection: async (id) => {
    const prev = get().connections;
    const next = prev.filter((c) => c.id !== id);
    set({ connections: next, groups: deriveGroups(next) });
    try {
      await deleteConnection(id);
    } catch (e) {
      logger.warn("Failed to delete connection, rolling back:", e);
      set({ connections: prev, groups: deriveGroups(prev) });
    }
  },
}));
