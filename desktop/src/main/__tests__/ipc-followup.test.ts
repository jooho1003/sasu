import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, value?: unknown) => Promise<unknown>>(),
  hostname: "SALES-LAPTOP",
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "0.1.0" },
  ipcMain: { handle: (name: string, handler: (event: unknown, value?: unknown) => Promise<unknown>) => mocks.handlers.set(name, handler) },
  shell: { openExternal: vi.fn() },
}));
vi.mock("node:os", () => ({ hostname: () => mocks.hostname }));
vi.mock("../api/storage-upload", () => ({ uploadReview: vi.fn() }));
vi.mock("../logger", () => ({ logError: vi.fn() }));

import { registerIpc } from "../ipc";

describe("followup IPC boundary", () => {
  beforeEach(() => { mocks.handlers.clear(); mocks.hostname = "SALES-LAPTOP"; });

  function fixture() {
    const panel = {}, pet = {};
    const postJson = vi.fn<(path: string, body: unknown, parser: unknown) => Promise<{ link_id: string }>>(async () => ({ link_id: randomUUID() }));
    const markSeen = vi.fn(async () => ({ seen: [] }));
    const set = vi.fn(async () => ({ seen: [] }));
    const onSettingsChanged = vi.fn();
    let generation = 0;
    registerIpc({
      api: { postJson }, auth: {}, outbox: {}, supabase: {},
      settings: { markSeen, set },
      getSessionGeneration: () => generation,
      onSettingsChanged,
      getWindows: () => ({ panel: { webContents: panel }, pet: { webContents: pet } }),
    } as unknown as Parameters<typeof registerIpc>[0]);
    const invoke = (name: string, value?: unknown, sender = panel) => mocks.handlers.get(name)!({ sender }, value);
    return { invoke, postJson, markSeen, set, pet, onSettingsChanged, endSession: () => { generation += 1; } };
  }

  it("sends the local hostname and installed version to the unchanged link API", async () => {
    const { invoke, postJson } = fixture();
    const dept = randomUUID();
    await invoke("link:create", { dept_id: dept });
    const info = await invoke("app:info") as { device_name: string; version: string };
    expect(postJson.mock.calls[0]).toEqual([
      "/api/companion/link", { dept_id: dept, device_name: info.device_name, app_version: info.version }, expect.any(Function),
    ]);
    expect(info.device_name).toBe("SALES-LAPTOP");
  });

  it("bounds the hostname to the server's 60-character contract", async () => {
    mocks.hostname = "X".repeat(80);
    const { invoke, postJson } = fixture();
    await invoke("link:create", { dept_id: randomUUID() });
    expect(postJson.mock.calls[0]![1]).toMatchObject({ device_name: "X".repeat(60) });
    expect(await invoke("app:info")).toMatchObject({ device_name: "X".repeat(60) });
  });

  it("marks one validated ID, rejects stale arrays, and refuses pet-window writes", async () => {
    const { invoke, markSeen, set, pet } = fixture();
    const id = randomUUID();
    await invoke("settings:markSeen", { id });
    expect(markSeen).toHaveBeenCalledExactlyOnceWith(id);
    await expect(invoke("settings:markSeen", { id: "invalid" })).rejects.toThrow("invalid_input");
    await expect(invoke("settings:set", { seen: [id] })).rejects.toThrow("invalid_input");
    await expect(invoke("settings:markSeen", { id }, pet)).rejects.toThrow("window_forbidden");
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a renderer-supplied hostname or invalid department", async () => {
    const { invoke, postJson } = fixture();
    await expect(invoke("link:create", { dept_id: randomUUID(), device_name: "forged" })).rejects.toThrow("invalid_input");
    await expect(invoke("link:create", { dept_id: "invalid" })).rejects.toThrow("invalid_input");
    expect(postJson).not.toHaveBeenCalled();
  });

  it("does not broadcast a settings write completed after session end", async () => {
    const { invoke, set, endSession, onSettingsChanged } = fixture();
    let complete!: (settings: { seen: never[] }) => void;
    set.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const saving = invoke("settings:set", { pet: "purple", panelPinned: true });
    const rejected = expect(saving).rejects.toThrow("session_changed");
    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
    endSession();
    complete({ seen: [] });
    await rejected;
    expect(onSettingsChanged).not.toHaveBeenCalled();
  });
});
