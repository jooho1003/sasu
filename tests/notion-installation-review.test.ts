import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptNotionToken, encryptNotionToken, notionTokenEncryptionConfigured } from "@/lib/notion-installation";

afterEach(() => vi.unstubAllEnvs());
describe("Notion installation credentials", () => {
  it("encrypts with a fresh nonce and authenticates organization and workspace", () => {
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const encrypted = encryptNotionToken("synthetic-secret", "org-a", "workspace-a");
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("synthetic-secret");
    expect(encrypted).not.toBe(encryptNotionToken("synthetic-secret", "org-a", "workspace-a"));
    expect(decryptNotionToken(encrypted, "org-a", "workspace-a")).toBe("synthetic-secret");
    for (const [org, workspace] of [["org-b", "workspace-a"], ["org-a", "workspace-b"]]) {
      expect(() => decryptNotionToken(encrypted, org, workspace)).toThrow("notion_credential_unavailable");
    }
    const parts = encrypted.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptNotionToken(parts.join("."), "org-a", "workspace-a")).toThrow("notion_credential_unavailable");
  });
  it("rejects missing/malformed keys and ciphertext with safe errors", () => {
    for (const key of ["", "not-a-key", Buffer.alloc(31).toString("base64")]) {
      vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", key);
      expect(notionTokenEncryptionConfigured()).toBe(false);
      expect(() => encryptNotionToken("secret", "org", "workspace")).toThrow("notion_encryption_not_configured");
    }
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    expect(notionTokenEncryptionConfigured()).toBe(true);
    for (const value of ["secret", "v1.bad.bad.bad", "v2.a.b.c", "v1.a.b.c.extra"]) {
      expect(() => decryptNotionToken(value, "org", "workspace")).toThrow("notion_credential_unavailable");
    }
  });
});
