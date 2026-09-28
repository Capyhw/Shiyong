import { parseApp, type CatalogApp } from "./catalog";

export type Preferences = {
  apps: CatalogApp[];
  favorites: string[];
  theme: "system" | "light" | "dark";
};
export const defaults: Preferences = {
  apps: [],
  favorites: [],
  theme: "system",
};
export function parsePreferences(value: unknown): Preferences {
  const data = value as Partial<Preferences>;
  if (!data || !Array.isArray(data.apps) || !Array.isArray(data.favorites))
    throw new Error("设置无效");
  const apps = data.apps
    .map(parseApp)
    .filter((app) => app.type === "web" || app.installationMode === "managed")
    .filter((app, i, all) => all.findIndex((a) => a.id === app.id) === i);
  return {
    apps,
    favorites: [...new Set(data.favorites)].filter((id) =>
      apps.some((app) => app.id === id),
    ),
    theme:
      data.theme === "dark" || data.theme === "light" ? data.theme : "system",
  };
}
export function removeApp(prefs: Preferences, id: string): Preferences {
  return {
    ...prefs,
    apps: prefs.apps.filter((app) => app.id !== id),
    favorites: prefs.favorites.filter((favorite) => favorite !== id),
  };
}

// 本机安装收据决定独立应用是否可用；用户快照不能伪造安装状态。
export function resolveMyApps(
  prefs: Preferences,
  catalog: CatalogApp[],
  installedIds: string[],
): CatalogApp[] {
  const saved = prefs.apps.filter(
    (app) => app.type === "web" || installedIds.includes(app.id),
  );
  return [
    ...saved.map(
      (app) =>
        catalog.find((item) => item.type === app.type && item.id === app.id) ??
        app,
    ),
    ...catalog.filter(
      (app) =>
        app.type === "native" &&
        installedIds.includes(app.id) &&
        !saved.some((item) => item.id === app.id),
    ),
  ];
}
