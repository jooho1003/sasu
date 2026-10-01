// Design Ref: desktop-companion §7 S4·S6 — safeStorage is mandatory; no plaintext fallback exists.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { safeStorage } from "electron";
import type { SupportedStorage } from "@supabase/supabase-js";

type Encryptor = Pick<
  typeof safeStorage,
  "isEncryptionAvailable" | "encryptString" | "decryptString"
>;

function isMissingFile(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class EncryptedFile {
  constructor(
    private readonly path: string,
    private readonly encryptor: Encryptor = safeStorage,
  ) {}

  assertAvailable(): void {
    if (!this.encryptor.isEncryptionAvailable()) {
      throw new Error("encryption_unavailable");
    }
  }

  async read<T>(fallback: T): Promise<T> {
    this.assertAvailable();
    try {
      const encrypted = await readFile(this.path);
      const plain = this.encryptor.decryptString(encrypted);
      return JSON.parse(plain) as T;
    } catch (cause) {
      if (isMissingFile(cause)) return fallback;
      throw new Error("encrypted_store_read_failed", { cause });
    }
  }

  async write(value: unknown): Promise<void> {
    this.assertAvailable();
    const encrypted = this.encryptor.encryptString(JSON.stringify(value));
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, encrypted, { mode: 0o600 });
      await rename(temporary, this.path);
    } catch (cause) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new Error("encrypted_store_write_failed", { cause });
    }
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

export class EncryptedKeyValueStorage implements SupportedStorage {
  constructor(private readonly file: EncryptedFile) {}

  async getItem(key: string): Promise<string | null> {
    const values = await this.readValues();
    return values[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const values = await this.readValues();
    values[key] = value;
    await this.file.write(values);
  }

  async removeItem(key: string): Promise<void> {
    const values = await this.readValues();
    Reflect.deleteProperty(values, key);
    if (Object.keys(values).length === 0) {
      await this.file.remove();
      return;
    }
    await this.file.write(values);
  }

  async clear(): Promise<void> {
    await this.file.remove();
  }

  private async readValues(): Promise<Record<string, string>> {
    const value = await this.file.read<unknown>({});
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("encrypted_store_invalid");
    }
    const entries = Object.entries(value);
    if (!entries.every((entry) => typeof entry[1] === "string")) {
      throw new Error("encrypted_store_invalid");
    }
    return Object.fromEntries(entries) as Record<string, string>;
  }
}
