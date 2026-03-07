/**
 * Centralized frontend logger — mirrors the backend logger.rs configuration.
 *
 * All logs flow through `@tauri-apps/plugin-log` to the unified Tauri logging pipeline:
 *   - Stdout (terminal)
 *   - LogDir (persistent file)
 *   - Webview (browser DevTools console)
 *
 * Backend format:  [YYYY-MM-DD][HH:MM:SS][rust_module][LEVEL] message
 * Frontend format: [YYYY-MM-DD][HH:MM:SS][webview][LEVEL] [module] message
 *
 * Usage:
 *   import { createLogger } from "@/lib/logger";
 *   const logger = createLogger("sftp");
 *   logger.info("Connected to", host);
 *   logger.error("Transfer failed:", err);
 */
import {
    debug as tauriDebug,
    error as tauriError,
    info as tauriInfo,
    trace as tauriTrace,
    warn as tauriWarn,
} from "@tauri-apps/plugin-log";

type LogFn = (message: string, ...args: unknown[]) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
}

function stringify(a: unknown): string {
  if (typeof a === "string") return a;
  if (a instanceof Error) return a.message;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function formatMessage(module: string, message: string, args: unknown[]): string {
  const suffix = args.length > 0 ? " " + args.map(stringify).join(" ") : "";
  return `[${module}] ${message}${suffix}`;
}

/**
 * Creates a scoped logger with the given module name.
 * All log calls will be prefixed with `[module]`.
 */
export function createLogger(module: string): Logger {
  return {
    error(message, ...args) {
      tauriError(formatMessage(module, message, args));
    },
    warn(message, ...args) {
      tauriWarn(formatMessage(module, message, args));
    },
    info(message, ...args) {
      tauriInfo(formatMessage(module, message, args));
    },
    debug(message, ...args) {
      tauriDebug(formatMessage(module, message, args));
    },
    trace(message, ...args) {
      tauriTrace(formatMessage(module, message, args));
    },
  };
}

/** Default app-level logger. */
export const log = createLogger("app");
