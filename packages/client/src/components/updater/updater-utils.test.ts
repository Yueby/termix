import { describe, expect, it } from "vitest";
import { formatDownloadProgress, getUpdateErrorDetails } from "./updater-utils";

describe("formatDownloadProgress", () => {
  const MB = 1024 * 1024;
  const KB = 1024;

  describe("known total (total > 0)", () => {
    it("formats 0% at start of download with known MB total", () => {
      const res = formatDownloadProgress(0, 10.5 * MB);
      expect(res.percent).toBe(0);
      expect(res.text).toBe("0.0 / 10.5 MB (0%)");
    });

    it("formats mid-download with known MB total", () => {
      const res = formatDownloadProgress(4.2 * MB, 10.5 * MB);
      expect(res.percent).toBe(40);
      expect(res.text).toBe("4.2 / 10.5 MB (40%)");
    });

    it("formats 100% completion with known MB total", () => {
      const res = formatDownloadProgress(10.5 * MB, 10.5 * MB);
      expect(res.percent).toBe(100);
      expect(res.text).toBe("10.5 / 10.5 MB (100%)");
    });

    it("formats small packages in KB with accurate percentage", () => {
      const res = formatDownloadProgress(225 * KB, 450 * KB);
      expect(res.percent).toBe(50);
      expect(res.text).toBe("225 / 450 KB (50%)");
    });

    it("clamps percentages between 0 and 100", () => {
      expect(formatDownloadProgress(-100, 10 * MB).percent).toBe(0);
      expect(formatDownloadProgress(15 * MB, 10 * MB).percent).toBe(100);
    });
  });

  describe("unknown total (total <= 0)", () => {
    it("reads 'Starting download...' when 0 bytes received", () => {
      const res = formatDownloadProgress(0, 0);
      expect(res.percent).toBeNull();
      expect(res.text).toBe("Starting download...");
    });

    it("formats bytes accumulated in MB when total is unknown", () => {
      const res = formatDownloadProgress(4.2 * MB, 0);
      expect(res.percent).toBeNull();
      expect(res.text).toBe("4.2 MB downloaded");
    });

    it("formats bytes accumulated in KB when total is unknown", () => {
      const res = formatDownloadProgress(350 * KB, 0);
      expect(res.percent).toBeNull();
      expect(res.text).toBe("350 KB downloaded");
    });

    it("formats raw bytes under 1 KB when total is unknown", () => {
      const res = formatDownloadProgress(512, 0);
      expect(res.percent).toBeNull();
      expect(res.text).toBe("512 B downloaded");
    });
  });
});

describe("getUpdateErrorDetails", () => {
  it("provides distinct copy for check failure", () => {
    const details = getUpdateErrorDetails("check");
    expect(details.title).toBe("Update Check Failed");
    expect(details.description).toContain("Unable to check for updates");
    expect(details.canRetry).toBe(true);
    expect(details.retryAction).toBe("check");
  });

  it("provides distinct copy for download failure", () => {
    const details = getUpdateErrorDetails("download");
    expect(details.title).toBe("Update Download Failed");
    expect(details.description).toContain("could not be downloaded completely");
    expect(details.description).toContain("current installation was not modified");
    expect(details.canRetry).toBe(true);
    expect(details.retryAction).toBe("download");
  });

  it("provides distinct copy for install failure", () => {
    const details = getUpdateErrorDetails("install");
    expect(details.title).toBe("Update Installation Failed");
    expect(details.description).toContain("could not be applied");
    expect(details.description).toContain("continue running on your current version");
    expect(details.canRetry).toBe(false);
    expect(details.retryAction).toBeNull();
  });

  it("defaults safely if kind is null or unknown", () => {
    const details = getUpdateErrorDetails(null);
    expect(details.title).toBe("Update Check Failed");
  });
});
