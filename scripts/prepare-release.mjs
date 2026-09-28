import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const repo = process.env.GITHUB_REPOSITORY ?? "Capyhw/Shiyong";
assert.equal(repo, "Capyhw/Shiyong");
const output = "release-assets";
mkdirSync(output, { recursive: true });
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)],
  );
const platforms = {};
for (const [target, platform, suffix, extension] of [
  ["aarch64-apple-darwin", "darwin-aarch64", "macos-arm64", ".app.tar.gz"],
  ["x86_64-apple-darwin", "darwin-x86_64", "macos-x64", ".app.tar.gz"],
  ["x86_64-pc-windows-msvc", "windows-x86_64", "windows-x64", ".exe"],
]) {
  const files = walk(`artifacts/${target}`);
  const one = (ext) => {
    const matches = files.filter((file) => file.endsWith(ext));
    assert.equal(matches.length, 1, `Expected one ${ext} for ${target}`);
    return matches[0];
  };
  const file = one(extension);
  const signature = readFileSync(`${file}.sig`, "utf8").trim();
  assert.ok(signature.length > 40, `Missing signature for ${target}`);
  const name = `Shiyong_${version}_${suffix}${extension}`;
  copyFileSync(file, join(output, name));
  copyFileSync(`${file}.sig`, join(output, `${name}.sig`));
  platforms[platform] = {
    signature,
    url: `https://github.com/${repo}/releases/download/v${version}/${name}`,
  };
  if (extension === ".app.tar.gz")
    copyFileSync(one(".dmg"), join(output, `Shiyong_${version}_${suffix}.dmg`));
}
const notes = readFileSync("docs/release-notes.md", "utf8");
writeFileSync(
  join(output, "latest.json"),
  JSON.stringify(
    { version, notes, pub_date: new Date().toISOString(), platforms },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared signed updates for ${Object.keys(platforms).join(", ")}`);
