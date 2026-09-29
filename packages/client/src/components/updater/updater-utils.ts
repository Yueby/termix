export type UpdateErrorKind = "check" | "download" | "install" | null;

export interface ProgressInfo {
  text: string;
  percent: number | null;
}

export interface UpdateErrorDetails {
  title: string;
  description: string;
  canRetry: boolean;
  retryAction: "check" | "download" | null;
}

/**
 * Formats downloaded and total bytes into readable, non-shouty text.
 *
 * Cases:
 * 1. Known total (total > 0):
 *    - >= 1 MB: "0.0 / 10.5 MB (0%)", "4.2 / 10.5 MB (40%)"
 *    - < 1 MB:  "0 / 450 KB (0%)", "225 / 450 KB (50%)"
 * 2. Unknown total (total === 0, e.g. chunked/omitted Content-Length):
 *    - >= 1 MB: "4.2 MB downloaded"
 *    - >= 1 KB: "450 KB downloaded"
 *    - > 0 B:   "128 B downloaded"
 *    - 0 B:     "Starting download..."
 */
export function formatDownloadProgress(downloaded: number, total: number): ProgressInfo {
  const safeDownloaded = Math.max(0, downloaded);
  const safeTotal = Math.max(0, total);

  if (safeTotal > 0) {
    const percent = Math.min(100, Math.max(0, Math.round((safeDownloaded / safeTotal) * 100)));

    if (safeTotal >= 1024 * 1024) {
      const downMb = (safeDownloaded / (1024 * 1024)).toFixed(1);
      const totalMb = (safeTotal / (1024 * 1024)).toFixed(1);
      return {
        text: `${downMb} / ${totalMb} MB (${percent}%)`,
        percent,
      };
    }

    if (safeTotal >= 1024) {
      const downKb = Math.round(safeDownloaded / 1024);
      const totalKb = Math.round(safeTotal / 1024);
      return {
        text: `${downKb} / ${totalKb} KB (${percent}%)`,
        percent,
      };
    }

    return {
      text: `${safeDownloaded} / ${safeTotal} B (${percent}%)`,
      percent,
    };
  }

  // Unknown total: present bytes accumulated honestly without fake percentages
  if (safeDownloaded >= 1024 * 1024) {
    return {
      text: `${(safeDownloaded / (1024 * 1024)).toFixed(1)} MB downloaded`,
      percent: null,
    };
  }

  if (safeDownloaded >= 1024) {
    return {
      text: `${Math.round(safeDownloaded / 1024)} KB downloaded`,
      percent: null,
    };
  }

  if (safeDownloaded > 0) {
    return {
      text: `${safeDownloaded} B downloaded`,
      percent: null,
    };
  }

  return {
    text: "Starting download...",
    percent: null,
  };
}

/**
 * Returns distinct, empathetic copy for each updater failure kind.
 * Separates checking failures, download failures, and installation failures so
 * the title and description accurately reflect what went wrong.
 */
export function getUpdateErrorDetails(kind: UpdateErrorKind): UpdateErrorDetails {
  switch (kind) {
    case "download":
      return {
        title: "Update Download Failed",
        description:
          "The update package could not be downloaded completely. Your current installation was not modified.",
        canRetry: true,
        retryAction: "download",
      };
    case "install":
      return {
        title: "Update Installation Failed",
        description:
          "The update was downloaded but could not be applied. Termix will continue running on your current version.",
        canRetry: false,
        retryAction: null,
      };
    case "check":
    default:
      return {
        title: "Update Check Failed",
        description:
          "Unable to check for updates right now. Please verify your network connection or try again later.",
        canRetry: true,
        retryAction: "check",
      };
  }
}
