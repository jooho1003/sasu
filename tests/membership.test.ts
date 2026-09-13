import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));

import {
  requirePageMembership,
  sanitizeInternalPath,
} from "@/lib/supabase/membership";

const DEPT_ID = "22222222-2222-4222-8222-222222222222";

function membershipClient(consentedAt: string | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: {
        dept_id: DEPT_ID,
        role: "member",
        display_name: "합성 팀원",
        consented_at: consentedAt,
      },
      error: null,
    })),
  };
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        error: null,
      })),
    },
    from: vi.fn(() => builder),
  };
}

describe("부서 페이지 동의 가드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
  });

  it("미동의 첫 방문은 내부 next 경로를 가진 동의 화면으로 보낸다", async () => {
    mocks.createClient.mockResolvedValue(membershipClient(null));

    await expect(
      requirePageMembership(DEPT_ID, `/d/${DEPT_ID}/settings`),
    ).rejects.toThrow(
      `REDIRECT:/consent?next=${encodeURIComponent(`/d/${DEPT_ID}/settings`)}`,
    );
  });

  it("동의한 멤버는 부서 페이지를 통과한다", async () => {
    mocks.createClient.mockResolvedValue(
      membershipClient("2026-09-13T00:00:00.000Z"),
    );

    await expect(
      requirePageMembership(DEPT_ID, `/d/${DEPT_ID}`),
    ).resolves.toMatchObject({ consentedAt: "2026-09-13T00:00:00.000Z" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("나중에 쿠키가 있으면 24시간 동안 재리다이렉트를 생략한다", async () => {
    mocks.createClient.mockResolvedValue(membershipClient(null));
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ name: "sasu_consent_later", value: "1" })),
    });

    await expect(
      requirePageMembership(DEPT_ID, `/d/${DEPT_ID}`),
    ).resolves.toMatchObject({ consentedAt: null });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("외부 URL과 프로토콜 상대 URL은 next로 허용하지 않는다", () => {
    const fallback = `/d/${DEPT_ID}`;

    expect(sanitizeInternalPath("https://evil.example/steal", fallback)).toBe(
      fallback,
    );
    expect(sanitizeInternalPath("//evil.example/steal", fallback)).toBe(
      fallback,
    );
    expect(sanitizeInternalPath("/d/safe", fallback)).toBe("/d/safe");
  });
});
