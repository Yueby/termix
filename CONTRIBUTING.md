# Contributing to Termix

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node | 24 | `vite` 8 needs ≥ 22.12 |
| pnpm | 11 | Pinned through `packageManager`; `corepack enable` makes it automatic |
| Rust | stable | `rustfmt` and `clippy` are expected (`rust-toolchain.toml`) |
| Platform deps | — | See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |

On Linux the Rust build links against `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`,
`librsvg2-dev`, `patchelf` and `libgtk-3-dev` — the same list CI installs.

## Layout

```
packages/client        the Tauri app — React + Tailwind UI in src/, Rust in src-tauri/
packages/server        optional cloud-sync backend (Hono + Drizzle); not needed to run the app
```

## Getting started

```bash
pnpm install
pnpm tauri dev          # full desktop app (compiles Rust)
pnpm dev                # frontend only, on http://localhost:1420
```

## Verifying a change

Run these before opening a pull request — they are exactly what CI runs:

```bash
# Frontend types and bundle
pnpm --filter @termix/client build

# Rust
cargo check --manifest-path packages/client/src-tauri/Cargo.toml --all-targets
cargo test  --manifest-path packages/client/src-tauri/Cargo.toml --lib

# Server (advisory in CI — see below)
pnpm --filter @termix/server exec tsc --noEmit
```

Some Rust tests reach the network and are `#[ignore]`d so a normal run stays
hermetic. Run them when you touch the proxy or SSH code and a proxy is available:

```bash
cargo test --manifest-path packages/client/src-tauri/Cargo.toml --lib -- --include-ignored
```

### Known debt

- `cargo fmt --check` and `cargo clippy` do not pass yet. Their CI job is advisory
  so the debt is visible without blocking work; formatting the tree is welcome as a
  standalone pull request.
- `packages/server` does not typecheck. It never did — its `tsconfig.json` asked for
  `node` types without declaring them, so nothing was ever checked. Adding the types
  revealed the errors; deciding how the package should type itself for **both** Node
  and Cloudflare Workers is the open question.

## Commits and changelog

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`.

`.github/cliff.toml` turns those into two things: the GitHub release body, and a new
section in `CHANGELOG.md`.

- **Nothing needs writing by hand for a release.** The `changelog` job in
  `release.yml` generates the section for the tag and prepends it.
- **`## [Unreleased]` is only for work that is not committed yet.** Once it lands in a
  commit, git-cliff can see it and the hand-written entry is redundant — fold it into
  the release section and delete it.
- **Keep the header in sync.** `header` in `cliff.toml` must match the opening block of
  `CHANGELOG.md` byte for byte; that is the anchor git-cliff uses to know where a new
  section belongs. The release-notes step passes `--strip header`, so the header never
  leaks into a release body.

## Releasing

### One-time setup

The updater signs its artifacts, and `bundle.createUpdaterArtifacts` is enabled, so a
release fails without the key. The keypair was generated with:

```bash
pnpm --filter @termix/client tauri signer generate -w ~/.tauri/termix.key
```

The **public** half is committed in `packages/client/src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`). The **private** half must be added as a repository secret:

```bash
# bash / zsh — run from the repository root
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/termix.key
```

```powershell
# PowerShell — `cmd /c` because PowerShell has no `<` input redirection.
# `cd /d` first: gh infers the repository from the current directory's .git,
# and fails with "failed to run git: not a git repository" without one.
cmd /c "cd /d <path-to-this-repo> && gh secret set TAURI_SIGNING_PRIVATE_KEY < %USERPROFILE%\.tauri\termix.key"
```

`gh` resolves the repository from the working directory; add `-R <owner>/<repo>` if you
would rather not change directory. Note that the `-R` form needs the key as a value
(`--body`), which means it lands in your shell history — prefer the redirection above.

> **The secret must be the file's exact bytes — no trailing newline.** Tauri does not
trim it, and a stray `\n` fails the build with
> `failed to decode base64 key: Invalid symbol 10`. This rules out the usual PowerShell
> idiom `Get-Content file | gh secret set NAME`, because piping appends a newline.
> `--body (Get-Content -Raw ...)` or the two commands above are safe; pasting into the
> GitHub UI is fine as long as no trailing blank line comes with it.

The key was generated with an empty password, so
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can stay unset. If you would rather have one,
regenerate with `-p`, set both secrets, and remember that the password is then needed
for every future release.

### Building a release locally

If any of these is set in your shell environment, the Tauri CLI prefers it over any
flag, and a local build will sign with the wrong key — producing updater artifacts that
no installed client will accept:

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PATH
```

`TAURI_SIGNING_PRIVATE_KEY_PATH` in particular is easy to set once for one project and
forget, because it is a user-level environment variable. Check with:

```powershell
[Environment]::GetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY_PATH', 'User')
```

CI is unaffected — the workflow sets only `TAURI_SIGNING_PRIVATE_KEY`, from a secret.

> **Keep `~/.tauri/termix.key` safe and backed up.** It is the only thing that can
> sign updates for installed clients. Losing it means shipping clients that can never
> receive an update again.

### Cutting a release

1. **Bump the version** in all four places so they agree:
   - `packages/client/src-tauri/tauri.conf.json` (`version`)
   - `packages/client/src-tauri/Cargo.toml` (`version`)
   - `packages/client/package.json` (`version`)
   - `packages/server/package.json` (`version`)
2. **Tag and push:**
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. **CI builds** Windows, macOS (Apple Silicon and Intel) and Linux in parallel, signs
   the updater artifacts, and creates a **draft** release containing the bundles plus
   `latest.json`.
4. **Review the draft**, edit the notes if needed, then **publish it.**
### Why the publish step matters

The updater endpoint is:

```
https://github.com/Yueby/termix/releases/latest/download/latest.json
```

GitHub's `/releases/latest` deliberately **excludes drafts and prereleases**. So while
the release sits as a draft, no installed client can see it — which is the point: it
gives you a window to check the build before anyone is offered it. The update reaches
users the moment you publish.

The `changelog` job then prepends the new section to `CHANGELOG.md` and commits it to
`main` with `[skip ci]`. If `main` is protected, allow the bot to push or move that
step into a follow-up pull request.

## Platform support

Windows, macOS and Linux are supported and built by CI. Android is **not** supported:
the client depends on `portable-pty`, `sqlx` and `russh`, none of which are wired up
for that target.
