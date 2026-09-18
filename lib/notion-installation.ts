import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function encryptionKey(): Buffer {
  const value = process.env["NOTION_TOKEN_ENCRYPTION_KEY"]?.trim() ?? "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("notion_encryption_not_configured");
  }
  return key;
}

function aad(org: string, workspace: string): Buffer {
  return Buffer.from(`sasu:notion:v1:${org}:${workspace}`);
}

export function notionTokenEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptNotionToken(
  token: string,
  org: string,
  workspace: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(org, workspace));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptNotionToken(
  encrypted: string,
  org: string,
  workspace: string,
): string {
  try {
    const [version, iv, tag, ciphertext, extra] = encrypted.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) {
      throw new Error();
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(aad(org, workspace));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("notion_credential_unavailable");
  }
}
