import { describe, expect, it, vi } from "vitest";
import type { DesktopWindows } from "../windows";
import { createTray } from "../tray";

const { build } = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("electron", () => ({
  Menu: { buildFromTemplate: build },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
  Tray: class { setContextMenu() {} on() {} },
}));

describe("tray session end", () => {
  it("routes the unlink menu to the supplied common logout callback", () => {
    const signOut = vi.fn();
    const windows = { isPetVisible: () => true } as DesktopWindows;
    createTray(windows, signOut, "synthetic.png");
    const menu = build.mock.calls.at(-1)![0] as { label?: string; click?: () => void }[];
    menu.find((entry) => entry.label === "연결 해제")!.click!();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
