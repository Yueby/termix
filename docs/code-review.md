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
| 16 | Client | **`HostDetail` changed its hook count**, so it threw a hook-order error instead of rendering its placeholder whenever the selected connection disappeared. | Every hook now runs before the return. |
| 17 | Client | **Closing a connection mid-flight left an ownerless session and an unbounded output buffer.** | Teardown is driven by the operation that settles, the buffer is capped at 1 MiB, and two further leaks on the same path were fixed. |
| 18 | Rust | **`*.internal` bypassed `db.internal.attacker.example`**, because the wildcard was matched as an unanchored substring, sending traffic meant for the proxy direct. | Anchored wildcard matching; the tests that were missing are the negative ones. |
| 19 | Rust | **A local shell that stopped reading its input froze every other local terminal**, because the write went to the PTY while holding the session map's lock. | Per-session writer thread; the handler only queues. |
| 20 | Rust | **Exited shells were never reaped and never removed from the map**, and neither were dropped SSH sessions; `kill` does not collect a process, so every closed terminal left a zombie on Unix. | Readers clean up and wait on the child, with a per-session generation so a dead connection cannot evict a later one. |
| 21 | Rust | **Copying a directory into its own descendant recursed until the disk filled.** The destination is created before the source is enumerated, so it appeared in its own listing. | Refused, with tests for both the refusal and the sibling copy that must still work. Symlinks are recreated rather than followed. |
| 22 | Rust | **Every `ALTER TABLE` result was discarded**, so a lock or a full disk read as "the column is already there". | Only a genuine duplicate-column error is tolerated. |
| 23 | Rust | **A pull that read nothing answered "Pull completed"**, a response body that failed to read became "nothing to import", and the global proxy password was imported as ciphertext this machine could never decrypt. | Arrival is counted, 404 is distinguished from failure, and the proxy password stays local. |
| 24 | Rust | **The encryption key file was created with whatever permissions it inherited.** | 0600 on Unix, repaired on read for existing installs. |
| 25 | Rust | **`ALL_PROXY=socks5://…` never reached the proxy on non-Windows**, because only the http prefixes were stripped. | Any scheme is stripped. |
| 26 | Server | **The Worker could not be built at all.** `wrangler deploy` failed with `Could not resolve "os"`, because the shared crypto module referenced argon2 and that pulls `node-gyp-build` and the Node builtins into the bundle. | Node hashers moved to `utils/crypto-node.ts`; the dry run now succeeds and CI runs it. |
| 27 | Server | **No migration existed**, so a fresh database had no tables. | Baseline generated and tracked, and the tests now apply it rather than a hand-written copy of the schema. |
| 28 | Server | **Refresh rotation was not atomic**, so two requests with the same token both issued replacements. | The claim is one statement; four tests. |
| 29 | Repo | **The Docker image could not build**: the compose context was `packages/server` while the lockfile and workspace manifest live at the repository root. | Workspace-aware build from the root context. Reasoned, not observed — no Docker here. |
| 30 | Repo | **A release could be built from a revision CI never saw**, and saving a row could be reported as failed after it committed. | The release requires passing checks for the exact commit; the metadata write is best-effort and named as such. |

## Open

One thing, needing a decision rather than a patch:

- **The local encryption key is still an ordinary file beside the database.** It is private
  to the owning user now, but it remains the sole protection for every stored password and
  private key, so copying the application-data directory still yields them. Moving it into
  the platform credential store is the fix, and it needs a migration for existing installs —
  a wrong one loses every stored credential, which is why it is not being rushed.

Everything else reported here is addressed. The two that were noted as remaining — the
Docker build and how migrations reach D1 — have both been dealt with, the second verified by
applying the migration to a local D1 database.

### Smaller, not addressed

- DB methods for incremental sync that nothing calls.
- A WebDAV response is buffered in full with no size limit, unlike SFTP transfers.
- PBKDF2 records store no per-record work factor — moot for the server now that it has no
  passwords, and still true of the desktop client's own sync password derivation.

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
