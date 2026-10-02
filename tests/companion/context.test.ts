import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  CompanionContextResponse,
  CompanionDepartmentsResponse,
  CompanionLinkInput,
  CompanionLinkResponse,
} from "@/lib/contracts";
import {
  actorFromMembership,
  jsonResult,
  type Result,
} from "@/lib/companion/context";
import type { Membership } from "@/lib/supabase/membership";

describe("actorFromMembership", () => {
  it("maps the authenticated membership without changing its authority fields", () => {
    const client = {} as SupabaseClient;
    const membership: Membership = {
      userId: "11111111-1111-4111-8111-111111111111",
      deptId: "22222222-2222-4222-8222-222222222222",
      role: "lead",
      displayName: "김사수",
      consentedAt: "2026-10-01T12:00:00.000Z",
    };

    expect(actorFromMembership(client, membership)).toEqual({
      client,
      userId: membership.userId,
      deptId: membership.deptId,
      role: "lead",
      consentedAt: membership.consentedAt,
    });
  });
});

describe("jsonResult", () => {
  it("returns a no-store JSON success response", async () => {
    const result: Result<{ linked: boolean }> = {
      ok: true,
      status: 201,
      body: { linked: true },
    };

    const response = jsonResult(result);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ linked: true });
  });

  it("returns only the public error and code for failures", async () => {
    const result: Result<never> = {
      ok: false,
      status: 401,
      error: "기기 로그인이 필요합니다.",
      code: "no_token",
    };

    const response = jsonResult(result);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "기기 로그인이 필요합니다.",
      code: "no_token",
    });
  });
});

describe("companion contracts", () => {
  it("accepts the E01 through E03 wire shapes", () => {
    const department = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "영업팀",
    };

    expect(
      CompanionDepartmentsResponse.parse({
        departments: [{ ...department, role: "lead", consented: true }],
      }),
    ).toBeTruthy();
    expect(
      CompanionLinkResponse.parse({
        link_id: "33333333-3333-4333-8333-333333333333",
        dept: department,
        role: "lead",
      }),
    ).toBeTruthy();
    expect(
      CompanionContextResponse.parse({
        link_id: "33333333-3333-4333-8333-333333333333",
        dept: department,
        role: "lead",
        display_name: "김사수",
      }),
    ).toBeTruthy();
  });

  it("keeps link input strict and bounded", () => {
    const valid = {
      dept_id: "22222222-2222-4222-8222-222222222222",
      device_name: "업무 노트북",
      app_version: "0.1.0",
    };

    expect(CompanionLinkInput.safeParse(valid).success).toBe(true);
    expect(
      CompanionLinkInput.safeParse({ ...valid, user_id: "not-allowed" })
        .success,
    ).toBe(false);
    expect(
      CompanionLinkInput.safeParse({ ...valid, device_name: "x".repeat(61) })
        .success,
    ).toBe(false);
  });
});
