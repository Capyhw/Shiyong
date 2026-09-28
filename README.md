# 拾用

面向 macOS 和 Windows 的桌面工具箱。一个菜单栏/托盘入口，按需添加应用，收藏常用工具，在独立窗口中使用。

技术栈：Tauri 2、React、TypeScript、Vite。应用中心接入 `nextjs-boilerplate` 的只读目录 API，应用图标直接使用接口的 `iconUrl`；界面操作图标使用 Lucide。

## 开发

```sh
pnpm install
pnpm dev
```

前端预览：http://127.0.0.1:1420 。浏览器模式会用浏览器独立窗口模拟打开应用，不具备系统托盘或全局快捷键。

- 开发时默认目录：`http://localhost:7854/api/toolbox/catalog`，需要先启动旁边的 Next.js 工具站。
- 生产构建默认目录：`https://www.captain-space.top/api/toolbox/catalog`，需先将目录 API 与图标资源部署到该网站。
- 设置页不提供目录地址配置。仅开发环境可通过 `VITE_CATALOG_URL` 切换联调服务，模板见 `.env.example`；生产构建固定使用官方目录，忽略此变量及历史用户设置中的目录地址。
- 目录返回的网页、图标 URL 按原样使用；开发接口若返回正式域名，工具页面和图标也会从正式站点加载。需要全本地联调时，在工具站使用其已有 `NEXT_PUBLIC_SITE_URL=http://localhost:7854`，并重启工具站服务。拾用不覆盖站点配置。

## 桌面运行

先安装 [Tauri 的系统前置依赖](https://v2.tauri.app/start/prerequisites/)：macOS 需要 Rust 和 Xcode Command Line Tools；Windows 需要 Rust、Microsoft C++ Build Tools 与 WebView2。

```sh
pnpm desktop:dev
# 本地桌面验证：Release 优化构建，启用 DevTools，使用正式 API
pnpm desktop:build:local
# 对外发布：Release 优化构建，不启用 DevTools
pnpm desktop:build
```

后续本地桌面验证统一使用 `desktop:build:local` 的产物。打开应用后右键选择“检查元素”即可使用 WebView 开发者工具。仅需 macOS 应用、不生成 DMG 时，可运行 `pnpm desktop:build:local --bundles app`。

本地命令只为本次编译启用 `tauri/devtools`，不修改 Cargo 默认功能；产物独立存放在 `src-tauri/target/local/release/bundle/`。普通 `desktop:build` 产物仍在 `src-tauri/target/release/bundle/`，不包含 DevTools。两个包共用现有应用数据，切换验证前先退出正在运行的拾用。

桌面端代码包含：

- 单实例运行，一个菜单栏/系统托盘图标。
- 左键点击图标或 `Option/Alt + Space` 呼出主菜单；右键菜单打开应用中心或退出。
- 应用中心关闭后隐藏，主菜单失焦隐藏；退出需使用托盘菜单。
- 每个网页应用打开独立普通 WebView 窗口，重复打开聚焦已有窗口。
- 主菜单搜索、方向键选择、Enter 打开、Escape 关闭。
- 快捷键注册冲突会在设置页提示；菜单栏仍可使用。

### 权限边界

`build.rs` 显式登记宿主命令，capability 仅授予本地 `main` 和 `launcher` 窗口，且命令再次检查调用窗口标签。远程网页不授予系统能力。网页窗口只允许在最初的网站来源内导航，跨来源登录、外链及弹窗尚需专门适配；不开放任意系统命令和文件权限。

## 当前功能范围

- 应用中心：实时 API、分类、搜索、刷新、图标失败占位。
- 我的应用：添加和移除网页入口；确认移除后也取消收藏，保留网页数据。
- 收藏列表：只展示主动收藏的已添加应用。
- 用户设置与目录缓存持久化；同一宿主的窗口通过 storage 事件同步设置。
- 完整响应刷新、超时提示、失败保留本地缓存；目录下架不自动删除用户应用快照。
- 浅色/深色外观。

应用中心合并展示网站的 9 个网页工具和 NetSplit，网站首页仍只显示网页工具。

NetSplit 已接入托管安装：从自己的 GitHub Release 下载清单与 ZIP，校验 SHA-256、包结构、签名完整性、版本、应用标识和生命周期协议，再原子替换安装目录。界面展示下载进度，支持打开、收藏、检查更新和卸载；失败保留旧版本。浏览器预览不模拟安装成功。

安装目录是 Tauri `app_data_dir/native-apps/net-split`，macOS 通常是 `~/Library/Application Support/top.captain-space.shiyong/native-apps/net-split`。安装状态来自后端收据及文件检查，localStorage 只保存展示快照和收藏。不会接管 `/Applications` 中已有的独立安装。

目前仅接入 macOS arm64 的 NetSplit。新增独立应用需要客户端安装适配器，不能仅凭目录执行任意程序。卸载前调用网络恢复协议，恢复失败或取消系统授权则保留应用；用户设置保留。普通关闭 NetSplit 窗口不恢复网络。

**发布依赖**：NetSplit 已发布带 `shiyong-macos-arm64.json` 和 ZIP 的 Release，正式目录 API 已接入。后续独立应用版本也需提供这些发布资产，缺少时会明确报错。清单使用 Release 稳定下载入口，不消耗 GitHub REST API 的匿名查询配额。详见 [原生应用协议](docs/native-apps.md)。

远程网页自身仍需做好桌面展示模式、加载失败提示与文件导入导出兼容性，不能将通用 WebView 壳等同于所有工具已通过桌面适配。

## 验证

```sh
pnpm test
pnpm typecheck
pnpm build
# 安装 Rust 后在对应系统验证
cd src-tauri
cargo test
cargo check
```

验证覆盖前端协议/偏好测试、类型检查、前端构建、macOS Rust 编译，清单与包哈希、越界路径拒绝、原子替换/回滚，以及真实 NetSplit ZIP 的解压与协议检查。恢复测试使用临时状态目录，不修改真实网络。管理员授权恢复、完整线上安装成功链路和 Windows 实机仍需验证。

NetSplit 当前使用 ad-hoc 签名，SHA-256 校验和签名完整性检查不等同于 Developer ID 签名或 Apple 公证。拾用支持在设置中检查更新、下载并安装后重启；更新包有独立签名校验，操作系统代码签名和公证尚未配置。

GitHub Release 自动构建 macOS arm64 / x64 和 Windows x64 安装包，全部成功后发布更新清单。发布流程、密钥备份和验证边界见 [发布与更新](docs/releases.md)。

原型与早期架构记录位于相邻的 `../tools/toolbox/`，本项目是独立实现，不依赖原型运行。

### 本机调试产物

本地 Release 验证包位于 `src-tauri/target/local/release/bundle/macos/拾用.app`，启用 DevTools；普通发布构建位于 `src-tauri/target/release/bundle/macos/拾用.app`，关闭 DevTools。此前的 debug 调试构建位于 `src-tauri/target/debug/bundle/macos/拾用.app`。Release 优化构建尚不等同于已完成 Developer ID 签名、公证和对外发布。打包后的应用使用官方目录；连接本机目录请使用 `desktop:dev`。

如需在这台机器继续使用本次临时工具链（目录清理后不可用），可执行：

```sh
RUSTUP_HOME=/tmp/shiyong-rust/rustup CARGO_HOME=/tmp/shiyong-rust/cargo PATH=/tmp/shiyong-rust/cargo/bin:$PATH pnpm desktop:dev
```

已有 `pnpm dev` 进程占用 1420 端口时，应先停止它，再启动会自行管理 Vite 的 `desktop:dev`。正常长期开发建议按官方前置依赖文档安装 Rust。


目录刷新不发送 `If-None-Match`，并关闭 WebView HTTP 缓存：线上 Vercel 部署返回的 304 曾缺失 CORS 响应头，导致 `tauri://localhost` 跨域读取失败。离线展示使用应用自己的目录缓存；服务端仍可缓存完整的 200 响应。
