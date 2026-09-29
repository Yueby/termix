import { createLogger } from "@/lib/logger";
import { onVaultChanged } from "@/lib/auto-sync-signal";
import { syncPull, syncPush } from "@/lib/tauri";
import { useConnectionStore } from "@/stores/connection-store";
import { useKeychainStore } from "@/stores/keychain-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSnippetStore } from "@/stores/snippet-store";

const logger = createLogger("auto-sync");

/**
 * How long to wait after the last change before pushing. Long enough that a burst of edits —
 * renaming three hosts, deleting a folder of snippets — becomes one push rather than ten.
 */
const DEBOUNCE_MS = 4000;

/**
 * Backoff between attempts after a push fails.
 *
 * A push that never succeeds is the one way this machine ends up holding changes the remote
 * has not seen — and an unpushed change is exactly what the next pull replaces. Retrying is
 * what keeps the common case ("only one side changed") the common case.
 */
const RETRY_MS = [15_000, 60_000, 300_000];

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let changedWhileInFlight = false;
let failedAttempts = 0;

function scheduleIn(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void push(), ms);
}

function enabled(): boolean {
  return useSettingsStore.getState().syncBackend !== "none";
}

/**
 * Reloads what a pull just changed.
 *
 * A pull writes straight to the database in Rust, so nothing in the frontend saw those writes
 * — the lists would keep showing the state from before until something else refreshed them.
 */
async function reloadLocal() {
  await Promise.all([
    useConnectionStore.getState().loadConnections(),
    useSnippetStore.getState().loadSnippets(),
    useKeychainStore.getState().loadItems(),
  ]);
}

async function push() {
  if (inFlight) {
    changedWhileInFlight = true;
    return;
  }

  inFlight = true;
  try {
    const message = await syncPush();
    logger.info("push: " + message);
    failedAttempts = 0;
    // A push that found the remote ahead pulls instead, which rewrites the database from
    // outside the frontend. Reloading unconditionally is cheaper than trying to tell those
    // two outcomes apart from the message, and it costs one read of a vault measured in
    // kilobytes.
    await reloadLocal();
  } catch (error) {
    // Not raised as a toast. This runs unprompted, and a failure here is usually a network
    // that will answer shortly. The manual Push button is where a person asks and therefore
    // where a failure belongs on screen.
    logger.warn("push failed:", error);
    const delay = RETRY_MS[Math.min(failedAttempts, RETRY_MS.length - 1)];
    failedAttempts += 1;
    inFlight = false;
    scheduleIn(delay);
    return;
  }

  inFlight = false;
  if (changedWhileInFlight) {
    changedWhileInFlight = false;
    schedule();
  }
}

/** Queues a push for after the current burst of edits. */
function schedule() {
  if (!enabled()) return;
  scheduleIn(DEBOUNCE_MS);
}

/**
 * Starts reacting to local changes. Called once, from the app shell.
 *
 * The signal is raised by the invoke wrappers rather than by each store, so a write added
 * later is covered without anyone having to remember it exists.
 */
export function startAutoSync() {
  onVaultChanged(schedule);
}

/**
 * Brings the remote's version down once at startup.
 *
 * This is the half that makes "open the app on the other machine and the hosts are there"
 * work. The other half is the push scheduled after an edit.
 */
export async function pullAtStartup() {
  if (!enabled()) return;

  try {
    const message = await syncPull();
    logger.info("pull: " + message);
    await reloadLocal();
  } catch (error) {
    logger.warn("startup pull failed:", error);
  }
}
