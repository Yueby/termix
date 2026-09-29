import type { HashAlgorithm, PasswordHasher } from "./crypto";
import { createWebCryptoHasher } from "./crypto";

/**
 * Node-only password hashing.
 *
 * This is a separate module from `./crypto` on purpose. The Worker imports that module, and
 * argon2 is a native addon: mentioning the package anywhere in the Worker's graph — even
 * inside a `try { await import("argon2") } catch` — drags `node-gyp-build` and the Node
 * builtins it needs into the bundle, and `wrangler deploy` then fails outright with
 * "Could not resolve \"os\"". Run `pnpm --filter @termix/server exec wrangler deploy --dry-run`
 * to check.
 */
export async function createArgon2Hasher(): Promise<PasswordHasher> {
  const argon2 = await import("argon2");
  const pbkdf2 = createWebCryptoHasher();

  return {
    algorithm: "argon2",
    hash: (password) => argon2.hash(password),
    verify: (password, hash) => argon2.verify(hash, password),
    // A Node deployment is the one place both algorithms can be checked, which is what
    // makes it the migration path for accounts registered on Workers.
    verifyAs: (password: string, hash: string, algorithm: HashAlgorithm) =>
      algorithm === "argon2"
        ? argon2.verify(hash, password)
        : pbkdf2.verifyAs(password, hash, algorithm),
  };
}
