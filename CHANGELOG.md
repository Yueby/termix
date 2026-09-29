# Changelog

Notable changes to Termix, grouped by release.
## [0.1.0] - 2026-09-29

### Features

- Implement Termix SSH client with full UI and connection management
- Migrate data storage to SQLite + add WebDAV sync + settings UI overhaul
- 实现 SFTP 文件管理、Keychain 密钥管理及全项目代码审查修复
- Keychain 增强、host 分组、加密存储重构、SFTP 隐藏文件
- Terminal logs, tab bar theme colors, about dialog, app icon, docs
- Proxy support, automatic reconnect and reliable disconnect reporting


### Maintenance

- Remove root src/ and src-tauri/ residuals after monorepo migration
- Add CI, rebuild the release pipeline and generate the changelog from commits
- Name the updater manifest input correctly and quiet dependabot


### Other

- Initial commit
- Remake and clear file
- Merge pull request #1 from Yueby/feat/implement-ssh-client

feat: implement Termix SSH client with full UI and connection management
- Update .gitignore
- Merge pull request #2 from Yueby/feat/data-storage-webdav-sync

feat: migrate data storage to SQLite + add WebDAV sync + settings UI overhaul
- Merge pull request #3 from Yueby/feat/sftp-keychain-code-review

feat: 实现 SFTP 文件管理、Keychain 密钥管理及全项目代码审查修复
- Merge pull request #4 from Yueby/feat/keychain-host-group-sftp

feat: keychain 增强、host 分组、加密存储重构、SFTP 隐藏文件
- Merge pull request #5 from Yueby/feat/logs-ui-polish-docs

feat: terminal logs, tab bar theme colors, about dialog, app icon, docs
- Merge pull request #6 from Yueby/refactor/monorepo-structure

refactor: restructure project as monorepo with client/server packages
- Merge pull request #7 from Yueby/chore/cleanup-root-residuals

chore: remove root src/ and src-tauri/ residuals after monorepo migration


### Refactoring

- Restructure project as monorepo with client/server packages


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
