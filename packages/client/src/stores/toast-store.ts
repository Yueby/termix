import { create } from "zustand";

export type ToastVariant = "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const DISMISS_AFTER_MS = 5000;

interface ToastState {
  toasts: Toast[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

/**
 * Transient user-facing messages. Failures that would otherwise only reach the
 * log file (ACL rejections, IPC errors) are surfaced here instead of being
 * silently swallowed.
 */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: (message, variant = "error") => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => get().dismiss(id), DISMISS_AFTER_MS);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
