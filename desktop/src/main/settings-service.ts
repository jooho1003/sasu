// Design Ref: desktop-companion §11.4 G2 — all settings mutations share one main-process queue.
import { z } from "zod";
import {
  DEFAULT_DESKTOP_SETTINGS,
  DesktopSettingsPatch,
  DesktopSettingsSchema,
  type DesktopSettings,
} from "../shared/contracts";
import type { EncryptedFile } from "./storage/encrypted-file";

export class SettingsService {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: Pick<EncryptedFile, "read" | "write" | "remove">) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<DesktopSettings> {
    return DesktopSettingsSchema.parse(await this.file.read(DEFAULT_DESKTOP_SETTINGS));
  }

  get(): Promise<DesktopSettings> {
    return this.enqueue(() => this.read());
  }

  set(patch: z.infer<typeof DesktopSettingsPatch>): Promise<DesktopSettings> {
    return this.enqueue(async () => {
      const validated = DesktopSettingsPatch.parse(patch);
      const next = DesktopSettingsSchema.parse({ ...await this.read(), ...validated });
      await this.file.write(next);
      return next;
    });
  }

  markSeen(id: string): Promise<DesktopSettings> {
    return this.enqueue(async () => {
      z.guid().parse(id);
      const current = await this.read();
      if (current.seen.at(-1) === id) return current;
      const next = { ...current, seen: [...current.seen.filter((value) => value !== id), id].slice(-500) };
      await this.file.write(next);
      return next;
    });
  }

  remove(): Promise<void> {
    return this.enqueue(() => this.file.remove());
  }
}
