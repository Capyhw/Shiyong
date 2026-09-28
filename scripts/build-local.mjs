import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// 单独保存本地验证产物，避免覆盖不含 DevTools 的发布包。
const targetDir = fileURLToPath(
  new URL("../src-tauri/target/local/", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url),
    ),
    "build",
    "--features",
    "tauri/devtools",
    "--config",
    '{"bundle":{"createUpdaterArtifacts":false}}',
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    stdio: "inherit",
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
