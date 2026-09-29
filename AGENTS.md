# Termix — contributor notes

Only rules that **cannot be inferred from the code**, plus the reasoning behind them.
Keep this file short; if a rule is obvious from reading a neighbouring file, it does not
belong here.

## Layout

- `packages/client` — the Tauri app: React + Tailwind + shadcn/ui in `src/`, Rust in `src-tauri/`.
- `packages/server` — optional cloud-sync backend (Hono + Drizzle). Not needed to run the app.

## UI layout rules

### A settings page starts with a plain, full-width title row

```tsx
<div className="space-y-4">
  <h3 className="text-sm font-medium mb-4">Cloud Sync</h3>
  ...
```

shadcn's `DialogContent` renders the close button **absolutely positioned at the dialog's
top-right**, directly over the top-right corner of the scrollable content pane. That title row
is what reserves the space.

**No interactive control may sit at the top-right of a settings page.** Do not wrap the title in
`flex items-center justify-between` with a `Switch` or `Select` beside it — it ends up under the
close button. Put the control on its own `SettingRow` below the title.

### Detail panels share one header shape

`HostDetail`, `KeychainDetail` and `SnippetDetail` all open with:

```tsx
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h2 className="text-sm font-semibold">…</h2>
  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>…</Button>
</div>
```

Inside, sections are separated by `<Separator />` and headed by a label carrying
`text-xs text-muted-foreground uppercase tracking-wider`.

### List pages go through `ListPage`

`HostList`, `KeychainList` and `SnippetList` all render `<ListPage>` from
`@/components/layout/ListPage` instead of hand-rolling the search box, toolbar, empty state and
delete confirmation. Add a list by filling in its props — do not copy another list's markup.

## Data

### Secrets get their own encrypted column

Every secret is a flat `encrypted_*` column beside the plaintext metadata it belongs to, written
with `crypto::encrypt` on save and `crypto::decrypt` on load. The proxy password follows this by
keeping `encrypted_proxy_password` separate from the serialised proxy mode.

When you add a secret, split it out the same way — never leave it inside a plaintext JSON blob.
The settings blob (`AppSettings`) is the one exception: it is a single JSON value, so the secret
fields inside it are encrypted individually in `commands/settings.rs`.

## Errors

Do not swallow a failure in a `.catch` that only writes to the log. That is how the clipboard bug
stayed invisible for so long: the ACL rejected every copy and the UI showed nothing.

Failures a user can act on should reach the screen — see `@/lib/clipboard.ts` for the pattern
(log with `createLogger`, then surface it via `@/stores/toast-store`).

Backend logs go through `log::*`; they land in the app log file and are the primary
diagnostic surface. Log the *reason* for a lifecycle event, not a constant string — a
disconnect that only ever says "Connection closed" cannot be debugged.
