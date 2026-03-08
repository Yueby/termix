import { createLogger } from "@/lib/logger";
import {
    deleteKeychainItem,
    getKeychainItems,
    saveKeychainItem,
    type KeychainItem,
} from "@/lib/tauri";
import { create } from "zustand";

export type { KeychainItem } from "@/lib/tauri";

const logger = createLogger("keychain-store");

export function isKeychainItemEmpty(item: KeychainItem): boolean {
  return !item.name.trim() && !item.privateKey.trim() && !item.publicKey.trim() && !item.certificate.trim();
}

interface KeychainState {
  items: KeychainItem[];
  loaded: boolean;
  loadItems: () => Promise<void>;
  addItem: (item: KeychainItem) => Promise<void>;
  updateItem: (id: string, partial: Partial<KeychainItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export const useKeychainStore = create<KeychainState>()((set, get) => ({
  items: [],
  loaded: false,

  loadItems: async () => {
    try {
      const items = await getKeychainItems();
      set({ items, loaded: true });
    } catch (e) {
      logger.warn("Failed to load keychain items:", e);
      set({ loaded: true });
    }
  },

  addItem: async (item) => {
    const prev = get().items;
    set({ items: [...prev, item] });
    try {
      await saveKeychainItem(item);
    } catch (e) {
      logger.warn("Failed to save keychain item, rolling back:", e);
      set({ items: prev });
    }
  },

  updateItem: async (id, partial) => {
    const prev = get().items;
    const existing = prev.find((i) => i.id === id);
    if (!existing) return;
    const updated = { ...existing, ...partial };
    set({ items: prev.map((i) => (i.id === id ? updated : i)) });
    try {
      await saveKeychainItem(updated);
    } catch (e) {
      logger.warn("Failed to update keychain item, rolling back:", e);
      set({ items: prev });
    }
  },

  removeItem: async (id) => {
    const prev = get().items;
    set({ items: prev.filter((i) => i.id !== id) });
    try {
      await deleteKeychainItem(id);
    } catch (e) {
      logger.warn("Failed to delete keychain item, rolling back:", e);
      set({ items: prev });
    }
  },
}));
