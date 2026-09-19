import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptConnectionSecret, encryptConnectionSecret } from "@/lib/retro/connection-crypto";
describe("개인 연결 비밀값", () => {
  beforeEach(() => { vi.stubEnv("RETRO_CONNECTION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")); });
  it("같은 사용자와 제공자만 복호화하고 암호문에 원문을 남기지 않는다", () => {
    const encrypted = encryptConnectionSecret("synthetic-token", "user-1", "github");
    expect(encrypted).not.toContain("synthetic-token"); expect(decryptConnectionSecret(encrypted, "user-1", "github")).toBe("synthetic-token"); expect(() => decryptConnectionSecret(encrypted, "user-2", "github")).toThrow("connection_credential_unavailable");
  });
});
