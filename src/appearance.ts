import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktop } from "./desktop";
import type { Preferences } from "./preferences";

// Web content and AppKit material must share the same appearance.
export function useAppearance(theme: Preferences["theme"]) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    if (desktop) {
      void getCurrentWindow()
        .setTheme(theme === "system" ? null : theme)
        .catch((error: unknown) => console.warn("无法同步窗口外观", error));
    }
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
