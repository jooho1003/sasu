import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SLACK_SCOPES = ["app_mentions:read", "channels:history", "channels:read", "chat:write", "groups:history", "groups:read", "im:history", "im:write", "users:read"];
function encryptionKey(): Buffer {
  const value = process.env.SLACK_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("slack_encryption_not_configured");
  return key;
}
export function encryptSlackToken(token: string, org: string, team: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`sasu:slack:v1:${org}:${team}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptSlackToken(encrypted: string, org: string, team: string): string {
  try {
    const [version, iv, tag, ciphertext, extra] = encrypted.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`sasu:slack:v1:${org}:${team}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("slack_credential_unavailable"); }
}
export function oauthStateHash(state: string): string { return createHash("sha256").update(state).digest("hex"); }
function callbackUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("slack_oauth_invalid_callback");
  return url.href;
}
export function slackOAuthConfigured(): boolean {
  try { encryptionKey(); return Boolean(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim()); } catch { return false; }
}
export function slackAuthorizeUrl(state: string, redirectUri: string): string {
  if (!slackOAuthConfigured()) throw new Error("slack_oauth_not_configured");
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.search = new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!.trim(), scope: SLACK_SCOPES.join(","), redirect_uri: callbackUrl(redirectUri), state }).toString();
  return url.href;
}
export async function exchangeSlackCode(code: string, redirectUri: string): Promise<{ token: string; teamId: string; teamName: string; botUserId: string; scopes: string[] }> {
  if (!slackOAuthConfigured()) throw new Error("slack_oauth_not_configured");
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID!.trim(), client_secret: process.env.SLACK_CLIENT_SECRET!.trim(), code, redirect_uri: callbackUrl(redirectUri) }),
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  let result: { ok?: boolean; access_token?: unknown; token_type?: string; scope?: string; bot_user_id?: string; team?: { id?: string; name?: string }; refresh_token?: unknown; expires_in?: unknown; is_enterprise_install?: boolean };
  try { result = await response.json(); } catch { throw new Error("slack_oauth_invalid_response"); }
  const scopes = typeof result?.scope === "string" ? result.scope.split(",") : [];
  if (!response.ok || result?.ok !== true || result.token_type !== "bot" || typeof result.access_token !== "string" || !result.access_token.startsWith("xoxb-")
    || !/^T[A-Z0-9]+$/.test(result.team?.id ?? "") || !/^U[A-Z0-9]+$/.test(result.bot_user_id ?? "")
    || result.refresh_token || result.expires_in || result.is_enterprise_install || SLACK_SCOPES.some(scope => !scopes.includes(scope))) throw new Error("slack_oauth_invalid_response");
  return { token: result.access_token, teamId: result.team!.id!, teamName: (result.team?.name ?? "Slack").slice(0, 200), botUserId: result.bot_user_id!, scopes };
}
