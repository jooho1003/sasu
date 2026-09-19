import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const value = process.env.RETRO_CONNECTION_ENCRYPTION_KEY ?? "";
  const result = Buffer.from(value, "base64");
  if (result.length !== 32 || result.toString("base64") !== value) throw new Error("connection_encryption_not_configured");
  return result;
}
export function encryptConnectionSecret(secret: string, userId: string, provider: string, deptId: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(["sasu:retro:v2", userId, deptId, provider])));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v2", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function connectionEncryptionConfigured():boolean { try { key();return true; } catch {return false;} }
export function decryptConnectionSecret(value: string, userId: string, provider: string, deptId: string): string {
  try {
    const [version, iv, tag, body, extra] = value.split(".");
    if (version !== "v2" || !iv || !tag || !body || extra !== undefined || !/^[A-Za-z0-9_-]{16}$/.test(iv) || !/^[A-Za-z0-9_-]{22}$/.test(tag) || !/^[A-Za-z0-9_-]+$/.test(body)) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(JSON.stringify(["sasu:retro:v2", userId, deptId, provider])));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("connection_credential_unavailable"); }
}
