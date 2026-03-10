export type HashAlgorithm = "argon2" | "pbkdf2";

export interface PasswordHasher {
  algorithm: HashAlgorithm;
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

const webCryptoVerifier = createWebCryptoHasher();

export async function verifyWithAlgorithm(password: string, hash: string, algorithm: HashAlgorithm): Promise<boolean> {
  if (algorithm === "pbkdf2") {
    return webCryptoVerifier.verify(password, hash);
  }
  try {
    const argon2 = await import("argon2");
    return argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Node.js argon2 hasher (for Docker/self-hosted)
 */
export async function createArgon2Hasher(): Promise<PasswordHasher> {
  const argon2 = await import("argon2");
  return {
    algorithm: "argon2",
    hash: (password) => argon2.hash(password),
    verify: (password, hash) => argon2.verify(hash, password),
  };
}

/**
 * WebCrypto PBKDF2 hasher (for CF Workers where argon2 is unavailable)
 */
export function createWebCryptoHasher(): PasswordHasher & { algorithm: "pbkdf2" } {
  const ITERATIONS = 100_000;
  const SALT_LEN = 16;
  const KEY_LEN = 32;

  async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
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

  return {
    algorithm: "pbkdf2",
    async hash(password) {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
      const derived = await deriveKey(password, salt);
      return `${toHex(salt)}:${toHex(derived)}`;
    },
    async verify(password, stored) {
      const [saltHex, hashHex] = stored.split(":");
      const salt = fromHex(saltHex);
      const derived = await deriveKey(password, salt);
      return toHex(derived) === hashHex;
    },
  };
}
