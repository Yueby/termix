/**
 * SSH key type identification.
 *
 * The body of a private key PEM is base64, and the base64 alphabet has no "-",
 * so an algorithm name such as "ssh-ed25519" can never occur there as literal
 * text. Matching substrings against private key material therefore produces
 * random answers - "EC" alone shows up in ~10-20% of ed25519 keys.
 *
 * Detection reads the type from places where it is stored in the clear, in this
 * order: the public key line, the PPK "Algorithm:" field, the legacy PEM header
 * ("BEGIN RSA PRIVATE KEY"), the PKCS#8 algorithm OID, and finally the decoded
 * OpenSSH key blob, whose plaintext header carries the algorithm. A keyType
 * recorded at generation or import time is used when none of those apply.
 */

/** Placeholder stored for keys whose type has never been determined. */
const UNKNOWN_TYPE = "ssh-key";

const UNKNOWN_TYPES = new Set(["", UNKNOWN_TYPE, "unknown"]);

/** Algorithm name -> label shown in the UI. Keys are lowercased. */
const TYPE_LABELS: Record<string, string> = {
  "ssh-ed25519": "Ed25519",
  "sk-ssh-ed25519@openssh.com": "Ed25519-SK",
  "ssh-rsa": "RSA",
  "rsa-sha2-256": "RSA",
  "rsa-sha2-512": "RSA",
  "ssh-dss": "DSA",
  "ecdsa-sha2-nistp256": "ECDSA P-256",
  "ecdsa-sha2-nistp384": "ECDSA P-384",
  "ecdsa-sha2-nistp521": "ECDSA P-521",
  // Short forms accepted by the key generator and the older UI.
  "ed25519": "Ed25519",
  "rsa": "RSA",
  "dsa": "DSA",
  "ecdsa": "ECDSA",
  "ecdsa-256": "ECDSA P-256",
  "ecdsa-384": "ECDSA P-384",
  "ecdsa-521": "ECDSA P-521",
};

/** Longest first, so "sk-ssh-ed25519@openssh.com" is not read as "ssh-ed25519". */
const ALGORITHMS = [
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "ssh-ed25519",
  "ssh-rsa",
  "ssh-dss",
];

/** AlgorithmIdentifier DER prefixes, including the OBJECT IDENTIFIER tag and length. */
const ALGORITHM_OIDS: Array<[string, number[]]> = [
  ["ssh-rsa", [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]],
  ["ecdsa", [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]],
  ["ssh-dss", [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x38, 0x04, 0x01]],
  ["ssh-ed25519", [0x06, 0x03, 0x2b, 0x65, 0x70]],
];

/** "ssh-ed25519 AAAA... comment" - a public key or authorized_keys entry. */
const PUBLIC_KEY_LINE =
  /^(sk-[\w-]+@openssh\.com|ssh-[\w-]+|ecdsa-sha2-nistp\d+|rsa-sha2-\d+)\s+[A-Za-z0-9+/]+=*/;

function fromPublicKeyLine(text: string | undefined): string | undefined {
  if (!text) return undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = PUBLIC_KEY_LINE.exec(trimmed);
    if (match) return match[1];
  }
  return undefined;
}

function decodeBase64(text: string): Uint8Array | undefined {
  const base64 = text.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  if (!base64) return undefined;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

function containsBytes(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function asciiBytes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

/** PuTTY .ppk names the algorithm on its own line. */
function fromPpk(text: string): string | undefined {
  const match = /^Algorithm:\s*(\S+)/m.exec(text);
  return match?.[1];
}

/** Legacy PEM headers name the algorithm; PKCS#8 and OpenSSH need decoding. */
function fromPemHeader(text: string): string | undefined {
  const match = /-----BEGIN ([A-Z0-9 ]+?) PRIVATE KEY-----/.exec(text);
  if (!match) return undefined;
  switch (match[1]) {
    case "RSA":
      return "ssh-rsa";
    case "DSA":
      return "ssh-dss";
    case "EC":
      return "ecdsa"; // The curve is not in the header.
    default:
      return undefined; // "OPENSSH" and PKCS#8 carry no algorithm here.
  }
}

/** The openssh-key-v1 header holds the algorithm as plaintext inside the base64. */
function fromOpenSshBody(text: string): string | undefined {
  const bytes = decodeBase64(text);
  if (!bytes) return undefined;
  return ALGORITHMS.find((algorithm) => containsBytes(bytes, asciiBytes(algorithm)));
}

/** PKCS#8 names no algorithm in the header, but its DER carries the OID. */
function fromPkcs8(text: string): string | undefined {
  if (!/-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/.test(text)) return undefined;
  const bytes = decodeBase64(text);
  if (!bytes) return undefined;
  return ALGORITHM_OIDS.find(([, oid]) => containsBytes(bytes, oid))?.[0];
}

/** Canonical algorithm name, or "ssh-key" when it cannot be determined. */
export function detectKeyType(privateKey: string, publicKey?: string): string {
  return (
    fromPublicKeyLine(publicKey) ??
    fromPublicKeyLine(privateKey) ??
    fromPpk(privateKey) ??
    fromPemHeader(privateKey) ??
    fromPkcs8(privateKey) ??
    fromOpenSshBody(privateKey) ??
    UNKNOWN_TYPE
  );
}

/**
 * Label for a keychain entry, or "" when the type is unknown so callers can
 * hide the badge.
 */
export function resolveKeyTypeLabel(key: {
  keyType?: string;
  privateKey?: string;
  publicKey?: string;
}): string {
  const detected = detectKeyType(key.privateKey ?? "", key.publicKey);
  const canonical = UNKNOWN_TYPES.has(detected)
    ? (key.keyType ?? "").trim().toLowerCase()
    : detected.toLowerCase();
  if (UNKNOWN_TYPES.has(canonical)) return "";
  return TYPE_LABELS[canonical] ?? canonical;
}
