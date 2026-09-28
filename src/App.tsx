import { useEffect, useRef, useState } from "react";
import {
  Blocks,
  LayoutGrid,
  Compass,
  Settings,
  Star,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Moon,
  Sun,
  Globe,
  List,
  Monitor,
  ChevronRight,
  AlertCircle,
  Check,
  Keyboard,
  PackageOpen,
  Download,
} from "lucide-react";
import { type WebApp, type CatalogApp, type NativeApp } from "./catalog";
import {
  usePreferences,
  updatePreferences,
  removeApp,
  type Preferences,
} from "./store";
import { useCatalog } from "./useCatalog";
import {
  desktop,
  openApp,
  openRelease,
  showManager,
  showLauncher,
  hideLauncher,
  getRuntimeStatus,
  installNative,
  uninstallNative,
} from "./desktop";

import { resolveMyApps } from "./preferences";
import { useNativeApps, progressLabel } from "./useNativeApps";
import { AppUpdate } from "./AppUpdate";
import { appUpdater, isUpdating } from "./updater";
import { useAppearance } from "./appearance";
import { version } from "../package.json";

const standaloneLauncher =
  new URLSearchParams(location.search).get("view") === "launcher";
const platform = /Mac/.test(navigator.userAgent) ? "macos" : "windows";
document.documentElement.dataset.surface =
  desktop && platform === "macos" ? "macos" : "web";
document.documentElement.dataset.view = standaloneLauncher
  ? "launcher"
  : "manager";
const shortcutLabel = platform === "macos" ? "⌥ Space" : "Alt + Space";
function AppIcon({ app, small = false }: { app: CatalogApp; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [app.iconUrl]);
  return (
    <span className={`app-icon ${small ? "small" : ""}`}>
      {failed ? (
        <Blocks aria-hidden="true" />
      ) : (
        <img
          src={app.iconUrl}
          width="26"
          height="26"
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export default function App() {
  const prefs = usePreferences();
  const { data, loading, error, refresh } = useCatalog();
  const [page, setPage] = useState<"center" | "mine" | "settings">(
    prefs.apps.length ? "mine" : "center",
  );
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const searchInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("all");
  const [toast, setToast] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [launcher, setLauncher] = useState(false);
  const [removing, setRemoving] = useState<CatalogApp | null>(null);
  const [shortcutAvailable, setShortcutAvailable] = useState(false);
  const native = useNativeApps();
  const [nativePending, setNativePending] = useState<string | null>(null);
  const [nativeError, setNativeError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [arch, setArch] = useState<string>();
  const nativeBusy = nativePending !== null || native.progress !== null;
  const dialog = useRef<HTMLDialogElement>(null);
  const launcherDialog = useRef<HTMLDialogElement>(null);
  const allApps = data?.catalog.apps ?? [];
  // 保留已添加的快照：远端目录下架或暂不可用不影响用户自己的列表。
  const isInstalled = (id: string) =>
    native.installed.some((item) => item.id === id);
  const myApps = resolveMyApps(
    prefs,
    allApps,
    native.installed.map((item) => item.id),
  );
  const favorites = prefs.favorites
    .map((id) => myApps.find((app) => app.id === id))
    .filter((app): app is CatalogApp => Boolean(app));
  const visible = (page === "mine" ? myApps : allApps).filter(
    (app) =>
      (category === "all" ||
        page === "mine" ||
        app.categoryIds.includes(category)) &&
      `${app.name} ${app.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  useAppearance(prefs.theme);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (removing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [removing]);
  useEffect(() => {
    if (launcher) launcherDialog.current?.showModal();
    else launcherDialog.current?.close();
  }, [launcher]);
  useEffect(() => {
    getRuntimeStatus()
      .then((status) => {
        setShortcutAvailable(status.shortcutAvailable);
        setArch(status.arch);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "," &&
        !standaloneLauncher
      ) {
        event.preventDefault();
        if (!dialog.current?.open && !launcherDialog.current?.open)
          navigate("settings");
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !standaloneLauncher
      ) {
        if (
          searchInput.current &&
          !dialog.current?.open &&
          !launcherDialog.current?.open
        ) {
          event.preventDefault();
          searchInput.current.focus();
          searchInput.current.select();
        }
      }
      if (event.altKey && event.code === "Space" && !desktop) {
        event.preventDefault();
        setLauncher((old) => !old);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function update(change: (old: Preferences) => Preferences) {
    try {
      updatePreferences(change);
      return true;
    } catch {
      setToast("未能保存设置，请检查本地存储空间");
      return false;
    }
  }
  function add(app: WebApp) {
    if (
      update((old) => ({
        ...old,
        apps: old.apps.some((a) => a.id === app.id)
          ? old.apps
          : [...old.apps, app],
      }))
    )
      setToast(`已添加「${app.name}」`);
  }
  function favorite(app: CatalogApp) {
    update((old) => ({
      ...old,
      apps: old.apps.some((item) => item.id === app.id)
        ? old.apps
        : [...old.apps, app],
      favorites: old.favorites.includes(app.id)
        ? old.favorites.filter((id) => id !== app.id)
        : [...old.favorites, app.id],
    }));
  }
  async function download(app: NativeApp) {
    if (isUpdating(appUpdater.getSnapshot().phase)) {
      setToast("拾用正在升级，请稍后管理应用");
      return;
    }
    if (app.installationMode === "external") {
      try {
        await openRelease(app);
      } catch (error) {
        setToast(String(error));
      }
      return;
    }
    setNativePending(app.id);
    setNativeError(null);
    try {
      const previous = native.installed.find((item) => item.id === app.id);
      const installed = await installNative(app);
      update((old) => ({
        ...old,
        apps: [...old.apps.filter((item) => item.id !== app.id), app],
      }));
      setToast(
        previous?.version === installed.version
          ? "已是最新版本"
          : `「${app.name}」${installed.version} 安装完成`,
      );
    } catch (error) {
      setNativeError({
        id: app.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await native.reload();
      setNativePending(null);
    }
  }
  async function remove() {
    if (!removing) return;
    if (isUpdating(appUpdater.getSnapshot().phase)) {
      setToast("拾用正在升级，请稍后管理应用");
      return;
    }
    const app = removing;
    if (app.type === "native") {
      setNativePending(app.id);
      setNativeError(null);
      try {
        await uninstallNative(app);
        update((old) => removeApp(old, app.id));
        setRemoving(null);
        setToast(`已卸载「${app.name}」，个人设置已保留`);
      } catch (error) {
        setNativeError({ id: app.id, message: String(error) });
      } finally {
        await native.reload();
        setNativePending(null);
      }
    } else if (update((old) => removeApp(old, app.id))) {
      setToast(`已移除「${app.name}」`);
      setRemoving(null);
    }
  }
  async function launch(app: CatalogApp) {
    if (app.type === "native" && nativeBusy) return;
    if (!app.platforms.includes(platform)) {
      setToast("这个应用暂不支持当前系统");
      return;
    }
    setOpening(app.id);
    try {
      await openApp(app);
      setLauncher(false);
      if (standaloneLauncher) await hideLauncher();
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(null);
    }
  }
  function navigate(next: typeof page) {
    setPage(next);
    setQuery("");
    setCategory("all");
  }
  async function summon() {
    if (!desktop) {
      setLauncher(true);
      return;
    }
    try {
      await showLauncher();
    } catch {
      setToast("主菜单暂时无法打开");
    }
  }
  const launchMenu = (
    <Launcher
      apps={myApps}
      favorites={prefs.favorites}
      launch={launch}
      opening={opening}
      close={() => {
        setLauncher(false);
        if (standaloneLauncher) void hideLauncher();
      }}
      manager={() => {
        if (standaloneLauncher) void showManager();
        else {
          setLauncher(false);
          navigate("center");
        }
      }}
    />
  );
  if (standaloneLauncher)
    return (
      <div className="launcher-window">
        {launchMenu}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-titlebar" data-tauri-drag-region />
        <div className="brand">
          <span className="brand-icon">
            <Blocks aria-hidden="true" />
          </span>
          <div>
            <strong>拾用</strong>
            <span>你的随身工具箱</span>
          </div>
        </div>
        <nav aria-label="主导航">
          <button
            className={page === "center" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("center")}
            aria-current={page === "center" ? "page" : undefined}
          >
            <Compass aria-hidden="true" />
            <span>应用中心</span>
          </button>
          <button
            className={page === "mine" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("mine")}
            aria-current={page === "mine" ? "page" : undefined}
          >
            <LayoutGrid aria-hidden="true" />
            <span>我的应用</span>
            <small>{myApps.length}</small>
          </button>
        </nav>
        <div className="favorites-head">
          <span>收藏</span>
          <Star size={13} aria-hidden="true" />
        </div>
        <div className="favorites-list">
          {favorites.length ? (
            favorites.map((app) => (
              <button
                key={app.id}
                className="favorite-link"
                onClick={() => void launch(app)}
              >
                <AppIcon app={app} small />
                <span>{app.name}</span>
              </button>
            ))
          ) : (
            <p className="favorites-empty">
              收藏常用应用，
              <br />
              下次从这里打开。
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("settings")}
            aria-current={page === "settings" ? "page" : undefined}
          >
            <Settings aria-hidden="true" />
            <span>设置</span>
          </button>
          <div className="version">
            <span>拾用 {version}</span>
            <span>
              {desktop
                ? platform === "macos"
                  ? "macOS"
                  : "Windows"
                : "浏览器预览"}
            </span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="toolbar" data-tauri-drag-region>
          <div className="toolbar-title" data-tauri-drag-region>
            {page === "center"
              ? "应用中心"
              : page === "mine"
                ? "我的应用"
                : "设置"}
          </div>
          <div className="toolbar-actions">
            {page !== "settings" && (
              <label className="search">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={searchInput}
                  aria-label="搜索应用"
                  placeholder="搜索"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setQuery("");
                      event.currentTarget.blur();
                    }
                  }}
                />
                <kbd>{platform === "macos" ? "⌘ F" : "Ctrl F"}</kbd>
              </label>
            )}
            <button
              className="launcher-trigger"
              onClick={() => void summon()}
              title={`打开主菜单（${shortcutLabel}）`}
            >
              <Search size={16} aria-hidden="true" />
              <span>快速打开</span>
              <kbd>{shortcutLabel}</kbd>
            </button>
          </div>
        </header>
        <div className="content" key={page}>
          {page === "settings" ? (
            <SettingsPage
              shortcutAvailable={shortcutAvailable}
              nativeBusy={nativeBusy}
              theme={prefs.theme}
              setTheme={(theme) => update((old) => ({ ...old, theme }))}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>{page === "center" ? "发现好工具" : "我的应用"}</h1>
                  <p>
                    {page === "center"
                      ? "为日常的小事，找到顺手的应用。"
                      : `${myApps.length} 个应用，随时为你所用。`}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="刷新应用目录"
                  disabled={loading}
                  onClick={() => {
                    refresh();
                    void native.reload();
                  }}
                >
                  <RefreshCw className={loading ? "spinning" : ""} />
                </button>
              </div>
              {native.error && (
                <div className="notice" role="alert">
                  安装状态读取失败：{native.error}
                  <button onClick={() => void native.reload()}>重试</button>
                </div>
              )}
              {error && (
                <div className="notice" role="status">
                  <AlertCircle size={17} />
                  <span>
                    {data
                      ? "暂时无法更新，正在展示已缓存目录。"
                      : "应用目录加载失败。"}{" "}
                    {error}
                  </span>
                  <button
                    onClick={() => {
                      refresh();
                      void native.reload();
                    }}
                    disabled={loading}
                  >
                    重试
                  </button>
                </div>
              )}
              <div className="list-toolbar">
                <div className="categories" aria-label="应用分类">
                  <button
                    aria-pressed={category === "all"}
                    onClick={() => setCategory("all")}
                  >
                    全部应用{" "}
                    <small>
                      {page === "mine" ? myApps.length : allApps.length}
                    </small>
                  </button>
                  {page === "center" &&
                    data?.catalog.categories.map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={category === item.id}
                        onClick={() => setCategory(item.id)}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
                <div className="view-switch" role="group" aria-label="显示方式">
                  <button
                    aria-label="图标视图"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <LayoutGrid />
                  </button>
                  <button
                    aria-label="列表视图"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    <List />
                  </button>
                </div>
              </div>
              {loading && !data && page === "center" ? (
                <div className="empty" role="status">
                  <RefreshCw className="spinning" />
                  <h2>正在获取应用目录</h2>
                  <p>连接你的工具，让常用应用触手可及。</p>
                </div>
              ) : visible.length ? (
                <div
                  className={`app-grid ${layout === "list" ? "app-list" : ""}`}
                >
                  {visible.map((app) => {
                    const added =
                      app.type === "native"
                        ? isInstalled(app.id)
                        : prefs.apps.some((saved) => saved.id === app.id);
                    const supported =
                      app.platforms.includes(platform) &&
                      (app.type === "web" ||
                        !desktop ||
                        (arch !== undefined &&
                          app.architectures.includes(arch as "arm64" | "x64")));
                    const starred = prefs.favorites.includes(app.id);
                    return (
                      <article className="app-card" key={app.id}>
                        <div className="card-heading">
                          <AppIcon app={app} />
                          <div>
                            <h2>{app.name}</h2>
                            <span className="kind">
                              {app.type === "native"
                                ? added
                                  ? `独立应用 · ${native.installed.find((item) => item.id === app.id)?.version}`
                                  : "独立应用 · 按需安装"
                                : "网页应用"}
                            </span>
                          </div>
                          {added && (
                            <button
                              className={`icon-button star ${starred ? "selected" : ""}`}
                              aria-label={`${starred ? "取消收藏" : "收藏"}${app.name}`}
                              aria-pressed={starred}
                              onClick={() => favorite(app)}
                            >
                              <Star />
                            </button>
                          )}
                        </div>
                        <p className="description">{app.description}</p>
                        {app.type === "native" && (
                          <p className="native-note">
                            {app.installationMode === "managed"
                              ? desktop
                                ? "独立运行，专注使用。"
                                : "请在拾用桌面版中安装和管理。"
                              : "此应用需前往发布页安装。"}
                          </p>
                        )}
                        {app.type === "native" &&
                          nativeError?.id === app.id && (
                            <p className="field-error" role="alert">
                              {nativeError.message}
                            </p>
                          )}
                        {app.type === "native" &&
                          (nativePending === app.id ||
                            native.progress?.id === app.id) && (
                            <p className="native-note" role="status">
                              {progressLabel(native.progress)}
                            </p>
                          )}
                        <div className="card-footer">
                          <span className="platforms">
                            {app.platforms
                              .map((p) => (p === "macos" ? "macOS" : "Windows"))
                              .join(" / ")}
                            {app.type === "native" &&
                              app.architectures.includes("arm64") &&
                              " · Apple Silicon"}
                          </span>
                          <div className="card-actions">
                            {added && page === "mine" && (
                              <button
                                className="icon-button remove"
                                aria-label={`${app.type === "native" ? "卸载" : "移除"}${app.name}`}
                                disabled={nativeBusy}
                                onClick={() => setRemoving(app)}
                              >
                                <Trash2 />
                              </button>
                            )}
                            {app.type === "native" &&
                              added &&
                              page === "mine" && (
                                <button
                                  className="icon-button"
                                  aria-label={`检查更新${app.name}`}
                                  disabled={nativeBusy}
                                  onClick={() => void download(app)}
                                >
                                  <RefreshCw />
                                </button>
                              )}
                            <button
                              className={`button ${added ? "soft" : "add"}`}
                              disabled={
                                !supported ||
                                opening === app.id ||
                                (app.type === "native" &&
                                  (nativeBusy ||
                                    (app.installationMode === "managed" &&
                                      !desktop)))
                              }
                              onClick={() =>
                                added
                                  ? void launch(app)
                                  : app.type === "native"
                                    ? void download(app)
                                    : add(app)
                              }
                            >
                              {!supported ? (
                                "暂不支持"
                              ) : nativePending === app.id ||
                                native.progress?.id === app.id ? (
                                "处理中…"
                              ) : opening === app.id ? (
                                "打开中…"
                              ) : added ? (
                                <>打开</>
                              ) : app.type === "native" ? (
                                <>
                                  <Download size={14} aria-hidden="true" />
                                  {app.installationMode === "managed"
                                    ? desktop
                                      ? "安装"
                                      : "桌面版安装"
                                    : "前往下载"}
                                </>
                              ) : (
                                <>
                                  <Plus size={14} aria-hidden="true" />
                                  添加
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">
                  <PackageOpen />
                  <h2>
                    {query
                      ? "没有找到匹配的应用"
                      : page === "mine"
                        ? "从第一个趁手的工具开始"
                        : "还没有可展示的应用"}
                  </h2>
                  <p>
                    {query
                      ? "换个关键词，再试一次。"
                      : page === "mine"
                        ? "在应用中心添加你想使用的工具，它们会出现在这里。"
                        : "请检查网络连接，稍后重试。"}
                  </p>
                  {!query && (
                    <button
                      className="button soft"
                      onClick={() =>
                        page === "mine" ? navigate("center") : refresh()
                      }
                    >
                      {page === "mine" ? "浏览应用中心" : "重新加载"}
                    </button>
                  )}
                </div>
              )}
              <footer className="content-footer">
                <span>
                  <Globe size={13} aria-hidden="true" />
                  网页应用需要网络连接
                </span>
                <span>
                  {data
                    ? `目录更新于 ${new Date(data.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                    : "等待连接目录"}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      <dialog
        aria-label="移除应用确认"
        ref={dialog}
        onCancel={(event) => {
          if (nativeBusy) event.preventDefault();
          else setRemoving(null);
        }}
        className="confirm-dialog"
      >
        <form method="dialog" onSubmit={(event) => event.preventDefault()}>
          <span className="dialog-symbol">
            <Trash2 />
          </span>
          <h2>
            {removing?.type === "native" ? "卸载" : "移除"}「{removing?.name}
            」？
          </h2>
          <p>
            {removing?.type === "native"
              ? "将关闭应用并恢复它修改过的网络设置，然后删除安装文件。恢复失败会保留应用；个人设置会保留。"
              : "从我的应用和收藏列表中移除。网页里的数据会保留，你可以随时重新添加。"}
          </p>
          {removing?.type === "native" && nativeError?.id === removing.id && (
            <p className="field-error" role="alert">
              {nativeError.message}
            </p>
          )}
          {nativeBusy && <p role="status">{progressLabel(native.progress)}</p>}
          <div className="dialog-actions">
            <button
              className="button"
              disabled={nativeBusy}
              onClick={() => setRemoving(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={nativeBusy}
              onClick={() => void remove()}
            >
              {nativeBusy
                ? "处理中…"
                : removing?.type === "native"
                  ? "卸载应用"
                  : "移除应用"}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        aria-label="拾用主菜单"
        ref={launcherDialog}
        onCancel={() => setLauncher(false)}
        className="launcher-dialog"
      >
        {launcher && launchMenu}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function SettingsPage({
  shortcutAvailable,
  nativeBusy,
  theme,
  setTheme,
}: {
  shortcutAvailable: boolean;
  nativeBusy: boolean;
  theme: Preferences["theme"];
  setTheme: (theme: Preferences["theme"]) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>设置</h1>
          <p>让拾用成为顺手、安静的工具箱。</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>
          <Sun aria-hidden="true" />
          外观
        </h2>
        <div className="appearance-options" role="group" aria-label="外观模式">
          {(
            [
              { value: "system", label: "跟随系统", Icon: Monitor },
              { value: "light", label: "浅色", Icon: Sun },
              { value: "dark", label: "深色", Icon: Moon },
            ] as const
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon aria-hidden="true" />
              {label}
              {theme === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
        <p>窗口与内容使用相同外观，跟随系统时自动切换。</p>
      </section>
      <section className="settings-section">
        <h2>
          <Keyboard />
          呼出主菜单
        </h2>
        <div className="setting-row">
          <span>快捷键</span>
          <kbd>{shortcutLabel}</kbd>
        </div>
        <p>
          {!desktop
            ? "浏览器预览中仅在页面获得焦点时生效。桌面版通过菜单栏或系统托盘呼出。"
            : shortcutAvailable
              ? "点击菜单栏或托盘图标也能打开主菜单。关闭应用中心后，拾用会继续在后台运行。"
              : "快捷键注册失败，可能已被其他程序占用。仍可使用菜单栏或托盘图标。"}
        </p>
      </section>
      <AppUpdate nativeBusy={nativeBusy} />
      <section className="settings-section">
        <h2>
          <Blocks />
          关于拾用
        </h2>
        <p>版本 {version} · macOS / Windows</p>
        <p>
          网页应用可直接添加。已接入的独立应用可在桌面版中安装、打开、检查更新和卸载，安装包来自应用自己的
          GitHub Release。
        </p>
      </section>
    </>
  );
}

function Launcher({
  apps,
  favorites,
  launch,
  close,
  manager,
  opening,
}: {
  apps: CatalogApp[];
  favorites: string[];
  launch: (app: CatalogApp) => Promise<void>;
  close: () => void;
  manager: () => void;
  opening: string | null;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const results = apps
    .filter((app) =>
      `${app.name} ${app.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)),
    );
  const activeIndex = Math.min(index, Math.max(results.length - 1, 0));
  useEffect(() => {
    input.current?.focus();
    const focus = () => {
      setQuery("");
      setIndex(0);
      input.current?.focus();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  useEffect(() => {
    rows.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, query]);
  return (
    <div
      className="launcher"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
        if (e.target === input.current && e.key === "ArrowDown") {
          e.preventDefault();
          setIndex((activeIndex + 1) % Math.max(results.length, 1));
        }
        if (e.target === input.current && e.key === "ArrowUp") {
          e.preventDefault();
          setIndex(
            (activeIndex + results.length - 1) % Math.max(results.length, 1),
          );
        }
      }}
    >
      <div className="launcher-search" data-tauri-drag-region>
        <Search aria-hidden="true" />
        <input
          ref={input}
          aria-label="搜索我的应用"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={true}
          aria-controls="launcher-results"
          aria-activedescendant={
            results.length ? `launcher-item-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder="搜索应用，马上开始…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (
              !e.nativeEvent.isComposing &&
              e.key === "Enter" &&
              results[activeIndex] &&
              !opening
            ) {
              e.preventDefault();
              void launch(results[activeIndex]);
            }
          }}
        />
        <button className="icon-button" aria-label="关闭主菜单" onClick={close}>
          <kbd>esc</kbd>
        </button>
      </div>
      <div className="launcher-label">
        {query ? "搜索结果" : "我的应用"} <span>{results.length} 个应用</span>
      </div>
      <div
        className="launcher-list"
        id="launcher-results"
        role="listbox"
        aria-label="应用搜索结果"
        aria-busy={opening !== null}
      >
        {results.length ? (
          results.map((app, i) => (
            <button
              id={`launcher-item-${i}`}
              ref={(element) => {
                rows.current[i] = element;
              }}
              role="option"
              aria-selected={i === activeIndex}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setIndex(i)}
              key={app.id}
              className={`launcher-item ${i === activeIndex ? "highlight" : ""}`}
              onFocus={() => setIndex(i)}
              onClick={() => void launch(app)}
              disabled={opening !== null}
            >
              <AppIcon app={app} small />
              <span>
                <strong>
                  {app.name}
                  {opening === app.id && <em>打开中…</em>}
                </strong>
                <small>{app.description}</small>
              </span>
              {favorites.includes(app.id) && (
                <Star size={14} aria-label="已收藏" />
              )}
              <span className="launch-return" aria-hidden="true">
                ↵
              </span>
            </button>
          ))
        ) : (
          <div className="empty">
            <PackageOpen />
            <h2>{query ? "没有找到应用" : "还没有添加应用"}</h2>
            <p>到应用中心挑选你需要的工具。</p>
          </div>
        )}
      </div>
      <footer className="launcher-footer">
        <span>
          <kbd>↑ ↓</kbd> 选择 <kbd>Enter</kbd> 打开
        </span>
        <button onClick={manager}>
          <Blocks size={14} aria-hidden="true" />
          应用中心
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
