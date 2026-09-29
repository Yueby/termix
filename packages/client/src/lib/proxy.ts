import type { ProxyConfig, ProxyMode } from "@/lib/tauri";

/**
 * Picks the mode a connection should use: its own, or the global default when it
 * has none. This only picks between modes - turning `system` into an actual
 * host:port happens in the backend, because the OS proxy is not readable here.
 */
export function resolveProxyMode(
  connectionMode: ProxyMode | null | undefined,
  globalMode: ProxyMode
): ProxyMode {
  return connectionMode ?? globalMode;
}

export function describeProxyConfig(proxy: ProxyConfig): string {
  const label = proxy.kind === "socks5" ? "SOCKS5" : "HTTP";
  return `${label} ${proxy.host}:${proxy.port}`;
}

/**
 * Label for a mode. `systemProxy` is what this machine's OS proxy resolves to, so
 * "System" can admit that nothing is configured instead of looking like it works.
 */
export function describeProxyMode(mode: ProxyMode, systemProxy: ProxyConfig | null): string {
  switch (mode.mode) {
    case "direct":
      return "Direct";
    case "system":
      return systemProxy
        ? `System (${describeProxyConfig(systemProxy)})`
        : "System (none configured)";
    case "custom": {
      const { mode: _mode, ...config } = mode;
      return describeProxyConfig(config);
    }
  }
}

/** Label for a connection's own setting, including the "follow global" case. */
export function describeConnectionProxy(
  connectionMode: ProxyMode | null | undefined,
  globalMode: ProxyMode,
  systemProxy: ProxyConfig | null
): string {
  if (connectionMode) return describeProxyMode(connectionMode, systemProxy);
  return `Follow global (${describeProxyMode(globalMode, systemProxy)})`;
}

/** A sensible starting point when the user picks "Custom". */
export function defaultCustomProxy(seed?: ProxyConfig | null): ProxyMode {
  return {
    mode: "custom",
    kind: seed?.kind ?? "socks5",
    host: seed?.host ?? "127.0.0.1",
    port: seed?.port ?? 7890,
    username: seed?.username ?? "",
    password: seed?.password ?? "",
  };
}
