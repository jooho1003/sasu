import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSlackToken, decryptSlackToken, oauthStateHash, exchangeSlackCode, slackAuthorizeUrl, SLACK_SCOPES } from "@/lib/slack/installation";
describe("Slack installation credential security", () => {
  beforeEach(() => { vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64")); vi.stubEnv("SLACK_CLIENT_ID", "123.456"); vi.stubEnv("SLACK_CLIENT_SECRET", "synthetic-client-secret"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("encrypts randomly and binds credentials to organization and workspace", () => {
    const first = encryptSlackToken("xoxb-synthetic-token", "org-a", "TA");
    expect(first).not.toContain("xoxb");
    expect(encryptSlackToken("xoxb-synthetic-token", "org-a", "TA")).not.toBe(first);
    expect(decryptSlackToken(first, "org-a", "TA")).toBe("xoxb-synthetic-token");
    expect(() => decryptSlackToken(first, "org-b", "TA")).toThrow();
    expect(() => decryptSlackToken(first, "org-a", "TB")).toThrow();
    expect(() => decryptSlackToken(first.slice(0, -3) + "AAA", "org-a", "TA")).toThrow();
  });
  it("refuses missing/wrong encryption keys without exposing secrets", () => {
    vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", "bad-secret");
    expect(() => encryptSlackToken("xoxb-sensitive", "a", "TA")).toThrow("slack_encryption_not_configured");
  });
  it("hashes one-time state and uses a fixed HTTPS callback and bot scopes", () => {
    expect(oauthStateHash("state")).toHaveLength(64);
    const url = new URL(slackAuthorizeUrl("state", "https://sasu.example/api/slack/oauth/callback"));
    expect(url.origin).toBe("https://slack.com"); expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe(SLACK_SCOPES.join(","));
    expect(() => slackAuthorizeUrl("state", "http://attacker.test/callback")).toThrow();
  });
  it("validates bot token, scopes and workspace before accepting an OAuth response", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, token_type: "bot", access_token: "xoxb-synthetic", scope: SLACK_SCOPES.join(","), team: { id: "TEXAMPLE", name: "QA" }, bot_user_id: "UBOT" }));
    vi.stubGlobal("fetch", fetcher);
    const result = await exchangeSlackCode("code", "https://sasu.example/api/slack/oauth/callback");
    expect(result.teamId).toBe("TEXAMPLE"); expect(result.token).toBe("xoxb-synthetic");
    expect(fetcher.mock.calls[0][0]).toBe("https://slack.com/api/oauth.v2.access");
    fetcher.mockResolvedValue(Response.json({ ok: true, access_token: "xoxb-secret", token_type: "bot", scope: "chat:write", team: { id: "TA" } }));
    await expect(exchangeSlackCode("code", "https://sasu.example/api/slack/oauth/callback")).rejects.toThrow("slack_oauth_invalid_response");
  });
  it("rejects rotating/enterprise installs instead of persisting expiring credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, access_token: "xoxb-secret", refresh_token: "refresh", token_type: "bot", scope: SLACK_SCOPES.join(","), team: { id: "TA", name: "QA" }, bot_user_id: "UBOT" })));
    await expect(exchangeSlackCode("code", "https://sasu.example/api/slack/oauth/callback")).rejects.toThrow("slack_oauth_invalid_response");
  });
});
