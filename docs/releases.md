# 拾用发布与更新

仓库：https://github.com/Capyhw/Shiyong

更新入口：https://github.com/Capyhw/Shiyong/releases/latest/download/latest.json

## 本地验证与发布包

- 本地桌面验证统一用 `pnpm desktop:build:local`；macOS 仅构建 app 可追加 `--bundles app`。Release 优化、DevTools 开启、正式 API，输出在 `src-tauri/target/local/release/bundle/`。
- 本地包不生成用于发布的更新签名资产，不需要私钥；应用内检查更新仍访问正式 Release。
- 发布用 `pnpm desktop:build`，不启用 DevTools；输出在 `src-tauri/target/release/bundle/`。签名更新资产需要 `TAURI_SIGNING_PRIVATE_KEY` 环境变量。
- 两种包共用应用数据且只允许一个实例。切换前先退出旧实例。安装正式更新会替换当前运行的 app，更新后的正式版不带 DevTools。

## 发布新版本

1. 同步修改 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本（例如 `0.1.1`），更新 Cargo.lock 中本包版本。
2. 更新 `docs/release-notes.md`，运行 `pnpm test`、`pnpm typecheck` 和 `cargo test --manifest-path src-tauri/Cargo.toml`。
3. 提交并推送 main，然后创建并推送对应 `v0.1.1` 标签。
4. GitHub Actions 分别构建 macOS arm64 / x64（DMG 和 app.tar.gz）及 Windows x64（NSIS EXE），生成更新签名。
5. 全部构建成功后汇总安装包和签名，生成同时包含三平台的 latest.json，再公开 Release。失败不会公开不完整更新；已公开版本不能覆盖，需发布新版本。

Actions 也支持手动运行：输入已存在的版本标签。只重试尚未公开的版本，不要重打已公开标签。

## 更新信任与权限

- 更新公钥固化在 Tauri 配置中；私钥只在仓库 Actions Secret `TAURI_SIGNING_PRIVATE_KEY` 内使用，不提交 Git。
- 本机私钥备份为 `~/.tauri/shiyong.key`，权限 0600，必须安全备份。丢失后现有安装将无法验证使用新密钥签名的更新。
- 更新权限和重启权限仅授予本地 `main` 窗口；主菜单与远程网页不具备更新权限。
- 更新插件验证签名成功后才安装；仅检查不会自动安装。用户点击“下载并安装，重启拾用”后开始升级，需先保存网页工作。
- Windows 安装器会退出应用并重启；macOS 替换 app 后主动重启。安装包与用户设置、收藏及托管应用数据分离。
- 更新签名不是操作系统代码签名。目前尚未配置 Developer ID / Apple 公证或 Windows 代码签名。
- macOS 目前采用完整应用包 ad-hoc 签名（`signingIdentity: "-"`），CI 运行 `codesign --verify --deep --strict` 检查。未来配置 Developer ID 时替换此签名身份。
- macOS 请先将 app 安装到“应用程序”或其他可写位置，再使用更新；不要在只读 DMG 中升级。

## 验证边界

三平台 CI 成功表示安装包可以构建，不代表 Windows / Intel Mac 的交互升级已在实机验证。首个版本没有更高版本时，“检查更新”应显示已是最新版本；完整升级需要旧版到新版的实际验证。
