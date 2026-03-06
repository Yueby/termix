import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  group: string;
  password?: string;
  keyPath?: string;
  keyPassphrase?: string;
}

interface ConnectionState {
  connections: ConnectionInfo[];
  groups: string[];
  addConnection: (conn: ConnectionInfo) => void;
  updateConnection: (id: string, conn: Partial<ConnectionInfo>) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      connections: [],
      groups: ["Default"],

      addConnection: (conn) =>
        set((state) => ({
          connections: [...state.connections, conn],
        })),

      updateConnection: (id, partial) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...partial } : c
          ),
        })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
        })),
    }),
    {
      name: "termix-connections",
      partialize: (state) => ({
        connections: state.connections.map(({ password, keyPassphrase, ...rest }) => rest),
        groups: state.groups,
      }),
    }
  )
);
