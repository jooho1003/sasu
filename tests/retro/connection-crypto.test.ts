import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionEncryptionConfigured, decryptConnectionSecret, encryptConnectionSecret } from "@/lib/retro/connection-crypto";
describe("개인 연결 비밀값", () => {
  beforeEach(() => { vi.stubEnv("RETRO_CONNECTION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")); });
  it("같은 사용자와 제공자만 복호화하고 암호문에 원문을 남기지 않는다", () => {
    const encrypted = encryptConnectionSecret("synthetic-token", "user-1", "github", "dept-1");
    expect(encrypted).not.toContain("synthetic-token");
    expect(decryptConnectionSecret(encrypted, "user-1", "github", "dept-1")).toBe("synthetic-token");
    for (const [user, provider, dept] of [["user-2", "github", "dept-1"], ["user-1", "figma", "dept-1"], ["user-1", "github", "dept-2"]]) {
      expect(() => decryptConnectionSecret(encrypted, user, provider, dept)).toThrow("connection_credential_unavailable");
    }
    expect(() => decryptConnectionSecret(encrypted + ".extra", "user-1", "github", "dept-1")).toThrow();
    expect(encryptConnectionSecret("synthetic-token", "user-1", "github", "dept-1")).not.toBe(encrypted);
  });
  it("별도 키가 없으면 다른 서비스의 키로 대체하지 않는다", () => {
    expect(connectionEncryptionConfigured()).toBe(true);
    vi.stubEnv("RETRO_CONNECTION_ENCRYPTION_KEY", "");
    vi.stubEnv("NOTION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    expect(() => encryptConnectionSecret("secret", "u", "github", "d")).toThrow("connection_encryption_not_configured");
    expect(connectionEncryptionConfigured()).toBe(false);
  });
});
