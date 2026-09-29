# Changelog

Notable changes to Termix, grouped by release.

## [Unreleased]

### Features

- **Proxy support** for SSH and SFTP: SOCKS5 and HTTP CONNECT, configured globally
  with a per-connection override. A "System proxy" mode reads the operating system's
  own proxy settings (the WinINET registry on Windows) and honours its bypass list.
- **Automatic reconnect** for SSH sessions that drop unexpectedly, with a growing
  delay between attempts and a visible countdown. Local terminals are never retried.
- **Disconnect reasons** now come from the transport layer rather than a fixed
  string, and every session end is logged with its cause.
- **Session output** travels over a per-session channel as raw bytes, replacing the
  event-and-base64 path that expanded payloads by roughly 3.5x.

### Bug Fixes

- **Keychain:** OpenSSH private keys are identified from their actual material, so
  ed25519 keys are no longer labelled ECDSA. PKCS#8, legacy PEM and `.ppk` files are
  recognised too.
- **Clipboard:** copying from the terminal was rejected by an incomplete permission
  set. Clipboard access now goes through one code path, and failures reach the user
  instead of being written only to the log.
- **Keychain:** imported keys record the type detected at import time; the previous
  detector always returned the same value.

### Maintenance

- **Dependencies (Rust):** `russh` 0.46 → 0.63, `russh-sftp` 3, `aes-gcm` 0.11,
  `argon2` 0.6, `base64` 0.23, `dirs` 7, `winreg` 0.56. The `russh-keys` and
  `ssh-key` dependencies are gone: `russh` now bundles keys, and taking its
  re-export keeps the key types from drifting.
- **Dependencies (frontend):** `vite` 8, `react` 19.3, `tailwindcss` 4.3,
  `lucide-react` 1.48, `@types/node` 26.
- **Toolchain:** pnpm 11 is pinned through `packageManager`, and dependency build
  scripts are allow-listed in `pnpm-workspace.yaml` — the previous
  `onlyBuiltDependencies` field in `package.json` is no longer read by pnpm, which
  had silently skipped every native build.
- **CI:** new `ci.yml` with typecheck, build and test for both packages plus an
  advisory Rust lint job; `release.yml` now builds Windows, macOS (both
  architectures) and Linux, and drops the Android job, which contradicted the
  supported platforms.
- **Releases:** updater artifacts are signed with a dedicated key, and release notes
  come from git-cliff.
