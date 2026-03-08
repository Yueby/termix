import { clearTerminalLogs, deleteTerminalLog, getTerminalLogs, type TerminalLogEntry } from "@/lib/tauri";
import { create } from "zustand";

interface LogState {
  logs: TerminalLogEntry[];
  loading: boolean;
  loadLogs: () => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const useLogStore = create<LogState>()((set) => ({
  logs: [],
  loading: false,

  loadLogs: async () => {
    set({ loading: true });
    try {
      const logs = await getTerminalLogs();
      set({ logs, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  removeLog: async (id: string) => {
    await deleteTerminalLog(id);
    set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
  },

  clearLogs: async () => {
    await clearTerminalLogs();
    set({ logs: [] });
  },
}));
