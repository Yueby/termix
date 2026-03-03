# TERMIX v1 Implementation Checklist
Execution checklist for v1 delivery.

## Scope
### Fixed decisions (must remain unchanged)
- [ ] Stack: **Tauri + React + TypeScript + Vite** frontend, **Rust** backend.
- [ ] UI stack: **shadcn/ui + Tailwind + Radix**.
- [ ] Default theme/style: **dark**, minimal/professional.
- [ ] Terminal engine: **xterm.js**.
- [ ] Platforms: **Windows + Android**.
- [ ] Layout: Home main tab for connection configs; Session top-tab model (Termius-style), one tab per session; center Terminal primary; right sidebar tabs = SFTP and Server Info; bottom transfer drawer.
- [ ] Session policy: same server can have multiple sessions.
- [ ] Default session subview: Terminal.
- [ ] WebDAV conflict strategy: LWW by `updated_at + device_id`.
- [ ] Android keyboard (v1): basic shortcuts only.
- [ ] Port forwarding (v1): local forwarding (L) only.
- [ ] Priorities: lightweight memory usage, mature libraries, beautiful UI.

### In-scope (v1)
- [ ] Connection config CRUD from Home.
- [ ] Multi-session SSH runtime with top tab management.
- [ ] Terminal IO lifecycle per session using xterm.js.
- [ ] Right sidebar SFTP + Server Info panels.
- [ ] Bottom transfer drawer with progress states.
- [ ] WebDAV sync of config/settings/session metadata.
- [ ] Local port forwarding (L) create/list/stop.
- [ ] Android support for basic keyboard shortcuts.

### Out-of-scope (v1)
- [ ] Remote (R) and dynamic (D) forwarding.
- [ ] Advanced Android keyboard/IME mapping.
- [ ] Collaborative sessions and plugin ecosystem.

---
## Architecture
### System boundaries
- [ ] Frontend handles UI composition, local view state, and command dispatch.
- [ ] Rust core handles SSH/SFTP, session orchestration, sync logic, and secure storage.
- [ ] Tauri command bridge is the only FE↔BE boundary.
- [ ] Shared DTOs are versioned and validated at boundary.

### Data/session model
- [ ] Session identity uses unique `session_id` independent from server id.
- [ ] Multiple sessions per server are supported concurrently.
- [ ] State domains separated: `connections`, `sessions`, `transfers`, `sync`, `ui`.
- [ ] Session subview defaults to Terminal on open/restore.

### Reliability model
- [ ] Reconnect uses bounded backoff and explicit terminal states.
- [ ] All command failures return typed error (`code`, `message`, optional `details`).
- [ ] Sync operations are idempotent and retry-safe.

### Architecture acceptance criteria
- [ ] Cold startup to interactive Home: **<= 2.5s (Windows)**, **<= 4.0s (Android)**.
- [ ] Home action to first live session: **<= 1.5s p50**, **<= 2.5s p95**.
- [ ] Reconnect resolution (success/fail visible) within **<= 10s** after transient drop.
- [ ] No cross-session IO leakage in isolation tests.

---
## Milestones (4 weeks)
### Week 1 — Foundation + shell UI
- [ ] Initialize Tauri + React + TS + Vite baseline.
- [ ] Configure shadcn/ui, Tailwind, Radix, and dark tokens.
- [ ] Build shell layout (Home, top tabs, center pane, right sidebar, bottom drawer).
- [ ] Define command contracts and error envelope.

### Week 2 — Sessions + terminal core
- [ ] Implement connection CRUD end-to-end.
- [ ] Integrate xterm.js per session.
- [ ] Implement one-tab-per-session policy with same-server multi-session support.
- [ ] Implement open/switch/close/restore + reconnect states.

### Week 3 — SFTP + sync + forwarding
- [ ] Implement SFTP list/upload/download/delete/rename.
- [ ] Implement transfer drawer status lifecycle.
- [ ] Implement WebDAV sync + LWW resolver (`updated_at + device_id`).
- [ ] Implement local forwarding (L) lifecycle.

### Week 4 — hardening + release prep
- [ ] Performance optimization pass (startup/memory/rendering).
- [ ] Security pass (secret handling, validation, redaction).
- [ ] Full regression and platform packaging validation.

---
## Module checklists
### Frontend module
- [ ] Home tab: connection list/search/filter and CRUD actions.
- [ ] Session top-tab bar: create/switch/close + per-session status badge.
- [ ] Center Terminal primary pane with resilient mount/unmount.
- [ ] Right sidebar tabs strictly: SFTP, Server Info.
- [ ] Bottom transfer drawer: active/completed/canceled states.
- [ ] Dark, minimal/professional visuals consistently applied.
- [ ] Android shortcuts restricted to basic v1 set.

Frontend acceptance criteria:
- [ ] Initial no-session render: **<= 800ms p50**.
- [ ] Session tab switch response: **<= 120ms p95**.
- [ ] Keystroke-to-echo latency: **<= 100ms p95**.
- [ ] Keystroke-to-echo reproducibility setup fixed: **200 sampled keypresses per platform build (Windows + Android), stable LAN (same subnet, < 5ms RTT, < 0.1% packet loss), measured from keydown timestamp to first echoed glyph via app telemetry/performance marks; report p50/p95**.

### Rust core module
- [ ] Session manager with strict `session_id` lifecycle.
- [ ] Concurrent session resource isolation and cleanup.
- [ ] SFTP operation handlers + transfer queue primitives.
- [ ] Local forwarding (L) manager only.
- [ ] Server Info command handlers.
- [ ] Persistent storage for configs/settings/session metadata.

Rust core acceptance criteria:
- [ ] 10 concurrent idle sessions stable for **>= 30 min**.
- [ ] Session close frees resources in **<= 2s**.

### Sync module (WebDAV)
- [ ] Endpoint/auth config and state machine.
- [ ] Pull/push scheduling with bounded retry backoff.
- [ ] Conflict resolver uses LWW: `updated_at`, tie-break by `device_id`.
- [ ] Duplicate-apply prevention via local snapshot/version tracking.

Sync acceptance criteria:
- [ ] Deterministic conflict output for identical multi-device inputs.
- [ ] Offline->online convergence to synced state in **<= 60s**.

### Performance module
- [ ] Baseline profiling workflow defined and repeatable.
- [ ] Startup path defers non-critical work.
- [ ] Terminal scrollback/rendering remains smooth under high output.

Performance acceptance criteria:
- [ ] Windows idle Home memory: **<= 220 MB RSS**.
- [ ] Windows 3 active sessions + sidebar + drawer: **<= 420 MB RSS**.
- [ ] Android 2 active sessions: **<= 350 MB RSS**.

---
## API / command checklist
- [ ] `connections_list`, `connections_create`, `connections_update`, `connections_delete`
- [ ] `session_open`, `session_close`, `session_send_input`, `session_resize`, `session_reconnect`, `sessions_list_active`
- [ ] `sftp_list`, `sftp_upload`, `sftp_download`, `sftp_delete`, `sftp_rename`
- [ ] `transfer_list`, `transfer_cancel`
- [ ] `server_info_get`
- [ ] `port_forward_local_create`, `port_forward_local_list`, `port_forward_local_stop`
- [ ] `sync_trigger`, `sync_status_get`
- [ ] `settings_get`, `settings_set`

API acceptance criteria:
- [ ] Payload schema validation enforced before command execution.
- [ ] Errors return stable `code/message/details` shape.

---
## UI component checklist
- [ ] `AppShell`
- [ ] `HomeConnectionsTab`
- [ ] `ConnectionEditorDialog`
- [ ] `SessionTopTabsBar`
- [ ] `TerminalPane` (xterm host)
- [ ] `RightSidebarTabs` (SFTP / Server Info)
- [ ] `SftpFileTree` + `SftpActionToolbar`
- [ ] `ServerInfoPanel`
- [ ] `TransferDrawer` + `TransferItemRow`
- [ ] `SyncStatusIndicator`
- [ ] `PortForwardListPanel` (L only)
- [ ] Global feedback components (`Toaster`/`ErrorBanner`)

UI acceptance criteria:
- [ ] Dark tokens/spacing/typography consistency verified.
- [ ] Keyboard navigability for open/switch/close critical paths.

---
## Security checklist
- [ ] Use platform-secure secret storage; no plaintext credential persistence.
- [ ] Redact secrets/host/private key/token from logs/telemetry.
- [ ] Validate and sanitize all Tauri command input.
- [ ] Constrain file operations to allowed roots and sanitize SFTP paths.
- [ ] Enforce operation timeout/cancel for network-bound actions.
- [ ] Run dependency audits for JS and Rust dependencies.

Security acceptance criteria:
- [ ] No high-severity known vulnerabilities at release cutoff.
- [ ] Artifact secret scan reports zero exposed credentials.

---
## Test checklist (single-test first policy)
Policy:
- [ ] Start each feature/bug with one focused failing test, then implement.
- [ ] Expand to adjacent cases only after first green signal.

Coverage:
- [ ] Unit: session transitions (open/switch/close/reconnect).
- [ ] Unit: LWW resolver (`updated_at + device_id`).
- [ ] Unit: local forwarding (L) lifecycle.
- [ ] Integration: command contracts + error envelopes.
- [ ] Integration: terminal lifecycle per session tab.
- [ ] E2E: Home -> open session -> terminal IO -> close/reopen.
- [ ] E2E: same-server multi-session isolation.
- [ ] E2E: offline/online sync recovery.

Test acceptance criteria:
- [ ] Critical path pass rate: **100%** on release branch.
- [ ] Flaky rate: **< 2%** across last 20 CI runs.

---
## Release checklist (Windows + Android)
Windows:
- [ ] Signed release build generated.
- [ ] Fresh install and upgrade install verified.
- [ ] Session persistence/reconnect after restart verified.
- [ ] SFTP upload/download smoke test passed.

Android:
- [ ] Signed release build generated (APK/AAB as required).
- [ ] Fresh install + upgrade path pass.
- [ ] Basic keyboard shortcuts pass on physical device.
- [ ] Background/foreground lifecycle preserves session integrity.

Release acceptance criteria:
- [ ] RC crash-free session rate **>= 99.5%**.
- [ ] RC crash-free reproducibility setup fixed: **rolling 7-day RC observation window before ship decision, telemetry source = release channel crash reporting pipeline (app-level session start/end + fatal crash events), metric = 1 - (crashed sessions / total sessions)**.
- [ ] Open P0/P1 defects at ship decision: **0**.

---
## Risks and rollback plans
Key risks:
- [ ] xterm.js performance degradation under heavy output.
- [ ] WebDAV inconsistency under poor network conditions.
- [ ] Android lifecycle interruption impact on sessions.

Mitigations:
- [ ] Feature flags for sync/transfer-forwarding surfaces.
- [ ] Bounded retries and circuit-break behavior for unstable operations.
- [ ] Canary validation with telemetry-based stop conditions.

Rollback:
- [ ] Keep prior stable Windows/Android binaries immediately deployable.
- [ ] Preserve one-version schema compatibility for downgrade safety.
- [ ] Provide rollback runbook with owner/on-call.

---
## Definition of Done
- [ ] All fixed decisions are implemented exactly.
- [ ] All in-scope items complete or formally waived with sign-off.
- [ ] Architecture/module/security/test/release acceptance criteria met.
- [ ] Windows + Android artifacts reproducible and validated.
- [ ] No open P0/P1 issues at release cut.
- [ ] User can configure in Home, open multiple sessions (same server allowed), land in Terminal by default, use SFTP and Server Info, track transfers, and sync reliably with WebDAV LWW.
