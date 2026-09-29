/**
 * A one-line signal that the local vault changed.
 *
 * Deliberately free of imports. The invoke wrappers raise this, and the module that performs
 * the sync subscribes to it — if the wrappers imported that module directly, the two would
 * depend on each other.
 */
type Listener = () => void;

const listeners: Listener[] = [];

export function onVaultChanged(listener: Listener) {
  listeners.push(listener);
}

/** Called after a write that succeeded, so nothing has to remember to ask for a sync. */
export function vaultChanged() {
  for (const listener of listeners) {
    listener();
  }
}
