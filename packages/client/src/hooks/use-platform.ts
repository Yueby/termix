import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";

export type Platform = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";

let cachedPlatform: Platform | null = null;

function detectPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;
  try {
    const p = platform();
    if (p === "windows" || p === "macos" || p === "linux" || p === "android" || p === "ios") {
      cachedPlatform = p;
      return p;
    }
  } catch {
    // plugin not available, fall back
  }
  cachedPlatform = "unknown";
  return "unknown";
}

const DESKTOP_PLATFORMS: Platform[] = ["windows", "macos", "linux"];

export function usePlatform(): Platform {
  const [p, setP] = useState<Platform>(() => detectPlatform());
  useEffect(() => {
    setP(detectPlatform());
  }, []);
  return p;
}

export function usePlatformCapabilities() {
  const p = usePlatform();
  const isDesktop = DESKTOP_PLATFORMS.includes(p);
  const isAndroid = p === "android";
  const isIOS = p === "ios";

  return {
    platform: p,
    isDesktop,
    isAndroid,
    isIOS,
    supportsLocalTerminal: isDesktop || isAndroid,
    supportsSFTP: true,
  };
}
