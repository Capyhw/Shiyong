# 原生应用协议 v1

目录 `installationMode: managed` 表示桌面安装适配器托管，旧 `external` 仍只打开发布页。API 不保存用户安装状态。

## 发布

稳定 tag 与 Info.plist 版本一致，例如 `v0.5.0`。NetSplit CI 固定 arm64，保留 DMG/PKG，新增：

- `NetSplit-0.5.0-macos-arm64.zip`，根目录只有 `NetSplit.app`，不含符号链接。
- `shiyong-macos-arm64.json`：schemaVersion、id、version、platform、arch、asset、sha256、bundleId、appBundle、executable、lifecycleVersion。

拾用从 `https://github.com/Capyhw/NetSplit/releases/latest/download/shiyong-macos-arm64.json` 读取稳定版清单，再下载对应确定 tag 的 ZIP。仓库、应用标识和程序路径在 Rust 中固定，不接受目录下发任意执行路径。缺包、断网和校验失败不会覆盖现有安装。

## 生命周期

- `--shiyong-protocol`：打印 `1`，不打开窗口或修改网络。
- `--shiyong-can-open`：检查其他位置的实例；拒绝误打开手动安装的旧版本。
- `--shiyong-prepare-update`：退出同一路径实例，保留网络状态；其他安装位置有实例运行则失败。
- `--shiyong-uninstall`：退出实例，恢复本应用保存的服务顺序及新增主机路由，撤销登录启动。非零退出或取消授权时保留应用。

网络修改使用进程间锁，修改前原子保存恢复记录，失败保留记录供重试。无记录不猜测服务顺序。新格式使用 JSON，兼容旧键值记录。卸载保留个人设置。

安装在用户应用数据目录，staging 完成校验后才替换。receipt 与 app 同时移动；失败回滚，下次启动恢复中断的 backup。`/Applications` 中已有安装不被覆盖或删除。

## 本地验证

先在 NetSplit 运行 `bash macos/test.sh` 和 `./macos/build.sh toolbox`。构建完成后在拾用运行：

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib local_package_validates_and_extracts -- --ignored
```

真实包测试仅验证解压、哈希、bundle 信息、签名完整性和协议输出。管理员授权恢复与线上安装成功需要新 Release 后实机验收。
