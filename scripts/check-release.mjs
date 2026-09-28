import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const tag = process.argv[2];
assert.match(tag ?? "", /^v\d+\.\d+\.\d+$/);
assert.equal(tag, `v${pkg.version}`, "Tag must match package.json");
assert.equal(config.version, pkg.version, "Tauri version mismatch");
assert.equal(
  cargo.match(/^version = "([^"]+)"/m)?.[1],
  pkg.version,
  "Cargo version mismatch",
);
assert.equal(config.bundle.createUpdaterArtifacts, true);
assert.ok(config.plugins.updater.pubkey);
const features = execFileSync(
  "cargo",
  ["tree", "--locked", "-e", "features", "-i", "tauri"],
  { cwd: "src-tauri", encoding: "utf8" },
);
assert.ok(
  !features.includes('tauri feature "devtools"'),
  "Release must not enable DevTools",
);
console.log(
  `Validated ${tag}: versions aligned, signed updater enabled, DevTools disabled.`,
);
