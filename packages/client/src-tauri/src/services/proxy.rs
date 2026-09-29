//! Outbound proxy support for SSH and SFTP connections.
//!
//! russh dials the target itself, so a proxy cannot be configured through it: the
//! tunnel has to be built first and handed over as a stream. We connect to the
//! proxy, run the handshake, then pass the socket to `client::connect_stream`.
//!
//! SOCKS5 is handled by `tokio-socks` and HTTP CONNECT by `async-http-proxy`.
//! Both leave us owning the socket afterwards, so the direct, SOCKS5 and HTTP
//! paths all collapse into one boxed stream type.
//!
//! Callers pass a [`ProxyMode`] rather than a concrete proxy: `System` can only be
//! resolved here, on the machine that owns the setting.

use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;

/// How long the proxy handshake may take before the attempt is abandoned.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

/// Combines the bounds russh needs. A trait object cannot list two non-auto
/// traits directly (`dyn AsyncRead + AsyncWrite` is rejected), so they are
/// gathered behind this supertrait and boxed as one type instead.
pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T: AsyncRead + AsyncWrite + Unpin + Send> AsyncStream for T {}

/// A socket that is direct, SOCKS5-tunnelled or HTTP-CONNECT-tunnelled.
pub type ProxyStream = Box<dyn AsyncStream>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyKind {
    Socks5,
    Http,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub kind: ProxyKind,
    pub host: String,
    pub port: u16,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub username: String,
    /// Encrypted at rest; plaintext only in memory.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub password: String,
}

/// What a connection should do about proxies.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum ProxyMode {
    /// Never proxy.
    #[default]
    Direct,
    /// Use the proxy this operating system is configured with.
    System,
    /// Use this proxy.
    Custom(ProxyConfig),
}

/// Resolves a mode for one target host.
///
/// `System` consults the operating system and honours its bypass list, so LAN and
/// loopback addresses stay direct; `Custom` is taken at face value because the
/// user asked for it explicitly.
pub fn resolve(mode: &ProxyMode, target_host: &str) -> Option<ProxyConfig> {
    match mode {
        ProxyMode::Direct => None,
        ProxyMode::Custom(config) => Some(config.clone()),
        ProxyMode::System => {
            let system = system_proxy()?;
            if is_bypassed(target_host) {
                log::info!("System proxy skipped for {target_host}: listed as bypassed");
                return None;
            }
            Some(system)
        }
    }
}

/// Connects to `target_host:target_port`, tunnelling when `proxy` is set.
pub async fn connect(
    proxy: Option<&ProxyConfig>,
    target_host: &str,
    target_port: u16,
) -> Result<ProxyStream> {
    let Some(config) = proxy else {
        let stream = TcpStream::connect((target_host, target_port))
            .await
            .with_context(|| format!("Could not reach {target_host}:{target_port}"))?;
        return Ok(Box::new(stream));
    };

    match config.kind {
        ProxyKind::Socks5 => connect_socks5(config, target_host, target_port).await,
        ProxyKind::Http => connect_http(config, target_host, target_port).await,
    }
}

// ── System proxy ──

/// What this machine is configured to proxy through, if anything.
///
/// On Windows this reads the WinINET settings that desktop clients and the
/// "system proxy" toggle in Clash-style tools actually write. Environment
/// variables are deliberately not consulted there: `HTTP_PROXY` is a
/// command-line convention (curl, git) that a GUI client should not act on.
/// Other platforms have no equivalent registry, so they fall back to the
/// environment because that is the system mechanism there.
pub fn system_proxy() -> Option<ProxyConfig> {
    #[cfg(windows)]
    {
        windows_system_proxy()
    }
    #[cfg(not(windows))]
    {
        env_system_proxy()
    }
}

#[cfg(windows)]
fn windows_system_proxy() -> Option<ProxyConfig> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(KEY).ok()?;

    let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    let server: String = key.get_value("ProxyServer").unwrap_or_default();

    // A PAC script is the other way Windows configures proxying. Evaluating it
    // would mean running JavaScript, which we do not do - say so instead of
    // silently pretending there is no proxy.
    let pac: String = key.get_value("AutoConfigURL").unwrap_or_default();
    if !pac.trim().is_empty() {
        log::warn!(
            "System proxy uses a PAC script ({pac}); PAC is not supported, so the connection will be direct"
        );
    }

    if enabled == 0 || server.trim().is_empty() {
        return None;
    }
    parse_windows_proxy_server(&server)
}

/// Parses WinINET's `ProxyServer` value.
///
/// It is either a bare `host:port` used for everything, or a `proto=host:port`
/// list (`http=...;https=...;socks=...`). A SOCKS entry wins because it can carry
/// arbitrary TCP; otherwise the HTTP entry is used for CONNECT tunnelling.
fn parse_windows_proxy_server(server: &str) -> Option<ProxyConfig> {
    let mut http: Option<(String, u16)> = None;
    let mut socks: Option<(String, u16)> = None;

    for entry in server.split(';').map(str::trim).filter(|e| !e.is_empty()) {
        match entry.split_once('=') {
            Some((proto, addr)) => match proto.trim().to_ascii_lowercase().as_str() {
                "socks" | "socks5" => socks = socks.or_else(|| parse_host_port(addr)),
                "http" | "https" => http = http.or_else(|| parse_host_port(addr)),
                _ => {}
            },
            // No `proto=` prefix: applies to every protocol.
            None => http = http.or_else(|| parse_host_port(entry)),
        }
    }

    let kind = if socks.is_some() {
        ProxyKind::Socks5
    } else {
        ProxyKind::Http
    };
    let (host, port) = socks.or(http)?;
    Some(ProxyConfig {
        kind,
        host,
        port,
        username: String::new(),
        password: String::new(),
    })
}

fn parse_host_port(value: &str) -> Option<(String, u16)> {
    let value = value
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let (host, port) = value.rsplit_once(':')?;
    let port: u16 = port.trim().parse().ok()?;
    if host.trim().is_empty() || port == 0 {
        return None;
    }
    Some((host.trim().to_string(), port))
}

#[cfg(not(windows))]
fn env_system_proxy() -> Option<ProxyConfig> {
    let value = [
        "ALL_PROXY",
        "all_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ]
    .iter()
    .find_map(|name| std::env::var(name).ok())
    .filter(|v| !v.trim().is_empty())?;

    let kind = if value.starts_with("socks5://") || value.starts_with("socks://") {
        ProxyKind::Socks5
    } else {
        ProxyKind::Http
    };
    let (host, port) = parse_host_port(&value)?;
    Some(ProxyConfig {
        kind,
        host,
        port,
        username: String::new(),
        password: String::new(),
    })
}

/// True when the target appears in the system proxy's bypass list.
#[cfg(windows)]
fn is_bypassed(target_host: &str) -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(KEY) else {
        return false;
    };
    let overrides: String = key.get_value("ProxyOverride").unwrap_or_default();
    let entries: Vec<&str> = overrides
        .split(';')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .collect();
    matches_bypass(&entries, target_host)
}

#[cfg(not(windows))]
fn is_bypassed(target_host: &str) -> bool {
    let overrides = std::env::var("NO_PROXY")
        .or_else(|_| std::env::var("no_proxy"))
        .unwrap_or_default();
    let entries: Vec<&str> = overrides
        .split(',')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .collect();
    matches_bypass(&entries, target_host)
}

/// Wildcard match where every `*` is anchored where it sits.
///
/// The previous version trimmed the asterisks and asked whether the host merely
/// *contained* the remainder, so `*.internal` also bypassed
/// `db.internal.attacker.example` — traffic meant for the proxy went direct, which is a
/// disclosure rather than an inconvenience. A pattern without a leading `*` has to match
/// at the start, and one without a trailing `*` has to match at the end.
fn wildcard_match(pattern: &str, host: &str) -> bool {
    let leading = pattern.starts_with('*');
    let trailing = pattern.ends_with('*');
    let parts: Vec<&str> = pattern.split('*').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return true; // The pattern was just "*" or "**".
    }

    let mut rest = host;
    for (index, part) in parts.iter().enumerate() {
        if index == 0 && !leading {
            match rest.strip_prefix(part) {
                Some(stripped) => {
                    rest = stripped;
                    continue;
                }
                None => return false,
            }
        }
        if index == parts.len() - 1 && !trailing {
            return rest.ends_with(part);
        }
        match rest.find(part) {
            Some(position) => rest = &rest[position + part.len()..],
            None => return false,
        }
    }
    true
}

/// Wildcard matching for bypass entries: `*` spans anything, `<local>` means a
/// name without dots, and a bare entry matches the host and its subdomains.
fn matches_bypass(entries: &[&str], target_host: &str) -> bool {
    let host = target_host.trim().to_ascii_lowercase();

    for raw in entries {
        let entry = raw.trim().to_ascii_lowercase();
        if entry.is_empty() {
            continue;
        }
        if entry == "<local>" {
            if !host.contains('.') && host != "::1" && host != "localhost" {
                return true;
            }
            continue;
        }

        let pattern = entry
            .split_once(':')
            .map(|(h, p)| {
                if p.chars().all(|c| c.is_ascii_digit()) {
                    h
                } else {
                    entry.as_str()
                }
            })
            .unwrap_or(entry.as_str());

        if pattern.contains('*') {
            if wildcard_match(pattern, &host) {
                return true;
            }
        } else if host == pattern || host.ends_with(&format!(".{pattern}")) {
            return true;
        }
    }
    false
}

// ── Tunnels ──

async fn connect_socks5(
    proxy: &ProxyConfig,
    target_host: &str,
    target_port: u16,
) -> Result<ProxyStream> {
    use tokio_socks::tcp::Socks5Stream;

    let via = format!("{}:{}", proxy.host, proxy.port);
    let target = format!("{target_host}:{target_port}");
    let attempt = async {
        if proxy.username.is_empty() {
            Socks5Stream::connect(via.as_str(), target.as_str()).await
        } else {
            Socks5Stream::connect_with_password(
                via.as_str(),
                target.as_str(),
                &proxy.username,
                &proxy.password,
            )
            .await
        }
    };

    let stream = tokio::time::timeout(HANDSHAKE_TIMEOUT, attempt)
        .await
        .map_err(|_| anyhow::anyhow!("SOCKS5 handshake with {via} timed out"))?
        .with_context(|| format!("SOCKS5 proxy {via} could not tunnel to {target}"))?;

    log::info!("Connected to {target} through SOCKS5 proxy {via}");
    Ok(Box::new(stream))
}

async fn connect_http(
    proxy: &ProxyConfig,
    target_host: &str,
    target_port: u16,
) -> Result<ProxyStream> {
    use async_http_proxy::{http_connect_tokio, http_connect_tokio_with_basic_auth};

    let via = format!("{}:{}", proxy.host, proxy.port);
    let mut stream = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        TcpStream::connect((proxy.host.as_str(), proxy.port)),
    )
    .await
    .map_err(|_| anyhow::anyhow!("Connecting to HTTP proxy {via} timed out"))?
    .with_context(|| format!("Could not reach HTTP proxy {via}"))?;

    let attempt = async {
        if proxy.username.is_empty() {
            http_connect_tokio(&mut stream, target_host, target_port).await
        } else {
            http_connect_tokio_with_basic_auth(
                &mut stream,
                target_host,
                target_port,
                &proxy.username,
                &proxy.password,
            )
            .await
        }
    };

    tokio::time::timeout(HANDSHAKE_TIMEOUT, attempt)
        .await
        .map_err(|_| anyhow::anyhow!("HTTP CONNECT handshake with {via} timed out"))?
        .with_context(|| {
            format!("HTTP proxy {via} could not tunnel to {target_host}:{target_port}")
        })?;

    log::info!("Connected to {target_host}:{target_port} through HTTP proxy {via}");
    Ok(Box::new(stream))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bare_host_port() {
        let parsed = parse_windows_proxy_server("127.0.0.1:7890").unwrap();
        assert_eq!(parsed.host, "127.0.0.1");
        assert_eq!(parsed.port, 7890);
        assert_eq!(parsed.kind, ProxyKind::Http);
    }

    #[test]
    fn prefers_socks_entry_over_http() {
        let parsed = parse_windows_proxy_server("http=10.0.0.1:3128;socks=127.0.0.1:1080").unwrap();
        assert_eq!(parsed.kind, ProxyKind::Socks5);
        assert_eq!(parsed.host, "127.0.0.1");
        assert_eq!(parsed.port, 1080);
    }

    #[test]
    fn rejects_junk() {
        assert!(parse_windows_proxy_server("").is_none());
        assert!(parse_windows_proxy_server("nonsense").is_none());
        assert!(parse_windows_proxy_server("host:").is_none());
    }

    #[test]
    fn bypass_matches_wildcards_subdomains_and_local() {
        let entries = ["localhost", "127.*", "192.168.*", "*.internal", "<local>"];
        assert!(matches_bypass(&entries, "localhost"));
        assert!(matches_bypass(&entries, "127.0.0.1"));
        assert!(matches_bypass(&entries, "192.168.31.215"));
        assert!(matches_bypass(&entries, "db.internal"));
        assert!(matches_bypass(&entries, "intranet"));
        assert!(!matches_bypass(&entries, "216.23.83.151"));
        assert!(!matches_bypass(&entries, "example.com"));

        // The wildcard is anchored where it sits rather than matching a substring
        // anywhere in the host. Without that, `*.internal` also bypassed
        // `db.internal.attacker.example` and `192.168.*` also bypassed
        // `x192.168.31.215` — traffic meant for the proxy went direct instead.
        assert!(!matches_bypass(&entries, "db.internal.attacker.example"));
        assert!(!matches_bypass(&entries, "x192.168.31.215"));
        // `<local>` matches any name without a dot, so this set cannot be used to ask
        // whether `*.internal` matches a bare `internal`.
        assert!(matches_bypass(&entries, "internal"));
        // `*.internal` needs at least one label in front of the dot.
        assert!(!matches_bypass(&["*.internal"], "internal"));

        // A wildcard in the middle is still a wildcard, and a bare one matches anything.
        assert!(matches_bypass(&["*mple*"], "example.com"));
        assert!(!matches_bypass(&["mple*"], "example.com"));
        assert!(matches_bypass(&["*"], "anything.example"));
    }

    /// End-to-end check of both tunnel kinds against a proxy that has to be
    /// running on this machine. Ignored by default because not every environment
    /// has one; run it with `cargo test --lib proxy -- --include-ignored`.
    ///
    /// A hostname target is used on purpose: it exercises the remote-DNS path,
    /// where the proxy resolves the name rather than us.
    #[tokio::test]
    #[ignore = "needs a local SOCKS5/HTTP proxy on 127.0.0.1:7890"]
    async fn both_tunnel_kinds_reach_a_live_ssh_banner() {
        use tokio::io::AsyncReadExt;

        async fn banner(kind: ProxyKind) -> String {
            let config = ProxyConfig {
                kind,
                host: "127.0.0.1".to_string(),
                port: 7890,
                username: String::new(),
                password: String::new(),
            };
            let mut stream = connect(Some(&config), "github.com", 22)
                .await
                .unwrap_or_else(|e| panic!("{kind:?} tunnel failed: {e}"));

            let mut buf = [0u8; 64];
            let read = tokio::time::timeout(Duration::from_secs(15), stream.read(&mut buf));
            let n = read
                .await
                .expect("timed out waiting for the banner")
                .expect("read failed");
            String::from_utf8_lossy(&buf[..n]).into_owned()
        }

        for kind in [ProxyKind::Socks5, ProxyKind::Http] {
            let banner = banner(kind).await;
            println!("{kind:?} -> {}", banner.trim());
            assert!(
                banner.starts_with("SSH-2.0-"),
                "{kind:?} did not reach an SSH server, got: {banner:?}"
            );
        }
    }
}
