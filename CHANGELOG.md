# Changelog

Notable changes to Termix, grouped by release.

<!-- git-cliff: end of header -->

## [0.1.0] - 2026-09-29

First release: an SSH and SFTP terminal client for Windows, macOS and Linux.

### Features

- Implement Termix SSH client with full UI and connection management
- Migrate data storage to SQLite + add WebDAV sync + settings UI overhaul
- 实现 SFTP 文件管理、Keychain 密钥管理及全项目代码审查修复
- Keychain 增强、host 分组、加密存储重构、SFTP 隐藏文件
- Terminal logs, tab bar theme colors, about dialog, app icon, docs
- Proxy support, automatic reconnect and reliable disconnect reporting

### Maintenance

- Restructure project as monorepo with client/server packages
- Remove root src/ and src-tauri/ residuals after monorepo migration
- Add CI, rebuild the release pipeline and generate the changelog from commits
- Name the updater manifest input correctly and quiet dependabot

### Other

- Initial commit
- Remake and clear file
- Update .gitignore
