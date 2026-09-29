#!/usr/bin/env node
/**
 * Bumps the product version everywhere it is written down.
 *
 * Five places carry it: `tauri.conf.json`, `Cargo.toml`, the client and server
 * `package.json` files, and `Cargo.lock` — which pins this crate's own version, so leaving it
 * behind makes the next `cargo` run show up as an unrelated diff. They drifted apart easily
 * while that was five manual edits.
 *
 *   node scripts/bump-version.mjs 0.1.2          # write it
 *   node scripts/bump-version.mjs --check 0.1.2  # verify only, change nothing
 *
 * The release workflow keeps its own inline version check rather than calling this one. It
 * runs against a tag, and a tag cut before this script existed would not contain it — so the
 * two have to be able to stand alone. They check the same five places.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Order matters only for the report. Each pattern must capture the value in group 2, so the
 * replacement is `$1<new>$3` and nothing else in the file is touched.
 */
const TARGETS = [
  {
    label: "tauri.conf.json",
    file: "packages/client/src-tauri/tauri.conf.json",
    pattern: /("version"\s*:\s*")([^"]+)(")/,
  },
  {
    label: "Cargo.toml",
    file: "packages/client/src-tauri/Cargo.toml",
    pattern: /^(version\s*=\s*")([^"]+)(")/m,
  },
  {
    label: "Cargo.lock",
    file: "packages/client/src-tauri/Cargo.lock",
    pattern: /(name = "termix"\nversion = ")([^"]+)(")/,
  },
  {
    label: "client package.json",
    file: "packages/client/package.json",
    pattern: /("version"\s*:\s*")([^"]+)(")/,
  },
  {
    label: "server package.json",
    file: "packages/server/package.json",
    pattern: /("version"\s*:\s*")([^"]+)(")/,
  },
];

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const version = argv.find((arg) => !arg.startsWith("--"));

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("usage: node scripts/bump-version.mjs [--check] <version>");
  console.error("       version looks like 0.1.2 or 0.2.0-rc.1");
  process.exit(2);
}

const current = [];
let failed = false;

for (const target of TARGETS) {
  const path = join(ROOT, target.file);
  const source = readFileSync(path, "utf8");
  const match = target.pattern.exec(source);

  if (!match) {
    // Louder than a silent no-op: a pattern that stops matching means the file changed shape,
    // and skipping it would leave one version behind while reporting success.
    console.error(`  FAIL ${target.label}: no version found — has the file's shape changed?`);
    failed = true;
    continue;
  }

  const found = match[2];
  current.push(found);

  if (checkOnly) {
    console.log(`  ${found === version ? "ok  " : "FAIL"} ${target.label.padEnd(20)} ${found}`);
    if (found !== version) failed = true;
    continue;
  }

  const updated = source.replace(target.pattern, `$1${version}$3`);
  writeFileSync(path, updated);
  console.log(`  ${found === version ? "=   " : "->  "} ${target.label.padEnd(20)} ${found} -> ${version}`);
}

if (checkOnly) {
  if (failed) {
    console.error(`\nNot every version is ${version}.`);
    process.exit(1);
  }
  console.log(`\nAll ${TARGETS.length} places agree on ${version}.`);
  process.exit(0);
}

if (failed) {
  process.exit(1);
}

const before = current[0];
console.log(`\n${before} -> ${version} in ${TARGETS.length} places.`);
console.log("\nnext:");
console.log(`  git add -A && git commit -m "chore(release): ${version}"`);
console.log("  git push origin main        # let CI pass before tagging — the release requires it");
console.log(`  git tag v${version} && git push origin v${version}`);
