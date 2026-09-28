# 项目约定

- 使用中文沟通。这是个人项目，Git 提交不要求企业任务号。
- 本地桌面验证统一使用 `pnpm desktop:build:local` 生成的 Release + DevTools 包；macOS 可追加 `--bundles app`。
- 对外发布使用 `pnpm desktop:build` 和 GitHub Release 工作流，禁止默认开启 DevTools。
- 本地验证产物与发布产物分目录，更新签名私钥不能进入仓库或日志。
- 版本号保持 package.json、Cargo.toml / Cargo.lock、tauri.conf.json 一致；流程见 docs/releases.md。
