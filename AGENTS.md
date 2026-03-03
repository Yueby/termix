# AGENTS.md

Agent guide for `E:\Projects\web\termix`.

## 0) Observed repo reality (keep accurate)

- Repository is effectively **empty except for this `AGENTS.md` file** (no source, scripts, configs, or lockfiles).
- Cursor rules are currently absent (`.cursor/rules/*`, `.cursorrules`).
- Copilot instructions are currently absent (`.github/copilot-instructions.md`).

All commands below are **provisional bootstrap guidance** until real files/scripts exist.
Warning: provisional commands may fail until scripts/config/tooling are actually added.
Do not claim any script/tooling is already configured.

---

## 1) Provisional command playbook (pnpm-first)

> Use only until actual scripts/config are added.
> Prefer `pnpm` examples to match user intent.

### 1.1 Optional bootstrap (provisional)

```bash
# Non-interactive-safe in this non-empty repo; moving scaffolded files to root is manual.
pnpm create vite app --template react-ts
pnpm install
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom eslint prettier @types/node
# Interactive/manual step (do not treat as non-interactive):
pnpm dlx tauri init
```

```bash
rustup update
cargo --version
```

### 1.2 Build / lint / typecheck

```bash
pnpm build
pnpm run tauri:build
pnpm lint
pnpm format
pnpm typecheck
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
```

### 1.3 Test policy (strong single-test emphasis)

Default: run the narrowest test scope possible. Prefer one file or one test name first.
Run full suites only when needed (CI parity, release checks, broad refactors).

Vitest-style examples:

```bash
pnpm test -- src/foo/bar.test.ts
pnpm test -- -t "renders primary button"
pnpm test -- src/foo/bar.test.ts -t "renders primary button"
pnpm test
```

Rust:

```bash
cargo test my_module::tests::specific_case
cargo test specific_case -- --exact
cargo test
```

Playwright (if later added):

```bash
pnpm exec playwright test tests/smoke/login.spec.ts
pnpm exec playwright test -g "login succeeds"
pnpm exec playwright test
```

### 1.4 Script contract once `package.json` exists

Prefer stable script names: `dev`, `build`, `preview`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:coverage`, `tauri:dev`, `tauri:build`.
When scripts appear, update this file to exact names.

---

## 2) Code style + safety defaults

Apply until project-specific rules/configs override.

### 2.1 Imports

- ESM imports in TypeScript.
- Order: built-in → third-party → internal alias → relative.
- Avoid side-effect imports unless intentional.
- Remove unused imports; avoid wildcard imports unless justified.

### 2.2 Formatting

- Formatter-driven style (Prettier defaults unless overridden).
- Keep formatting consistent and deterministic.
- Keep trailing newline in edited files.

### 2.3 Types

- Assume TypeScript `strict`.
- Avoid `any`; use `unknown` + narrowing.
- Explicit return types for exported functions.
- Parse/validate at boundaries (IPC/network/storage), then trust typed internals.

### 2.4 Naming

- `PascalCase`: components/types/classes.
- `camelCase`: variables/functions/hooks.
- `SCREAMING_SNAKE_CASE`: constants/env keys.
- Use intention-revealing names (`isReady`, `createSessionToken`).

### 2.5 Error handling

- Fail fast with descriptive errors for invalid/impossible states.
- Handle expected failures explicitly (typed errors / `Result`).
- Never silently swallow errors.
- Keep user messages safe; keep sensitive detail internal.

### 2.6 Logging

- No stray debug logging in committed code.
- Use level-based logs (`debug`, `info`, `warn`, `error`).
- Include operation context when available.
- Never log secrets, credentials, tokens, or raw sensitive PII.

### 2.7 Safe defaults

- Keep edits minimal and task-scoped.
- Prefer deterministic, non-interactive commands.
- Do not modify unrelated files.
- Avoid destructive operations unless explicitly requested.
- Do not invent existing scripts/files/tooling.

---

## 3) Instruction precedence + Cursor/Copilot handling

Apply rules in this order (highest first):

1. System/platform safety constraints
2. Direct user instructions for current task
3. `AGENTS.md` (this file)
4. Cursor rules if present (`.cursor/rules/*`, `.cursorrules`)
5. Copilot instructions if present (`.github/copilot-instructions.md`)
6. Conventions inferred from actual project files/scripts/config

Conflict resolution:

- Same level: prefer more specific rule.
- Still tied: prefer newer rule.
- If Cursor/Copilot files appear later, treat them as active at their level.

---

## 4) Maintenance triggers

Update this file when any of these become real:

- `package.json` scripts added/renamed
- `Cargo.toml` workspace/crates added
- Lint/format/typecheck/test stack finalized
- Cursor or Copilot instruction files introduced

Until then, keep guidance labeled as **provisional bootstrap guidance**.
