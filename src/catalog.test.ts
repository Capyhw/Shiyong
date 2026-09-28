import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCatalog,
  parseCatalog,
  safeUrl,
  type CachedCatalog,
  type Catalog,
  type NativeApp,
} from "./catalog";
import {
  defaults,
  parsePreferences,
  removeApp,
  resolveMyApps,
} from "./preferences";

const catalog: Catalog = {
  schemaVersion: 1,
  revision: "sample-revision",
  categories: [{ id: "data", name: "数据", description: "数据处理" }],
  apps: [
    {
      id: "json-editor",
      type: "web",
      name: "JSON 编辑器",
      description: "处理 JSON",
      categoryIds: ["data"],
      platforms: ["macos", "windows"],
      iconUrl: "https://tools.example.com/icons/json.svg",
      url: "https://tools.example.com/json-editor",
    },
  ],
};
const cache: CachedCatalog = {
  catalog,
  etag: 'W/"old"',
  savedAt: "2026-01-01T00:00:00Z",
};
afterEach(() => vi.unstubAllGlobals());

describe("目录边界与缓存协议", () => {
  it("接受真实协议并保留资源 URL", () => {
    expect(parseCatalog(catalog)).toEqual(catalog);
  });
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://example.com",
    "https://user:pass@example.com",
    "tauri://localhost",
  ])("拒绝不受支持的地址 %s", (value) => {
    expect(() => safeUrl(value)).toThrow();
  });
  it("允许本机 HTTP 开发服务", () => {
    expect(safeUrl("http://127.0.0.1:7854/api/toolbox/catalog")).toContain(
      ":7854",
    );
  });
  it("拒绝重复 ID、未知 schema、无效分类及远程脚本地址", () => {
    expect(() =>
      parseCatalog({ ...catalog, apps: [...catalog.apps, ...catalog.apps] }),
    ).toThrow();
    expect(() => parseCatalog({ ...catalog, schemaVersion: 3 })).toThrow();
    expect(() => parseCatalog({ ...catalog, categories: [] })).toThrow();
    expect(() =>
      parseCatalog({
        ...catalog,
        apps: [{ ...catalog.apps[0], iconUrl: "javascript:alert(1)" }],
      }),
    ).toThrow();
  });
  it("已有 ETag 缓存也请求完整目录，避免 CDN 的 304 跨域失败", async () => {
    const updated = { ...catalog, revision: "new-revision" };
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json(updated, { headers: { ETag: 'W/"new"' } }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const original = JSON.stringify(cache);
    const result = await fetchCatalog(
      "https://tools.example.com/api/toolbox/catalog",
      cache,
    );
    await fetchCatalog("https://tools.example.com/api/toolbox/catalog", result);
    expect(result.catalog).toEqual(updated);
    expect(result.etag).toBe('W/"new"');
    for (const [, options] of fetch.mock.calls) {
      expect(new Headers(options.headers).has("If-None-Match")).toBe(false);
      expect(options.cache).toBe("no-store");
      expect(options.credentials).toBe("omit");
    }
    expect(JSON.stringify(cache)).toBe(original);
  });
  it("服务错误或坏响应不能覆盖已有缓存对象", async () => {
    const original = JSON.stringify(cache);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("server error", { status: 503 })),
    );
    await expect(
      fetchCatalog("https://tools.example.com/api", cache),
    ).rejects.toThrow("503");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ schemaVersion: 3 })),
    );
    await expect(
      fetchCatalog("https://tools.example.com/api", cache),
    ).rejects.toThrow("版本");
    expect(JSON.stringify(cache)).toBe(original);
  });
});

describe("用户应用与收藏", () => {
  it("过滤重复应用和不在我的应用中的收藏", () => {
    const parsed = parsePreferences({
      ...defaults,
      apps: [...catalog.apps, ...catalog.apps],
      favorites: ["json-editor", "missing", "json-editor"],
    });
    expect(parsed.apps).toHaveLength(1);
    expect(parsed.favorites).toEqual(["json-editor"]);
  });
  it("添加不自动收藏，移除同时清理该应用的收藏", () => {
    const added = parsePreferences({ ...defaults, apps: catalog.apps });
    expect(parsePreferences(added).favorites).toEqual([]);
    const result = removeApp(
      { ...added, favorites: ["json-editor"] },
      "json-editor",
    );
    expect(result.apps).toEqual([]);
    expect(result.favorites).toEqual([]);
    expect(added.apps).toHaveLength(1);
  });
  it("用户的应用快照独立于远端目录保存", () => {
    const prefs = parsePreferences({
      ...defaults,
      apps: catalog.apps,
      favorites: ["json-editor"],
    });
    const emptyCatalog = parseCatalog({ ...catalog, apps: [] });
    expect(emptyCatalog.apps).toHaveLength(0);
    expect(prefs.apps[0].type === "web" && prefs.apps[0].url).toBe(
      "https://tools.example.com/json-editor",
    );
    expect(prefs.favorites).toEqual(["json-editor"]);
  });
});

const nativeApp: NativeApp = {
  id: "net-split",
  type: "native",
  name: "网络分流",
  description: "独立安装 NetSplit",
  platforms: ["macos"],
  architectures: ["arm64"],
  categoryIds: ["data"],
  iconUrl: "https://tools.example.com/net-split.svg",
  installationMode: "external",
  release: {
    provider: "github",
    repository: "Capyhw/NetSplit",
    pageUrl: "https://github.com/Capyhw/NetSplit/releases/latest",
  },
};
describe("网页和独立应用合并目录", () => {
  it("兼容旧的网页目录，版本 2 支持两种条目", () => {
    expect(parseCatalog(catalog).apps).toHaveLength(1);
    const merged = parseCatalog({
      ...catalog,
      schemaVersion: 2,
      apps: [...catalog.apps, nativeApp],
    });
    expect(merged.apps).toHaveLength(2);
    expect(merged.apps[1].type).toBe("native");
    expect("url" in merged.apps[1]).toBe(false);
  });
  it("独立应用不能被当成已添加的网页应用", () => {
    const prefs = parsePreferences({
      ...defaults,
      apps: [...catalog.apps, nativeApp],
      favorites: [nativeApp.id],
    });
    expect(prefs.apps).toHaveLength(1);
    expect(prefs.favorites).toEqual([]);
  });
  it("拒绝发布来源与地址不一致、伪造类型和无效架构", () => {
    for (const bad of [
      {
        ...nativeApp,
        release: {
          ...nativeApp.release,
          pageUrl: "https://evil.example/download",
        },
      },
      {
        ...nativeApp,
        release: { ...nativeApp.release, repository: "../evil" },
      },
      { ...nativeApp, type: "script" },
      { ...nativeApp, architectures: ["unknown"] },
    ])
      expect(() =>
        parseCatalog({ ...catalog, schemaVersion: 2, apps: [bad] }),
      ).toThrow();
  });
});

describe("托管安装状态", () => {
  const managed: NativeApp = { ...nativeApp, installationMode: "managed" };
  it("仅有快照或收藏不能伪造已安装，收据确认后支持离线快照", () => {
    const prefs = parsePreferences({
      ...defaults,
      apps: [managed],
      favorites: [managed.id],
    });
    expect(resolveMyApps(prefs, [managed], [])).toEqual([]);
    expect(resolveMyApps(prefs, [], [managed.id])).toEqual([managed]);
    expect(removeApp(prefs, managed.id).favorites).toEqual([]);
  });
  it("发现后端已安装应用，无需网页添加操作，也不自动收藏", () => {
    expect(resolveMyApps(defaults, [managed], [managed.id])).toEqual([managed]);
    expect(defaults.favorites).toEqual([]);
  });
});

it("旧目录地址被忽略，保留已有应用、收藏和主题", () => {
  const parsed = parsePreferences({
    ...defaults,
    endpoint: "invalid-old-endpoint",
    apps: catalog.apps,
    favorites: ["json-editor"],
    theme: "dark",
  });
  expect(parsed).toEqual({
    apps: catalog.apps,
    favorites: ["json-editor"],
    theme: "dark",
  });
  expect(parsed).not.toHaveProperty("endpoint");
});
