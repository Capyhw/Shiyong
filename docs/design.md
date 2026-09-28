# 拾用界面约定

## macOS 窗口与材质

Tauri 2.12 的 `windowEffects` 使用原生 Liquid Glass。macOS 专用配置在 `src-tauri/tauri.macos.conf.json`，由 Tauri 自动合并；其中 windows 是完整数组，新增窗口或调整尺寸时需与基础配置同步。

- 主窗口：`liquidGlassRegular`，macOS 15 及以下回退 `sidebar`；Overlay 标题栏保留真实红黄绿按钮，左侧预留 56px 标题栏空间。
- 主菜单：640 × 420，24px 圆角，`liquidGlassRegular`，旧系统回退 `hudWindow`。
- 两个窗口开启 `interactive`，仅 macOS 27 及以上生效。
- `backgroundColor: "#00000000"` 让 WebView 背景透出原生材质。HTML 根背景也必须透明，仅在 macOS 桌面端使用。
- 主窗口和启动器共用 `configure_glass_content`，通过 `with_webview` 在主线程把 WKWebView 传给 `LiquidGlassOptions.content_view`，由官方库挂入玻璃容器并裁切，遵循 [window-vibrancy #199](https://github.com/tauri-apps/window-vibrancy/pull/199) 和官方 Tauri 示例。先清除配置创建的玻璃，避免重复叠加；旧系统没有玻璃时分别保留 `sidebar` / `hudWindow` 回退。各窗口的半径、交互和颜色仍读取自身 `windowEffects` 配置；原生标题栏及红黄绿按钮保留在窗口层，WebView 随玻璃容器自动缩放。
- 保留 AppKit `NSWindow.setOpaque(false)` 以参与透明合成，重新启用原生阴影并调用 `invalidateShadow()`；不再对窗口根 `contentView` 施加圆角遮罩。`with_webview` 涉及原生接口，Tauri 限定在 2.12.x，window-vibrancy 使用与其相同的 0.8.1，升级时需复核接入。
- 原生玻璃作为窗口底层，侧栏、工具栏和启动器添加少量明暗遮罩保证文字可读；内容区和应用卡片使用实色。浏览器与 Windows 使用普通表面回退。
- 通过 `data-tauri-drag-region` 拖动窗口；窗口拖动和外观权限仅授予本地 main、launcher，远程应用保持原权限边界。

## 排版与布局

系统字体优先使用 macOS San Francisco / 苹方。正文左对齐；石墨色正文 `#202124`、次要文字 `#68686d`、内容底色 `#f8f8fa`、纸面 `#ffffff`、强调色 `#0069d9`、浅强调 `#e5effb`。深色使用语义变量整体替换。

左侧为应用中心、我的应用、收藏与底部设置；右侧为统一工具栏、页面标题、筛选和应用。去掉说明性营销插图，优先展示工具。支持图标/列表切换；搜索位于工具栏。应用图标保留 API URL，加载失败回退 Lucide Blocks，操作图标统一使用 Lucide。

## 交互

- 添加不自动收藏，移除同时取消收藏；网页应用“添加/移除”，托管独立应用“安装/卸载”。删除确认继续使用 HTML dialog，保留焦点约束。
- 主菜单只搜索我的应用，收藏优先。输入框用 combobox/listbox 语义；方向键选择、Enter 打开、Esc 关闭，鼠标可以选择结果。中文输入法组词期间不触发快捷操作。
- 主窗口 `⌘F`（Windows 为 Ctrl+F）聚焦搜索，Esc 清空搜索并退出输入；`⌘,`（Ctrl+,）打开设置。原有 `⌥Space` / Alt+Space 全局快捷键保持不变。
- 外观支持跟随系统、浅色、深色。新用户默认跟随系统；已有明确的浅色/深色设置保留。WebView 内容和原生窗口外观同步，两个宿主窗口通过原有存储同步。
- 保持可见键盘焦点，支持减少动态效果、减少透明度和增强对比度；桌面最小窗口为 760 × 580，同时保留浏览器窄屏布局。

## 本次验证

使用 `pnpm desktop:build:local --bundles app` 构建 macOS Release + DevTools 包，实际打开本地 app 检查窗口与启动器。浏览器验证搜索、收藏、视图切换、外观跟随系统、启动器方向键和 Esc，以及 760px / 375px 布局。Windows 与旧版 macOS 材质回退未做实机验证。
