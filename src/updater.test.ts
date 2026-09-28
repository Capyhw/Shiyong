import { describe, expect, it, vi } from "vitest";
import { createUpdater } from "./updater";

function fixture() {
  const update = {
    version: "0.2.0",
    body: "修复与改进",
    close: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
  };
  const deps = {
    check: vi.fn().mockResolvedValue(update),
    relaunch: vi.fn().mockResolvedValue(undefined),
  };
  return { update, deps, controller: createUpdater(deps) };
}
describe("拾用升级", () => {
  it("没有更新时不安装", async () => {
    const { deps, controller, update } = fixture();
    deps.check.mockResolvedValue(null);
    await controller.check();
    await controller.install();
    expect(controller.getSnapshot().phase).toBe("current");
    expect(update.install).not.toHaveBeenCalled();
  });
  it("仅在用户安装后下载、安装、释放资源并重启", async () => {
    const { deps, controller, update } = fixture();
    await controller.check();
    expect(update.download).not.toHaveBeenCalled();
    await controller.install();
    expect(update.download).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
    expect(update.close).toHaveBeenCalledOnce();
    expect(deps.relaunch).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe("installed");
  });
  it("下载或签名校验失败时不安装、不重启，并允许重新检查", async () => {
    const { deps, controller, update } = fixture();
    update.download.mockRejectedValue(new Error("invalid signature"));
    await controller.check();
    await controller.install();
    expect(update.install).not.toHaveBeenCalled();
    expect(deps.relaunch).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().error).toContain("invalid signature");
    await controller.check();
    expect(controller.getSnapshot().phase).toBe("available");
  });
  it("检查失败后释放旧资源，不能误装上次的版本", async () => {
    const { deps, controller, update } = fixture();
    await controller.check();
    deps.check.mockRejectedValue(new Error("offline"));
    await controller.check();
    await controller.install();
    expect(update.close).toHaveBeenCalledOnce();
    expect(update.install).not.toHaveBeenCalled();
    expect(controller.getSnapshot().version).toBeUndefined();
  });
  it("连续点击不会重复检查或安装", async () => {
    const { deps, controller, update } = fixture();
    await Promise.all([controller.check(), controller.check()]);
    await Promise.all([
      controller.install(),
      controller.install(),
      controller.check(),
    ]);
    expect(deps.check).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
  });
  it("安装成功但重启失败时，只重试重启，不重新安装", async () => {
    const { deps, controller, update } = fixture();
    deps.relaunch.mockRejectedValueOnce(new Error("restart failed"));
    await controller.check();
    await controller.install();
    expect(controller.getSnapshot().phase).toBe("installed");
    await controller.check();
    await controller.install();
    await controller.restart();
    expect(update.install).toHaveBeenCalledOnce();
    expect(deps.relaunch).toHaveBeenCalledTimes(2);
  });
});
