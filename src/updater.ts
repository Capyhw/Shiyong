import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "installed";
export type UpdateState = {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  received: number;
  total?: number;
  error: string;
};
type UpdateHandle = Pick<
  Update,
  "version" | "body" | "download" | "install" | "close"
>;
type UpdaterDependencies = {
  check: () => Promise<UpdateHandle | null>;
  relaunch: () => Promise<void>;
};

// 保持在设置页之外：切换页面不会丢失下载进度，也不能启动重复升级。
export function createUpdater(deps: UpdaterDependencies) {
  let state: UpdateState = { phase: "idle", received: 0, error: "" };
  let update: UpdateHandle | null = null;
  let locked = false;
  const listeners = new Set<() => void>();
  const set = (next: Partial<UpdateState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const release = async () => {
    const previous = update;
    update = null;
    await previous?.close().catch(() => {});
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async check() {
      if (locked || state.phase === "installed") return;
      locked = true;
      set({
        phase: "checking",
        error: "",
        version: undefined,
        notes: undefined,
        received: 0,
        total: undefined,
      });
      try {
        await release();
        update = await deps.check();
        set(
          update
            ? {
                phase: "available",
                version: update.version,
                notes: update.body,
              }
            : { phase: "current" },
        );
      } catch (error) {
        set({
          phase: "idle",
          error: `检查更新失败，请检查网络后重试。${String(error)}`,
        });
      } finally {
        locked = false;
      }
    },
    async install() {
      if (locked || !update || state.phase !== "available") return;
      locked = true;
      const candidate = update;
      let installed = false;
      set({ phase: "downloading", error: "", received: 0, total: undefined });
      try {
        await candidate.download(
          (event: DownloadEvent) => {
            if (event.event === "Started")
              set({ total: event.data.contentLength });
            if (event.event === "Progress")
              set({ received: state.received + event.data.chunkLength });
          },
          { timeout: 300_000 },
        );
        // download 完成包含签名校验，失败不会执行 install。
        set({ phase: "installing" });
        await candidate.install();
        installed = true;
        set({ phase: "installed" });
        await release();
        await deps.relaunch();
      } catch (error) {
        if (installed) {
          set({
            error: `更新已安装，自动重启失败，请重启拾用。${String(error)}`,
          });
        } else {
          await release();
          set({
            phase: "idle",
            error: `更新未完成，请重新检查后重试。${String(error)}`,
          });
        }
      } finally {
        locked = false;
      }
    },
    async restart() {
      if (locked || state.phase !== "installed") return;
      locked = true;
      try {
        await deps.relaunch();
      } catch (error) {
        set({ error: `请手动退出并重新打开拾用。${String(error)}` });
      } finally {
        locked = false;
      }
    },
  };
}

export const appUpdater = createUpdater({
  check: () => check({ timeout: 15_000 }),
  relaunch: () => invoke("restart_app"),
});

export function isUpdating(phase: UpdatePhase) {
  return (
    phase === "downloading" || phase === "installing" || phase === "installed"
  );
}
