import { createLogger } from "@/lib/logger";
import { create } from "zustand";

const logger = createLogger("transfer-store");

export type TransferStatus = "pending" | "in_progress" | "completed" | "failed";
export type TransferDirection = "upload" | "download" | "copy";

export interface TransferTask {
  id: string;
  direction: TransferDirection;
  sourcePath: string;
  destPath: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  status: TransferStatus;
  error?: string;
  sourceSessionId?: string | null;
  destSessionId?: string | null;
  isDir?: boolean;
  createdAt: number;
}

const completedTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface TransferState {
  tasks: TransferTask[];
  addTask: (task: Omit<TransferTask, "id" | "createdAt" | "status" | "transferredBytes">) => string;
  updateTask: (id: string, updates: Partial<TransferTask>) => void;
  retryTask: (id: string) => void;
  discardTask: (id: string) => void;
  clearCompleted: () => void;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: [],

  addTask: (task) => {
    const id = crypto.randomUUID();
    set((s) => ({
      tasks: [
        ...s.tasks,
        { ...task, id, status: "pending", transferredBytes: 0, createdAt: Date.now() },
      ],
    }));
    return id;
  },

  updateTask: (id, updates) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    if (updates.status === "completed") {
      const existing = completedTimers.get(id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        completedTimers.delete(id);
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
        }));
      }, 3000);
      completedTimers.set(id, timer);
    }
  },

  retryTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || task.status !== "failed") return;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: "pending" as const, error: undefined, transferredBytes: 0 } : t
      ),
    }));

    // Re-execute the transfer asynchronously
    import("@/lib/transfer").then(({ retryTransferTask }) => {
      retryTransferTask(task);
    }).catch((e) => {
      logger.error("Failed to retry transfer:", e);
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: "failed" as const, error: String(e) } : t
        ),
      }));
    });
  },

  discardTask: (id) => {
    const timer = completedTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      completedTimers.delete(id);
    }
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
    }));
  },

  clearCompleted: () => {
    const { tasks } = get();
    for (const t of tasks) {
      if (t.status === "completed") {
        const timer = completedTimers.get(t.id);
        if (timer) {
          clearTimeout(timer);
          completedTimers.delete(t.id);
        }
      }
    }
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status !== "completed"),
    }));
  },
}));
