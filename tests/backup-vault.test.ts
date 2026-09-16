import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
// @ts-expect-error Operator script intentionally runs directly under Node.js.
import { sealBackup, openBackup } from "../scripts/backup-vault.mjs";
describe("복구 백업 암호화", () => {
  const key = randomBytes(32).toString("hex");
  const sql = "synthetic database";
  const snapshot = {
    manifest: { sql_sha256: createHash("sha256").update(sql).digest("hex") },
    sql,
    files: [],
  };
  it("평문을 남기지 않고 인증된 암호화로 왕복한다", () => {
    const encrypted = sealBackup(snapshot, key);
    expect(encrypted.toString()).not.toContain(sql);
    expect(openBackup(encrypted, key)).toEqual(snapshot);
  });
  it("다른 키와 변조된 파일을 거절한다", () => {
    const encrypted = sealBackup(snapshot, key);
    expect(() =>
      openBackup(encrypted, randomBytes(32).toString("hex")),
    ).toThrow();
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => openBackup(encrypted, key)).toThrow();
  });
});
