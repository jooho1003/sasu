import { afterEach, expect, it, vi } from "vitest";
import {
  zendeskAuthorization,
  exchangeZendesk,
  refreshZendesk,
  pullZendesk,
} from "@/lib/retro/connectors/zendesk";
afterEach(() => vi.unstubAllEnvs());
const config = { subdomain: "example-team" },
  date = "2026-09-19",
  at = date + "T01:00:00Z";
const credential = {
  accessToken: "synthetic",
  refreshToken: "old-refresh",
  expiresAt: 1,
  authKind: "oauth" as const,
  subjectId: "example-team:123",
  scopes: ["tickets:read", "users:read"],
};
function env() {
  vi.stubEnv("RETRO_ZENDESK_GLOBAL_CLIENT_ID", "global-client");
  vi.stubEnv("RETRO_ZENDESK_GLOBAL_CLIENT_SECRET", "synthetic-secret");
}
it("젠데스크는 선택한 사이트의 개인 상담원 OAuth만 연결한다", async () => {
  env();
  const url = new URL(
    zendeskAuthorization(config, "state", "https://app.test/cb"),
  );
  expect(url.hostname).toBe("example-team.zendesk.com");
  expect(url.searchParams.get("scope")).toBe("tickets:read users:read");
  expect(() =>
    zendeskAuthorization(
      { subdomain: "evil.example" },
      "state",
      "https://app.test/cb",
    ),
  ).toThrow("invalid_connection");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "token",
        refresh_token: "refresh",
        expires_in: 1800,
        scope: "tickets:read users:read",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ user: { id: 123, role: "agent", email: "PRIVATE" } }),
    );
  expect(
    await exchangeZendesk(config, "code", "https://app.test/cb", fetcher),
  ).toMatchObject({ subjectId: "example-team:123", refreshToken: "refresh" });
  const denied = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "token",
        scope: "tickets:read users:read",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ user: { id: 123, role: "end-user" } }),
    );
  await expect(
    exchangeZendesk(config, "code", "https://app.test/cb", denied),
  ).rejects.toThrow("connector_scope_denied");
});
it("사이트가 다른 토큰은 읽기·갱신 전에 거절하며 회전한 refresh token을 저장한다", async () => {
  env();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        access_token: "new",
        refresh_token: "new-refresh",
        expires_in: 1800,
        scope: "tickets:read users:read",
      }),
    );
  await expect(
    refreshZendesk({ subdomain: "other" }, credential, fetcher),
  ).rejects.toThrow("connector_scope_denied");
  expect(fetcher).not.toHaveBeenCalled();
  expect(await refreshZendesk(config, credential, fetcher)).toMatchObject({
    accessToken: "new",
    refreshToken: "new-refresh",
  });
});
it("본인 담당 티켓 중 본인 명의 일반 댓글만 가져오며 음성·대리·고객 본문은 제외한다", async () => {
  const get = vi.fn(async (url: string | URL) =>
    String(url).includes("/assigned")
      ? {
          tickets: [
            { id: 99, assignee_id: 123, updated_at: at, subject: "PRIVATE" },
          ],
          meta: { has_more: false },
        }
      : {
          comments: [
            {
              id: 1,
              author_id: 123,
              type: "Comment",
              created_at: at,
              body: "PRIVATE",
            },
            { id: 2, author_id: 456, type: "Comment", created_at: at },
            { id: 3, author_id: 123, type: "VoiceComment", created_at: at },
            {
              id: 4,
              author_id: 123,
              type: "Comment",
              created_at: at,
              metadata: { flags: [11] },
            },
          ],
          meta: { has_more: false },
        },
  );
  const output = await pullZendesk(config, credential, date, get);
  expect(output).toHaveLength(1);
  expect(output[0].kind).toBe("ticket_handled");
  expect(JSON.stringify(output)).not.toContain("PRIVATE");
  expect(
    get.mock.calls.every(([u]) => !String(u).includes("include=users")),
  ).toBe(true);
});
