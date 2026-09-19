import { describe, expect, it, vi } from "vitest";
import { pullConnector } from "@/lib/retro/connectors/pull";
import {
  authorizationUrl,
  exchangeCredential,
  validatePersonalToken,
} from "@/lib/retro/connectors/auth";

const date = "2026-09-19",
  at = "2026-09-19T01:00:00Z";
const credential = {
  accessToken: "synthetic",
  refreshToken: null,
  expiresAt: null,
  subjectId: "me",
  authKind: "oauth" as const,
  scopes: [],
};
const cloudId = "11111111-1111-4111-8111-111111111111";
const json = (value: unknown) => Response.json(value);
describe("확장 커넥터의 개인 귀속·최소 수집", () => {
  it("허브스팟은 사용자 단위 OAuth를 확인하고 계정 단위 토큰을 거절한다", async () => {
    vi.stubEnv("RETRO_HUBSPOT_CLIENT_ID", "client");
    vi.stubEnv("RETRO_HUBSPOT_CLIENT_SECRET", "secret");
    const make = (isUserLevel: boolean) =>
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            access_token: "token",
            refresh_token: "refresh",
            expires_in: 1800,
          }),
        )
        .mockResolvedValueOnce(
          json({
            active: true,
            client_id: "client",
            user_id: 123,
            scopes: ["oauth", "crm.objects.contacts.read"],
            signed_access_token: {
              userId: 123,
              isUserLevel,
              isServiceAccount: false,
            },
          }),
        );
    expect(
      new URL(
        authorizationUrl(
          "hubspot",
          "state",
          "https://app.test/callback",
          "proof",
        ),
      ).hostname,
    ).toBe("app.hubspot.com");
    expect(
      await exchangeCredential(
        "hubspot",
        "code",
        "https://app.test/callback",
        "proof",
        make(true),
      ),
    ).toMatchObject({ subjectId: "123", refreshToken: "refresh" });
    await expect(
      exchangeCredential(
        "hubspot",
        "code",
        "https://app.test/callback",
        "proof",
        make(false),
      ),
    ).rejects.toThrow("connector_scope_denied");
    vi.unstubAllEnvs();
  });
  it("허브스팟은 본인이 생성한 활동의 존재만 남기고 통화 시스템·고객 본문을 제외한다", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json({
        results: [
          {
            id: "own",
            properties: {
              hs_created_by_user_id: "me",
              hs_timestamp: at,
              hs_call_body: "PRIVATE",
            },
          },
          {
            id: "assigned",
            properties: {
              hs_created_by_user_id: "other",
              hubspot_owner_id: "me",
              hs_timestamp: at,
            },
          },
          ...(url.includes("/calls/")
            ? [
                {
                  id: "recording",
                  properties: {
                    hs_created_by_user_id: "me",
                    hs_timestamp: at,
                    hs_call_source: "INTEGRATIONS_PLATFORM",
                  },
                },
              ]
            : []),
        ],
      }),
    );
    const output = await pullConnector(
      "hubspot",
      {},
      credential,
      date,
      fetcher as typeof fetch,
    );
    expect(output.map((a) => a.kind)).toEqual([
      "crm_call",
      "crm_meeting",
      "crm_email",
      "crm_note",
    ]);
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE|assigned|recording/);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("세일즈맵 개인 키를 /me로 확인하고 본인 노트의 존재만 가져온다", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json(
        url.includes("/user/me")
          ? { success: true, data: { user: { id: "me", name: "PRIVATE" } } }
          : {
              success: true,
              data: {
                memoList: [
                  {
                    id: "m1",
                    ownerId: "me",
                    createdAt: at,
                    text: "PRIVATE",
                    htmlBody: "PRIVATE",
                  },
                  { id: "m2", ownerId: "other", createdAt: at },
                ],
                nextCursor: null,
              },
            },
      ),
    );
    const personal = await validatePersonalToken(
      "salesmap",
      "synthetic",
      fetcher as typeof fetch,
    );
    expect(personal.subjectId).toBe("me");
    const output = await pullConnector(
      "salesmap",
      {},
      personal,
      date,
      fetcher as typeof fetch,
    );
    expect(output).toHaveLength(1);
    expect(output[0].kind).toBe("crm_note");
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("ownerId")).toBe(
      "me",
    );
  });
  it("인터컴은 개인 OAuth /me와 본인이 쓴 상담 구간만 사용한다", async () => {
    vi.stubEnv("RETRO_INTERCOM_CLIENT_ID", "client");
    vi.stubEnv("RETRO_INTERCOM_CLIENT_SECRET", "secret");
    const auth = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(
        json({ id: "me", type: "admin", email: "PRIVATE" }),
      );
    expect(
      await exchangeCredential(
        "intercom",
        "code",
        "https://app.test/callback",
        "proof",
        auth,
      ),
    ).toMatchObject({ subjectId: "me" });
    const fetcher = vi.fn(async (url: string) =>
      json(
        url.includes("/search")
          ? { conversations: [{ id: "123" }], pages: {} }
          : {
              id: "123",
              source: {
                author: { id: "other", type: "user" },
                body: "PRIVATE",
              },
              conversation_parts: {
                conversation_parts: [
                  {
                    id: "part1",
                    author: { id: "me", type: "admin" },
                    part_type: "comment",
                    created_at: Date.parse(at) / 1000,
                    body: "PRIVATE",
                  },
                  {
                    id: "part2",
                    author: { id: "other", type: "admin" },
                    part_type: "close",
                    created_at: Date.parse(at) / 1000,
                  },
                ],
              },
            },
      ),
    );
    const output = await pullConnector(
      "intercom",
      {},
      credential,
      date,
      fetcher as typeof fetch,
    );
    expect(output).toHaveLength(1);
    expect(output[0].kind).toBe("ticket_handled");
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
    vi.unstubAllEnvs();
  });
  it("깃허브 푸시는 선택한 저장소에서 본인 행위만 저장한다", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json(
        url.includes("/events")
          ? [
              {
                id: "push",
                type: "PushEvent",
                actor: { id: "me" },
                created_at: at,
                payload: { commits: [{ message: "PRIVATE" }] },
              },
              {
                id: "other",
                type: "PushEvent",
                actor: { id: "other" },
                created_at: at,
              },
            ]
          : [],
      ),
    );
    const output = await pullConnector(
      "github",
      { repositories: ["team/app"] },
      credential,
      date,
      fetcher as typeof fetch,
    );
    expect(output).toHaveLength(1);
    expect(output[0].kind).toBe("github_push");
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it("지라는 고른 프로젝트의 본인 상태 전이·작업 기록만 남긴다", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json(
        url.includes("accessible-resources")
          ? [{ id: cloudId, scopes: ["read:jira-work"] }]
          : url.includes("search/jql")
            ? { issues: [{ key: "SASU-1" }], isLast: true }
            : url.includes("changelog")
              ? {
                  values: [
                    {
                      id: "c1",
                      author: { accountId: "me" },
                      created: at,
                      items: [
                        {
                          field: "status",
                          fromString: "할 일",
                          toString: "완료",
                        },
                      ],
                    },
                    {
                      id: "c2",
                      author: { accountId: "other" },
                      created: at,
                      items: [{ field: "status", toString: "완료" }],
                    },
                  ],
                  isLast: true,
                }
              : {
                  worklogs: [
                    {
                      id: "w1",
                      author: { accountId: "me" },
                      created: at,
                      started: at,
                      timeSpentSeconds: 600,
                      comment: { name: "PRIVATE" },
                    },
                  ],
                  total: 1,
                },
      ),
    );
    const output = await pullConnector(
      "jira",
      { cloudId, projects: ["SASU"] },
      credential,
      date,
      fetcher as typeof fetch,
    );
    expect(output.map((a) => a.kind)).toEqual([
      "jira_transition",
      "jira_worklog",
    ]);
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
    const body = JSON.parse(
      String(
        fetcher.mock.calls.find(([u]) => u.includes("search/jql")) &&
          (fetcher.mock.calls as unknown as [string, RequestInit][]).find(
            ([u]) => u.includes("search/jql"),
          )![1].body,
      ),
    );
    expect(body.jql).toContain('project in ("SASU")');
  });
  it("허용하지 않은 Atlassian 사이트에서는 문서를 읽지 않는다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json([{ id: "another", scopes: ["read:jira-work"] }]),
    );
    await expect(
      pullConnector(
        "jira",
        { cloudId, projects: ["SASU"] },
        credential,
        date,
        fetcher,
      ),
    ).rejects.toThrow("connector_scope_denied");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("컨플루언스는 선택한 페이지의 본인 버전·댓글만 읽고 본문은 요구하지 않는다", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json(
        url.includes("accessible-resources")
          ? [
              {
                id: cloudId,
                scopes: ["read:page:confluence", "read:comment:confluence"],
              },
            ]
          : url.includes("versions")
            ? {
                results: [
                  { number: 7, authorId: "me", createdAt: at, message: "정리" },
                  { number: 8, authorId: "other", createdAt: at },
                ],
                _links: {},
              }
            : {
                results: [
                  {
                    id: "c",
                    version: { number: 1, authorId: "me", createdAt: at },
                    body: { storage: { value: "PRIVATE" } },
                  },
                ],
                _links: {},
              },
      ),
    );
    const output = await pullConnector(
      "confluence",
      { cloudId, pageIds: ["1234"] } as never,
      credential,
      date,
      fetcher as typeof fetch,
    );
    expect(output.map((a) => a.kind)).toEqual([
      "confluence_edit",
      "confluence_comment",
    ]);
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
    expect(fetcher.mock.calls.every(([u]) => !u.includes("body-format"))).toBe(
      true,
    );
  });
  it("파이프드라이브는 담당자와 작성자가 모두 본인인 당일 생성 기록만 저장한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json({
        data: [
          {
            id: 1,
            owner_id: "me",
            creator_user_id: "other",
            add_time: at,
            type: "call",
          },
          {
            id: 2,
            owner_id: "me",
            creator_user_id: "me",
            add_time: at,
            type: "call",
            subject: "PRIVATE",
            person_id: "PRIVATE",
            participants: [{ email: "PRIVATE" }],
          },
        ],
        additional_data: {},
      }),
    );
    const output = await pullConnector(
      "pipedrive",
      {},
      credential,
      date,
      fetcher,
    );
    expect(output).toHaveLength(1);
    expect(output[0].kind).toBe("crm_call");
    expect(JSON.stringify(output)).not.toContain("PRIVATE");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("owner_id")).toBe("me");
    expect(url.searchParams.has("filter_id")).toBe(false);
  });
  it("리니어는 지정한 이슈의 사람 행위자만 반영하고 GraphQL 오류를 실패로 처리한다", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json({
        data: {
          issue: {
            id: "issue",
            identifier: "ENG-1",
            history: {
              nodes: [
                { id: "h", actorId: "me", createdAt: at },
                { id: "other", actorId: "other", createdAt: at },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      }),
    );
    const output = await pullConnector(
      "linear" as never,
      { issues: [cloudId] } as never,
      credential,
      date,
      fetcher,
    );
    expect(output).toHaveLength(1);
    expect(output[0].kind).toBe("linear_change");
    await expect(
      pullConnector(
        "linear" as never,
        { issues: [cloudId] } as never,
        credential,
        date,
        async () =>
          json({ errors: [{ message: "private" }] }),
      ),
    ).rejects.toThrow("connector_failed");
  });
  it("유튜브는 forMine로 당일 업로드를 찾고 GA4는 식별 차원 없이 합계만 저장한다", async () => {
    const youtube = vi.fn<typeof fetch>(async () =>
      json({
        items: [
          {
            id: { videoId: "v1" },
            snippet: {
              publishedAt: at,
              title: "발행 영상",
              description: "PRIVATE",
            },
          },
        ],
      }),
    );
    const videos = await pullConnector(
      "youtube",
      {},
      credential,
      date,
      youtube,
    );
    expect(videos).toHaveLength(1);
    expect(
      new URL(String(youtube.mock.calls[0][0])).searchParams.get("forMine"),
    ).toBe("true");
    expect(JSON.stringify(videos)).not.toContain("PRIVATE");
    const ga = vi.fn<typeof fetch>(async () =>
      json({
        metricHeaders: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
        rows: [
          { metricValues: [{ value: "7" }, { value: "9" }, { value: "11" }] },
        ],
      }),
    );
    const metrics = await pullConnector(
      "ga4",
      { propertyId: "123" },
      credential,
      date,
      ga,
    );
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      kind: "metric_snapshot",
      meta: { activeUsers: 7, sessions: 9, screenPageViews: 11 },
    });
    const request = JSON.parse(
      String((ga.mock.calls as unknown as [string, RequestInit][])[0][1].body),
    );
    expect(request.dimensions).toBeUndefined();
    expect(request.dateRanges).toEqual([{ startDate: date, endDate: date }]);
  });
  it("새 OAuth 제공자는 읽기 권한·개인 주체를 요청하고 /me로 식별한다", async () => {
    for (const name of ["ATLASSIAN", "PIPEDRIVE", "LINEAR"]) {
      vi.stubEnv(`RETRO_${name}_CLIENT_ID`, "client");
      vi.stubEnv(`RETRO_${name}_CLIENT_SECRET`, "secret");
    }
    const jira = new URL(
      authorizationUrl("jira", "state", "https://app.test/callback", "proof"),
    );
    expect(jira.searchParams.get("scope")).toContain("read:jira-work");
    expect(jira.searchParams.get("scope")).not.toContain("write:");
    const linear = new URL(
      authorizationUrl(
        "linear" as never,
        "state",
        "https://app.test/callback",
        "proof",
      ),
    );
    expect(linear.searchParams.get("actor")).toBe("user");
    expect(linear.searchParams.get("code_challenge_method")).toBe("S256");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          access_token: "new",
          refresh_token: "refresh",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(json({ account_id: "me", email: "PRIVATE" }));
    expect(
      await exchangeCredential(
        "jira",
        "code",
        "https://app.test/callback",
        "proof",
        fetcher,
      ),
    ).toMatchObject({ subjectId: "me", authKind: "oauth" });
    vi.unstubAllEnvs();
  });
});
