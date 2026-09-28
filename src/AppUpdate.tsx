import { useSyncExternalStore } from "react";
import { Download, RefreshCw } from "lucide-react";
import { desktop } from "./desktop";
import { appUpdater, isUpdating } from "./updater";
import { version } from "../package.json";

export function AppUpdate({ nativeBusy }: { nativeBusy: boolean }) {
  const state = useSyncExternalStore(
    appUpdater.subscribe,
    appUpdater.getSnapshot,
  );
  const busy = state.phase === "checking" || isUpdating(state.phase);
  const percent = state.total
    ? Math.min(100, Math.round((state.received / state.total) * 100))
    : undefined;
  return (
    <section className="settings-section">
      <h2>
        <RefreshCw aria-hidden="true" />
        拾用更新
      </h2>
      <div className="setting-row">
        <span>当前版本 {version}</span>
        <button
          className="button"
          disabled={!desktop || busy || nativeBusy}
          onClick={() => void appUpdater.check()}
        >
          <RefreshCw aria-hidden="true" />
          {state.phase === "checking" ? "检查中…" : "检查更新"}
        </button>
      </div>
      {!desktop && <p>请在桌面版中检查和安装拾用更新。</p>}
      {nativeBusy && <p>请等待应用安装或卸载完成后再更新拾用。</p>}
      <div aria-live="polite" aria-atomic="true">
        {state.phase === "current" && <p>当前已是最新版本。</p>}
        {state.version && state.phase !== "idle" && (
          <p>新版本 {state.version}</p>
        )}
        {state.phase === "downloading" && (
          <p>正在下载更新{percent !== undefined ? ` ${percent}%` : "…"}</p>
        )}
        {state.phase === "installing" && <p>正在安装更新，即将重启拾用…</p>}
        {state.phase === "installed" && <p>更新已安装，重启后生效。</p>}
      </div>
      {state.phase === "downloading" && (
        <progress
          className="update-progress"
          aria-label="更新下载进度"
          max={100}
          value={percent}
        />
      )}
      {state.notes && (
        <details className="update-notes">
          <summary>更新说明</summary>
          <pre>{state.notes}</pre>
        </details>
      )}
      {state.phase === "available" && (
        <>
          <p>安装会重启拾用并关闭网页应用窗口，请先保存正在编辑的内容。</p>
          <button
            className="button primary"
            disabled={nativeBusy}
            onClick={() => void appUpdater.install()}
          >
            <Download aria-hidden="true" />
            下载并安装，重启拾用
          </button>
        </>
      )}
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state.phase === "installed" && (
        <button className="button" onClick={() => void appUpdater.restart()}>
          重启拾用
        </button>
      )}
    </section>
  );
}
