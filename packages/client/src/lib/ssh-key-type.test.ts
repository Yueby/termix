import { describe, expect, it } from "vitest";
import { detectKeyType, resolveKeyTypeLabel } from "./ssh-key-type";

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** A body shaped like `openssh-key-v1`, which carries the algorithm as plaintext. */
function opensshBody(algorithm: string, filler = "AAAAAAAA"): string {
  return toBase64([
    ...ascii("openssh-key-v1\0"),
    ...u32(algorithm.length),
    ...ascii(algorithm),
    ...u32(filler.length),
    ...ascii(filler),
  ]);
}

function opensshKey(algorithm: string, filler?: string): string {
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${opensshBody(algorithm, filler)}\n-----END OPENSSH PRIVATE KEY-----`;
}

/** AlgorithmIdentifier OIDs, as they appear in a PKCS#8 DER sequence. */
const OID = {
  rsa: [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01],
  ecdsa: [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01],
  ed25519: [0x06, 0x03, 0x2b, 0x65, 0x70],
};

function pkcs8(oid: number[], filler = "PRIVATE"): string {
  return `-----BEGIN PRIVATE KEY-----\n${toBase64([0x30, 0x30, ...oid, ...ascii(filler)])}\n-----END PRIVATE KEY-----`;
}

describe("detectKeyType", () => {
  it("prefers the public key line, which states the algorithm in the clear", () => {
    expect(detectKeyType(opensshKey("ssh-rsa"), "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5")).toBe(
      "ssh-ed25519",
    );
  });

  it("reads the public key line off the private key when no public key is given", () => {
    const text = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI user@host\nmore";
    expect(detectKeyType(text)).toBe("ssh-ed25519");
  });

  it("skips comment lines before the public key", () => {
    const text = "# a comment\n\nssh-rsa AAAAB3NzaC1yc2E user@host";
    expect(detectKeyType(text)).toBe("ssh-rsa");
  });

  it("reads a PuTTY .ppk Algorithm field", () => {
    expect(detectKeyType("PuTTY-User-Key-File-3: ssh-ed25519\nAlgorithm: ssh-ed25519\n")).toBe(
      "ssh-ed25519",
    );
  });

  it("reads a legacy PEM header", () => {
    expect(detectKeyType("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n")).toBe("ssh-rsa");
    expect(detectKeyType("-----BEGIN DSA PRIVATE KEY-----\nAAAA\n")).toBe("ssh-dss");
    // The header names the family but not the curve, so it stops at "ecdsa".
    expect(detectKeyType("-----BEGIN EC PRIVATE KEY-----\nAAAA\n")).toBe("ecdsa");
  });

  it("reads the algorithm OID out of a PKCS#8 body", () => {
    expect(detectKeyType(pkcs8(OID.ed25519))).toBe("ssh-ed25519");
    expect(detectKeyType(pkcs8(OID.rsa))).toBe("ssh-rsa");
    expect(detectKeyType(pkcs8(OID.ecdsa))).toBe("ecdsa");
  });

  it("reads the algorithm from the openssh-key-v1 header", () => {
    expect(detectKeyType(opensshKey("ssh-ed25519"))).toBe("ssh-ed25519");
    expect(detectKeyType(opensshKey("ecdsa-sha2-nistp521"))).toBe("ecdsa-sha2-nistp521");
  });

  it("does not find an algorithm name in base64 filler", () => {
    // The whole reason this module reads structured fields instead of searching text:
    // base64 has no "-", so "ssh-ed25519" can never occur literally inside a key body,
    // and a substring search for something like "EC" returns random answers — it turns
    // up in a sizeable fraction of ed25519 keys by chance. Here the filler does contain
    // "EC" and the answer still comes from the header.
    const key = opensshKey("ssh-ed25519", "ECECECECECECECEC");
    // Decoded, not as a base64 substring: base64 encodes in three-byte groups, so the
    // filler does not survive as a searchable run of characters. This asserts the trap is
    // actually present, so the test cannot pass merely for want of it.
    expect(atob(opensshBody("ssh-ed25519", "ECECECECECECECEC"))).toContain("EC");
    expect(detectKeyType(key)).toBe("ssh-ed25519");
  });

  it("matches the longest algorithm name, not the prefix of one", () => {
    // "sk-ssh-ed25519@openssh.com" contains "ssh-ed25519"; reading it as the plain type
    // would mislabel a hardware-backed key as an ordinary one.
    expect(detectKeyType(opensshKey("sk-ssh-ed25519@openssh.com"))).toBe(
      "sk-ssh-ed25519@openssh.com",
    );
  });

  it("returns the unknown placeholder when nothing identifies the key", () => {
    expect(detectKeyType("")).toBe("ssh-key");
    expect(detectKeyType("not a key at all")).toBe("ssh-key");
  });
});

describe("resolveKeyTypeLabel", () => {
  it("labels a detected type", () => {
    expect(resolveKeyTypeLabel({ privateKey: opensshKey("ssh-ed25519") })).toBe("Ed25519");
    expect(resolveKeyTypeLabel({ privateKey: opensshKey("ssh-rsa") })).toBe("RSA");
    expect(resolveKeyTypeLabel({ privateKey: opensshKey("ecdsa-sha2-nistp384") })).toBe(
      "ECDSA P-384",
    );
  });

  it("labels a security-key type distinctly", () => {
    expect(
      resolveKeyTypeLabel({ privateKey: opensshKey("sk-ssh-ed25519@openssh.com") }),
    ).toBe("Ed25519-SK");
  });

  it("falls back to a stored keyType when the material says nothing", () => {
    expect(resolveKeyTypeLabel({ keyType: "ed25519" })).toBe("Ed25519");
    // Short forms are what the generator and the older UI stored.
    expect(resolveKeyTypeLabel({ keyType: "ecdsa-521" })).toBe("ECDSA P-521");
  });

  it("hides the badge rather than guessing when the type is unknown", () => {
    expect(resolveKeyTypeLabel({})).toBe("");
    expect(resolveKeyTypeLabel({ keyType: "ssh-key" })).toBe("");
    expect(resolveKeyTypeLabel({ keyType: "unknown" })).toBe("");
    expect(resolveKeyTypeLabel({ keyType: "" })).toBe("");
  });

  it("prefers detected material over a stored type", () => {
    // A stored type can be stale or wrong; the key itself is the authority.
    expect(
      resolveKeyTypeLabel({ keyType: "rsa", privateKey: opensshKey("ssh-ed25519") }),
    ).toBe("Ed25519");
  });
});
