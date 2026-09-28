import { invoke, isTauri } from "@tauri-apps/api/core";
import { safeUrl, type CatalogApp, type NativeApp } from "./catalog";

export const desktop = isTauri();
export async function openApp(app: CatalogApp) {
  if (app.type === "native") {
    if (!desktop) throw new Error("请在拾用桌面版中打开独立应用");
    await invoke("native_open", { id: app.id });
    return;
  }
  const url = safeUrl(app.url);
  if (desktop)
    await invoke("open_web_app", { id: app.id, title: app.name, url });
  else {
    // 浏览器开发模式打开独立浏览器窗口；桌面版使用原生 WebView。
    const popup = window.open(
      url,
      `shiyong-${app.id}`,
      "popup,width=1080,height=760",
    );
    if (!popup) throw new Error("浏览器拦截了窗口，请允许本站弹出窗口");
    popup.opener = null;
  }
}
export async function showManager() {
  if (desktop) await invoke("show_manager");
}
export async function showLauncher() {
  if (desktop) await invoke("show_launcher");
}
export async function hideLauncher() {
  if (desktop) await invoke("hide_launcher");
}
export async function getRuntimeStatus(): Promise<{
  shortcutAvailable: boolean;
  arch?: string;
}> {
  return desktop ? invoke("runtime_status") : { shortcutAvailable: false };
}

export async function openRelease(app: NativeApp) {
  if (desktop)
    await invoke("open_release_page", { repository: app.release.repository });
  else {
    const popup = window.open(safeUrl(app.release.pageUrl), "_blank");
    if (!popup) throw new Error("浏览器拦截了下载页面，请允许本站弹出窗口");
    popup.opener = null;
  }
}

export type NativeInstallation = { id: string; version: string };
export type NativeProgress = {
  id: string;
  stage: string;
  received: number;
  total: number;
};
export function listNative(): Promise<NativeInstallation[]> {
  return desktop ? invoke("native_list") : Promise.resolve([]);
}
export function installNative(app: NativeApp): Promise<NativeInstallation> {
  if (!desktop)
    return Promise.reject(new Error("请在拾用桌面版中安装独立应用"));
  return invoke("native_install", { id: app.id });
}
export function uninstallNative(app: NativeApp): Promise<void> {
  return invoke("native_uninstall", { id: app.id });
}
