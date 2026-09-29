import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createLogger } from "@/lib/logger";
import { useToastStore } from "@/stores/toast-store";
import { create } from "zustand";

const logger = createLogger("updater");

export type UpdateErrorKind = "check" | "download" | "install" | null;

export interface UpdateCheckOptions {
  /**
   * Whether the check was explicitly requested by a user clicking a button.
   * Explicit checks show feedback on up-to-date (toast) and surface check errors.
   * Background automatic checks (e.g. on launch) stay silent when up to date or offline.
   * Defaults to true if called without arguments.
   */
  explicit?: boolean;
}

interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "installing" | "error" | "up-to-date";
  update: Update | null;
  progress: { downloaded: number; total: number } | null;
  error: string | null;
  errorKind: UpdateErrorKind;
  checkForUpdate: (options?: UpdateCheckOptions | boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  update: null,
  progress: null,
  error: null,
  errorKind: null,

  checkForUpdate: async (options?: UpdateCheckOptions | boolean) => {
    const explicit = typeof options === "boolean" ? options : (options?.explicit ?? true);
    const { status } = get();
    if (status === "checking" || status === "downloading" || status === "installing") return;

    set({ status: "checking", error: null, errorKind: null });
    try {
      const result = await check();
      if (result) {
        logger.info(`Update available: ${result.version}`);
        set({ status: "available", update: result, error: null, errorKind: null });
      } else {
        logger.info("No update available");
        set({ status: "up-to-date", update: null, error: null, errorKind: null });
        if (explicit) {
          useToastStore.getState().show("Termix is up to date.", "info");
        }
        // Return button state to idle after a few seconds so user can re-check later
        setTimeout(() => {
          if (get().status === "up-to-date") {
            set({ status: "idle" });
          }
        }, 4000);
      }
    } catch (e) {
      const msg = String(e);
      logger.warn("Update check failed:", msg);
      if (explicit) {
        set({ status: "error", error: msg, errorKind: "check" });
      } else {
        // Automatic background check at launch stays silent so offline/flaky network
        // does not disrupt an active terminal session with an unwanted modal.
        set({ status: "idle", error: null, errorKind: null });
      }
    }
  },

  downloadAndInstall: async () => {
    const { update } = get();
    if (!update) return;

    set({ status: "downloading", progress: { downloaded: 0, total: 0 }, error: null, errorKind: null });
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
      const isInstalling = get().status === "installing";
      const errorKind: UpdateErrorKind = isInstalling ? "install" : "download";
      logger.warn(`Update ${errorKind} failed:`, msg);
      set({ status: "error", error: msg, errorKind });
    }
  },

  dismiss: () => {
    set({ status: "idle", update: null, progress: null, error: null, errorKind: null });
  },
}));
