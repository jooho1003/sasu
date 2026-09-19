import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const value = process.env.RETRO_CONNECTION_ENCRYPTION_KEY ?? process.env.NOTION_TOKEN_ENCRYPTION_KEY ?? "";
  const result = Buffer.from(value, "base64");
  if (result.length !== 32 || result.toString("base64") !== value) throw new Error("connection_encryption_not_configured");
  return result;
}
export function encryptConnectionSecret(secret: string, userId: string, provider: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`sasu:retro:${userId}:${provider}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptConnectionSecret(value: string, userId: string, provider: string): string {
  try {
    const [version, iv, tag, body] = value.split(".");
    if (version !== "v1" || !iv || !tag || !body) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`sasu:retro:${userId}:${provider}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("connection_credential_unavailable"); }
}
