import { afterEach, expect, it, vi } from "vitest";
import {
  exchangeMailchimp,
  mailchimpAuthorization,
  pullMailchimp,
} from "@/lib/retro/connectors/mailchimp";
afterEach(() => vi.unstubAllEnvs());
it("메일침프 OAuth의 서버 위치와 로그인 고유번호만 저장한다", async () => {
  vi.stubEnv("RETRO_MAILCHIMP_CLIENT_ID", "client");
  vi.stubEnv("RETRO_MAILCHIMP_CLIENT_SECRET", "secret");
  expect(
    new URL(
      mailchimpAuthorization("state", "https://app.test/cb"),
    ).searchParams.get("state"),
  ).toBe("state");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(
      Response.json({ dc: "us6", api_endpoint: "https://evil.test" }),
    )
    .mockResolvedValueOnce(
      Response.json({ login_id: "123", email: "PRIVATE" }),
    );
  const credential = await exchangeMailchimp(
    "code",
    "https://app.test/cb",
    fetcher,
  );
  expect(credential).toMatchObject({ subjectId: "us6:123", expiresAt: null });
  expect(JSON.stringify(credential)).not.toContain("PRIVATE");
  expect(fetcher.mock.calls[2][0]).toBe(
    "https://us6.api.mailchimp.com/3.0/?fields=login_id",
  );
  const bad = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(Response.json({ dc: "evil.test" }));
  await expect(
    exchangeMailchimp("code", "https://app.test/cb", bad),
  ).rejects.toThrow("connector_scope_denied");
});
it("메일침프는 캠페인 발송 수치만 읽고 개인 발송 행동이나 구독자를 수집하지 않는다", async () => {
  const get = vi.fn<(url: string | URL) => Promise<unknown>>(async () => ({
    campaigns: [
      {
        id: "a",
        status: "sent",
        send_time: "2026-09-19T01:00:00Z",
        emails_sent: 15,
        settings: { subject_line: "PRIVATE" },
        recipients: { name: "PRIVATE" },
      },
    ],
    total_items: 1,
  }));
  const output = await pullMailchimp("us6:123", "2026-09-19", get);
  expect(output).toHaveLength(1);
  expect(output[0].kind).toBe("metric_snapshot");
  expect(JSON.stringify(output)).not.toContain("PRIVATE");
  const url = new URL(String(get.mock.calls[0][0]));
  expect(url.searchParams.get("fields")).not.toMatch(
    /recipients|settings|content/,
  );
});
