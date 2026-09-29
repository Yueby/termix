# Code and project review

Scope: the whole repository — 23 Rust files (~3.8k lines), 81 frontend files (~12.6k lines),
16 server files (~730 lines), plus CI, release and packaging configuration.

Method: three independent read-only review passes (Rust backend, frontend, server + repo),
followed by verification of every consequential claim in this document. Claims that did not
survive verification were dropped; three were removed that way, including two of my own.

Status legend: **fixed** means it is repaired in `main` with a test or a measurement;
**open** means it is reported and not yet addressed.

## Fixed in this pass

| # | Area | Defect | Evidence |
|---|------|--------|----------|
| 1 | Rust | **Every SSH and SFTP host key was accepted.** `check_server_key` logged a fingerprint and returned `Ok(true)` unconditionally. The sidebar had a "Known Hosts" item while nothing in the backend read or wrote a known_hosts file. | `services/ssh_manager.rs:41`, `services/sftp_manager.rs:34` (before). Now `services/host_keys.rs`, 4 tests. |
| 2 | Server | **The context middleware never ran.** `createApp()` mounted the routes and the entry points registered the database/hasher/secret middleware afterwards; Hono composes in registration order, so every route answered from an empty context while still returning 200s. | Verified against the assembled app: the route now reaches the database. |
| 3 | Server | **A refresh token was accepted as an access token.** Both kinds were signed with the same key and `requireAuth` checked only `sub`, so a 30-day credential worked as a bearer token that logout and rotation could not revoke. | `middleware/auth.ts` (before/after). |
| 4 | Server | **A published signing key shipped as a default.** `docker-compose.yml` carried `JWT_SECRET=change-me-in-production`. | Compose now uses `${JWT_SECRET:?…}`. |
| 5 | Server | **The login path claimed constant-time behaviour it did not have.** The `"$dummy$"` placeholder is not a hash, and argon2 returns immediately for an unknown algorithm identifier. | Measured: **0.1 ms** for a missing account vs **25.9 ms** for a real one — a 260× difference disclosing which usernames exist. |
| 6 | Server | **Eight real type errors, with the gate that would catch them set to `continue-on-error`.** The package ships two runtimes and one tsconfig cannot describe both. | Now typechecked twice (Node + Workers), both pass, and both gate CI. |
| 7 | Client | **The SFTP file table rendered every entry.** A 5000-file directory was 5000 DOM rows to re-lay-out on every resize and scroll. | Now ~30 rows at any scroll offset, measured against a synthesized 5000-entry directory. |
| 8 | Repo | **87 unformatted Rust spots**, with formatting only advisory. | `cargo fmt --check` is clean and now gates. |
| 9 | Rust | **The SSH transport stalled after roughly 100 output messages.** russh's per-channel queue was never read, so once it filled the transport task blocked inside its own send and the session stopped. Reachable through ordinary interactive use. | The channel is split and the read half is drained; `services/ssh_manager.rs`. |
| 10 | Rust | **A decryption failure became an empty credential.** Every secret read used `unwrap_or_else(|_| String::new())`, so a missing key file blanked every password — and the next save wrote the blanks over the ciphertext. | `crypto::decrypt_secret`, 2 tests. |
| 11 | Rust | **Removing or renaming a symlink acted on its target.** Deleting `link -> important.txt` deleted `important.txt`; a directory link reached recursive deletion of its target. | `commands/local_fs.rs` now uses `symlink_metadata` and acts on the entry. |
| 12 | Rust | **Sync wrote the custom-proxy password in the clear, and degraded to plaintext when its own stored password was unreadable.** | `commands/sync.rs`; the fail-closed rule now covers the WebDAV password too. |
| 13 | Server | **Concurrent sync pushes could overwrite newer data with older data** while both reported success, and two simultaneous first pushes made the loser a 500. | The version predicate is in the statement; 9 request tests. |
| 14 | Repo | **The signing key was readable by every step of build job**, manual releases built the dispatched revision while labelling it with the requested tag, and nothing checked the four version fields. | `verify` job plus step-scoped secrets. |
| 15 | Repo | **Clippy had 11 warnings and ran advisory.** | Two row types became named aliases; four signatures the IPC contract or russh fixes carry a targeted allow with its reason. Clippy is clean and gates. |

## Open — highest severity

### Rust backend

- **The local encryption key is a plain file beside the database.** `.termix_key` contains
  the raw AES key (Base64) in the application-data directory, so copying that directory
  yields every stored password and private key. The AES-GCM use itself is correct —
  nonces are random, tampering is rejected — this is the key-storage design. The platform
  credential store is the fix.
- Medium: dead sessions stay in the session maps after a remote disconnect; a blocked PTY
  write holds the global lock; naturally-exited local shells are never reaped; every
  migration error is treated as "column already exists"; save/delete commands update sync
  metadata outside the main write; global proxy credentials sync as machine-specific
  ciphertext; pull reports success when every fetch failed; copying a directory into its
  own descendant copies its own output; `ALL_PROXY=socks5://…` keeps its scheme on
  non-Windows; bypass matching is substring-based, so `*.internal` also matches
  `db.internal.attacker.example`; the login fallback for a missing account now does equal
  work, so the timing oracle is closed on both hashers.

### Server

- **The Docker build cannot find the lockfile.** `docker-compose.yml` uses `build: .`
  with the context at `packages/server`, while `Dockerfile` COPYs `pnpm-lock.yaml`, which
  lives at the repository root. The image cannot build. Not fixed here: Docker is
  unavailable in this environment, and an unverified Dockerfile change is worse than a
  build that fails clearly.
- **The Worker dependency graph still reaches native Node modules.** `services/crypto.ts`
  dynamically imports `argon2` for verifying migrated hashes; Workers cannot run the
  addon, so those accounts cannot authenticate there. The database half of this was fixed
  as part of the typecheck work.
- **No migration history is checked in.** `drizzle/` is gitignored and no migration files
  exist, so a fresh database has no tables — the server tests write the schema out by hand
  for that reason — and schema changes ship through undocumented external steps.
- Medium: refresh rotation is not atomic; a release does not require CI success for the
  commit it builds; the client package still has no tests.

### Frontend

- **`HostDetail` changes its hook count.** The last `useEffect` sits below a conditional
  early return, so the component throws when `conn` goes from present to absent — which
  happens when a new host's save fails (the panel opens optimistically and the connection
  is removed on error) or when a sync pull removes the connection being edited. There is
  no error boundary to contain it. Move every hook above the return.
- **Closing an in-flight connection leaves an ownerless session.** Disconnect only acts on
  a `sessionId` already recorded on the tab, and a connection still in its startup delay
  or authenticating has `sessionId: null`. The operation continues after the tab is gone,
  never disconnects, and its output buffer is retained indefinitely.

## Verification notes

Three claims did not survive checking and are deliberately absent from the tables above:
a supposed production panic reachable through `"$dummy$"` (`new Uint8Array(3.5)` truncates
rather than throwing), a supposed forgeable JWT signing key (`TextEncoder().encode(undefined)`
yields an empty key, which `jose` rejects outright), and a first attempt at refuting the
middleware-ordering defect, which used a test harness that did not reproduce the real
registration order. The ordering defect is real and is fixed.

Claims the reviews cleared, worth recording so they are not re-investigated: AES-GCM
nonces are random per encryption; all SQL binds caller values; no `expect`/`unwrap` in
production code is reachable from server or IPC input; SFTP transfers stream through a
32 KiB buffer; terminal tab switching does not accumulate observers, listeners or
instances; the directory-listing race has a latest-request guard.
