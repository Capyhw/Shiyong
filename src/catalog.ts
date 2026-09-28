export type Platform = "macos" | "windows";
export type WebApp = {
  id: string;
  type: "web";
  name: string;
  description: string;
  categoryIds: string[];
  platforms: Platform[];
  iconUrl: string;
  url: string;
};
export type NativeApp = Omit<WebApp, "type" | "url"> & {
  type: "native";
  architectures: ("arm64" | "x64")[];
  installationMode: "external" | "managed";
  release: { provider: "github"; repository: string; pageUrl: string };
};
export type CatalogApp = WebApp | NativeApp;
export type Catalog = {
  schemaVersion: 1 | 2;
  revision: string;
  categories: { id: string; name: string; description: string }[];
  apps: CatalogApp[];
};
export type CachedCatalog = {
  catalog: Catalog;
  etag: string | null;
  savedAt: string;
};
export const DEFAULT_ENDPOINT = import.meta.env.DEV
  ? import.meta.env.VITE_CATALOG_URL ||
    "http://localhost:7854/api/toolbox/catalog"
  : "https://www.captain-space.top/api/toolbox/catalog";

export function safeUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("地址格式无效");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password
  ) {
    throw new Error("地址须使用 HTTPS，本地开发可使用 HTTP");
  }
  return url.href;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("目录格式无效");
  return value as Record<string, unknown>;
}
function str(value: unknown): string {
  if (typeof value !== "string" || value.length > 4000)
    throw new Error("目录字段无效");
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("目录列表无效");
  return value.map(str);
}
export function parseApp(value: unknown): CatalogApp {
  const app = record(value);
  const id = str(app.id);
  if (
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) ||
    (app.type !== "web" && app.type !== "native") ||
    !str(app.name).trim()
  )
    throw new Error("应用标识或类型无效");
  const platforms = strings(app.platforms);
  if (
    !platforms.length ||
    platforms.some((p) => p !== "macos" && p !== "windows")
  )
    throw new Error("应用平台无效");
  const base = {
    id,
    name: str(app.name),
    description: str(app.description),
    categoryIds: strings(app.categoryIds),
    platforms: platforms as Platform[],
    iconUrl: safeUrl(app.iconUrl),
  };
  if (app.type === "web")
    return { ...base, type: "web", url: safeUrl(app.url) };
  const release = record(app.release);
  const repository = str(release.repository);
  const pageUrl = safeUrl(release.pageUrl);
  const architectures = strings(app.architectures);
  if (
    release.provider !== "github" ||
    !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    pageUrl !== `https://github.com/${repository}/releases/latest` ||
    (app.installationMode !== "external" &&
      app.installationMode !== "managed") ||
    !architectures.length ||
    architectures.some((arch) => arch !== "arm64" && arch !== "x64")
  ) {
    throw new Error("独立应用的发布信息无效");
  }
  return {
    ...base,
    type: "native",
    architectures: architectures as NativeApp["architectures"],
    installationMode: app.installationMode as NativeApp["installationMode"],
    release: { provider: "github", repository, pageUrl },
  };
}
export function parseCatalog(value: unknown): Catalog {
  const data = record(value);
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2)
    throw new Error("目录版本暂不支持，请更新拾用");
  if (!Array.isArray(data.apps) || !Array.isArray(data.categories))
    throw new Error("目录格式无效");
  const categories = data.categories.map((value) => {
    const category = record(value);
    return {
      id: str(category.id),
      name: str(category.name),
      description: str(category.description),
    };
  });
  const apps = data.apps.map(parseApp);
  if (data.schemaVersion === 1 && apps.some((app) => app.type !== "web"))
    throw new Error("独立应用需要目录版本 2");
  if (new Set(apps.map((app) => app.id)).size !== apps.length)
    throw new Error("目录包含重复应用");
  if (new Set(categories.map((c) => c.id)).size !== categories.length)
    throw new Error("目录包含重复分类");
  if (
    apps.some((app) =>
      app.categoryIds.some(
        (id) => !categories.some((category) => category.id === id),
      ),
    )
  )
    throw new Error("应用分类不存在");
  return {
    schemaVersion: data.schemaVersion,
    revision: str(data.revision),
    apps,
    categories,
  };
}
export async function fetchCatalog(
  endpoint: string,
  cache: CachedCatalog | null,
  signal?: AbortSignal,
): Promise<CachedCatalog> {
  const response = await fetch(safeUrl(endpoint), {
    signal,
    credentials: "omit",
    cache: "no-store",
    // 目录已有应用级离线缓存。这里始终请求完整响应，避免 CDN 生成的
    // 304 丢失 CORS 头而被桌面 WebView 拦截；旧缓存的 ETag 不再发送。
  });
  if (response.status === 304 && cache)
    return { ...cache, savedAt: new Date().toISOString() };
  if (!response.ok) throw new Error(`目录服务返回 ${response.status}`);
  return {
    catalog: parseCatalog(await response.json()),
    etag: response.headers.get("ETag"),
    savedAt: new Date().toISOString(),
  };
}
