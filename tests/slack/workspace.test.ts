import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSlackToken, withSlackCredentials, withSlackDepartment } from "@/lib/slack/workspace";
import { encryptSlackToken } from "@/lib/slack/installation";
afterEach(() => vi.unstubAllEnvs());
describe("Slack workspace isolation", () => {
  it("keeps concurrent workspace tokens separate across awaits", async () => {
    await Promise.all(["token-a", "token-b"].map(token => withSlackCredentials({ token, orgId: token, teamId: "T" }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5)); expect(currentSlackToken()).toBe(token);
    })));
    expect(currentSlackToken()).toBeUndefined();
  });
  it("uninstalled departments never fall back to a different workspace token", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "legacy-other-org");
    await withSlackDepartment({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }, "dept", async () => expect(currentSlackToken()).toBeNull());
  });
  it("decrypts only the installation returned by the authority-checking SQL RPC", async () => {
    vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64"));
    const rpc = vi.fn().mockResolvedValue({ data: { org_id: "org", team_id: "TA", encrypted_token: encryptSlackToken("xoxb-team-a", "org", "TA") }, error: null });
    await withSlackDepartment({ rpc }, "dept", async () => expect(currentSlackToken()).toBe("xoxb-team-a"));
    expect(rpc).toHaveBeenCalledWith("slack_installation_for_department", { p_dept: "dept" });
  });
});
