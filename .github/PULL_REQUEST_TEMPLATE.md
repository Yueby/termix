## What changed

<!-- One or two sentences. -->

## Why

<!-- The problem this solves. Link the issue if there is one. -->

## Verification

<!-- What you actually ran, and what you checked by hand. -->

- [ ] `pnpm --filter @termix/client build`
- [ ] `cargo check --manifest-path packages/client/src-tauri/Cargo.toml --all-targets`
- [ ] `cargo test --manifest-path packages/client/src-tauri/Cargo.toml --lib`

## Notes for the reviewer

<!-- Anything you want looked at closely, or deliberately left out. -->
