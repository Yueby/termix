import { create } from "zustand";
import {
  getConnections,
  saveConnection,
  deleteConnection,
  type ConnectionInfo,
} from "@/lib/tauri";

export type { ConnectionInfo } from "@/lib/tauri";

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
      set({ connections, loaded: true });
    } catch (e) {
      console.warn("Failed to load connections from backend:", e);
      set({ loaded: true });
    }
  },

  addConnection: async (conn) => {
    set((state) => ({ connections: [...state.connections, conn] }));
    try {
      await saveConnection(conn);
    } catch (e) {
      console.warn("Failed to save connection:", e);
    }
  },

  updateConnection: async (id, partial) => {
    const existing = get().connections.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...partial };
    set((state) => ({
      connections: state.connections.map((c) => (c.id === id ? updated : c)),
    }));
    try {
      await saveConnection(updated);
    } catch (e) {
      console.warn("Failed to update connection:", e);
    }
  },

  removeConnection: async (id) => {
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    }));
    try {
      await deleteConnection(id);
    } catch (e) {
      console.warn("Failed to delete connection:", e);
    }
  },
}));
