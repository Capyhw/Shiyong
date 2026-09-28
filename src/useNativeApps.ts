import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  desktop,
  listNative,
  type NativeInstallation,
  type NativeProgress,
} from "./desktop";

export function useNativeApps() {
  const [installed, setInstalled] = useState<NativeInstallation[]>([]);
  const [progress, setProgress] = useState<NativeProgress | null>(null);
  const [error, setError] = useState("");
  async function reload() {
    try {
      setInstalled(await listNative());
      setError("");
    } catch (error) {
      setError(String(error));
    }
  }
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    const refresh = () =>
      listNative()
        .then((items) => {
          if (active) {
            setInstalled(items);
            setError("");
          }
        })
        .catch((error) => {
          if (active) setError(String(error));
        });
    const stop = getCurrentWebviewWindow().listen<NativeProgress>(
      "native-progress",
      ({ payload }) => {
        if (!active) return;
        if (payload.stage === "done" || payload.stage === "error") {
          setProgress(null);
          void refresh();
        } else setProgress(payload);
      },
    );
    void stop.catch((error) => {
      if (active) setError(`安装进度监听失败：${String(error)}`);
    });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      void stop.then((fn) => fn()).catch(() => {});
    };
  }, []);
  return { installed, progress, error, reload };
}
export function progressLabel(progress: NativeProgress | null): string {
  if (!progress) return "处理中…";
  if (progress.stage === "downloading")
    return progress.total > 0
      ? `下载中 ${Math.min(100, Math.round((progress.received / progress.total) * 100))}%`
      : "下载中…";
  return (
    (
      {
        checking: "检查版本…",
        verifying: "校验安装包…",
        installing: "安装中…",
        restoring: "恢复网络并卸载…",
      } as Record<string, string>
    )[progress.stage] || "处理中…"
  );
}
