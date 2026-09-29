/**
 * Clipboard access, used by every copy/paste entry point so the mechanism and
 * the failure behaviour stay identical everywhere.
 *
 * This goes through `@tauri-apps/plugin-clipboard-manager` rather than
 * `navigator.clipboard`: the plugin is the one covered by the app's ACL, and it
 * reports a real error when access is denied. Note that the plugin's `default`
 * permission set is empty, so `clipboard-manager:allow-read-text` and
 * `clipboard-manager:allow-write-text` must both stay listed in
 * `src-tauri/capabilities/default.json` or every call is rejected.
 *
 * Failures are logged and surfaced as a toast - clipboard errors used to be
 * swallowed into the log file, which made a denied copy look like a dead menu
 * item.
 */
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createLogger } from "@/lib/logger";
import { useToastStore } from "@/stores/toast-store";

const logger = createLogger("clipboard");

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Copies text to the clipboard. Returns false and notifies the user on failure. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch (error) {
    logger.error("Failed to copy to clipboard:", error);
    useToastStore.getState().show(`Copy failed: ${describe(error)}`);
    return false;
  }
}

/** Reads the clipboard. Returns "" and notifies the user on failure. */
export async function readFromClipboard(): Promise<string> {
  try {
    return await readText();
  } catch (error) {
    logger.error("Failed to read clipboard:", error);
    useToastStore.getState().show(`Paste failed: ${describe(error)}`);
    return "";
  }
}
