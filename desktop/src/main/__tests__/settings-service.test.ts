import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "../settings-service";
import type { DesktopSettings } from "../../shared/contracts";

function fixture() {
  let saved: DesktopSettings | null = null;
  const file = {
    read: async <T>(fallback: T) => {
      const snapshot = saved === null ? fallback : structuredClone(saved);
      await Promise.resolve();
      return snapshot as T;
    },
    write: vi.fn(async (value: unknown) => {
      await Promise.resolve();
      saved = structuredClone(value) as DesktopSettings;
    }),
    remove: vi.fn(async () => { saved = null; }),
  };
  return { service: new SettingsService(file), file };
}

describe("SettingsService", () => {
  it("keeps both concurrently opened items instead of overwriting a stale list", async () => {
    const { service } = fixture();
    const ids = [randomUUID(), randomUUID()];
    await Promise.all(ids.map((id) => service.markSeen(id)));
    expect((await service.get()).seen).toEqual(ids);
  });

  it("preserves seen IDs alongside simultaneous preferences and pet position", async () => {
    const { service } = fixture();
    const id = randomUUID();
    await Promise.all([
      service.markSeen(id),
      service.set({ pet: "blue", reduceMotion: true }),
      service.set({ petPosition: { x: 45, y: 70 } }),
    ]);
    expect(await service.get()).toMatchObject({ seen: [id], pet: "blue", reduceMotion: true, petPosition: { x: 45, y: 70 } });
  });

  it("deduplicates and keeps the latest 500 IDs", async () => {
    const { service } = fixture();
    const ids = Array.from({ length: 501 }, () => randomUUID());
    await Promise.all(ids.map((id) => service.markSeen(id)));
    await service.markSeen(ids[1]!);
    expect((await service.get()).seen).toEqual([...ids.slice(2), ids[1]!]);
  });

  it("does not write again when the most recent item is polled again", async () => {
    const { service, file } = fixture();
    const id = randomUUID();
    await service.markSeen(id);
    await service.markSeen(id);
    expect(file.write).toHaveBeenCalledTimes(1);
  });

  it("recovers the queue after a failed write", async () => {
    const { service, file } = fixture();
    file.write.mockRejectedValueOnce(new Error("encrypted_store_write_failed"));
    await expect(service.markSeen(randomUUID())).rejects.toThrow("encrypted_store_write_failed");
    const id = randomUUID();
    await service.markSeen(id);
    expect((await service.get()).seen).toEqual([id]);
  });

  it("serializes sign-out deletion after pending changes", async () => {
    const { service, file } = fixture();
    await Promise.all([service.markSeen(randomUUID()), service.set({ pet: "purple" }), service.remove()]);
    expect(file.remove).toHaveBeenCalledTimes(1);
    expect(await service.get()).toMatchObject({ seen: [], pet: "green" });
  });

  it("rejects whole-list replacement and invalid IDs without a write", async () => {
    const { service, file } = fixture();
    await expect(service.set({ seen: [] } as never)).rejects.toThrow();
    await expect(service.markSeen("not-an-id")).rejects.toThrow();
    expect(file.write).not.toHaveBeenCalled();
  });
});
