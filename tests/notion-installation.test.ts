import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptNotionToken,
  encryptNotionToken,
  notionTokenEncryptionConfigured,
} from "@/lib/notion-installation";

afterEach(() => vi.unstubAllEnvs());

describe("Notion installation token encryption", () => {
  it("binds ciphertext to its organization and workspace", () => {
    vi.stubEnv(
      "NOTION_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 23).toString("base64"),
    );
    const encrypted = encryptNotionToken("secret", "org-a", "workspace-a");
    expect(decryptNotionToken(encrypted, "org-a", "workspace-a")).toBe(
      "secret",
    );
    expect(() =>
      decryptNotionToken(encrypted, "org-b", "workspace-a"),
    ).toThrow("notion_credential_unavailable");
  });

  it("requires a canonical base64 32-byte key", () => {
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", "");
    expect(notionTokenEncryptionConfigured()).toBe(false);
    expect(() => encryptNotionToken("secret", "org", "workspace")).toThrow(
      "notion_encryption_not_configured",
    );
  });
});
