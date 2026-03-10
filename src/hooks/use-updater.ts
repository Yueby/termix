import { createLogger } from "@/lib/logger";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

const logger = createLogger("updater");

interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "installing" | "error" | "up-to-date";
  update: Update | null;
  progress: { downloaded: number; total: number } | null;
  error: string | null;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  update: null,
  progress: null,
  error: null,

  checkForUpdate: async () => {
    const { status } = get();
    if (status === "checking" || status === "downloading" || status === "installing") return;

    set({ status: "checking", error: null });
    try {
      const result = await check();
      if (result) {
        logger.info(`Update available: ${result.version}`);
        set({ status: "available", update: result });
      } else {
        logger.info("No update available");
        set({ status: "up-to-date", update: null });
      }
    } catch (e) {
      const msg = String(e);
      logger.warn("Update check failed:", msg);
      set({ status: "error", error: msg });
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;

    set({ status: "downloading", progress: { downloaded: 0, total: 0 } });
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            set({ progress: { downloaded: 0, total: event.data.contentLength ?? 0 } });
            break;
          case "Progress": {
            const prev = get().progress;
            const downloaded = (prev?.downloaded ?? 0) + event.data.chunkLength;
            set({ progress: { downloaded, total: prev?.total ?? 0 } });
            break;
          }
          case "Finished":
            set({ status: "installing" });
            break;
        }
      });
      logger.info("Update installed, relaunching...");
      await relaunch();
    } catch (e) {
      const msg = String(e);
      logger.warn("Update install failed:", msg);
      set({ status: "error", error: msg });
    }
  },

  dismiss: () => {
    set({ status: "idle", update: null, progress: null, error: null });
  },
}));
