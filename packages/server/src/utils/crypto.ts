export type HashAlgorithm = "argon2" | "pbkdf2";

/**
 * Compares two hex digests without an early exit on the first differing character, so that
 * the comparison does not reveal how much of the expected value a caller guessed. Lengths
 * are compared first; for the fixed-size digests used here that leaks nothing.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface PasswordHasher {
  algorithm: HashAlgorithm;
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  /**
   * Verifies a stored record that was written with `algorithm`, which need not be this
   * runtime's own: an account registered on a Node deployment is stored as argon2 and can
   * only be verified where argon2 exists.
   *
   * Throws when this runtime cannot do it. The previous shape caught the failure and
   * answered `false`, which is indistinguishable from a wrong password — the user is told
   * their credentials are invalid when the truth is that this deployment cannot check them.
   */
  verifyAs(password: string, hash: string, algorithm: HashAlgorithm): Promise<boolean>;
}

/**
 * WebCrypto PBKDF2 hasher, for Cloudflare Workers where argon2 is unavailable.
 *
 * The Node-only argon2 hasher lives in `./crypto-node`. That split is not cosmetic: any
 * reference to the argon2 package, even inside a dynamic import, is enough to pull
 * `node-gyp-build` and the Node builtins it requires into the Worker bundle, which then
 * fails to build. `wrangler deploy --dry-run` is what catches it.
 */
export function createWebCryptoHasher(): PasswordHasher & { algorithm: "pbkdf2" } {
  const ITERATIONS = 100_000;
  const SALT_LEN = 16;
  const KEY_LEN = 32;

  async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    return crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      key,
      KEY_LEN * 8,
    );
  }

  function toHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    return bytes;
  }

  async function verify(password: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(":");
    const salt = fromHex(saltHex);
    const derived = await deriveKey(password, salt);
    return timingSafeEqualHex(toHex(derived), hashHex);
  }

  return {
    algorithm: "pbkdf2",
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
      const derived = await deriveKey(password, salt);
      return `${toHex(salt)}:${toHex(derived)}`;
    },
    verify,
    async verifyAs(password, hash, algorithm) {
      if (algorithm === "pbkdf2") {
        return verify(password, hash);
      }
      throw new Error(
        "this account was hashed with argon2, which this deployment cannot verify",
      );
    },
  };
}
