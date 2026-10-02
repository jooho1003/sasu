import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  readBearer,
  requireBearerUser,
  requireDeviceContext,
} from "@/lib/companion/device-context";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";
const LINK_ID = "33333333-3333-4333-8333-333333333333";

function request(authorization?: string) {
  return new Request("http://localhost/api/companion/link?dept=ignored", {
    headers: authorization ? { authorization } : undefined,
  });
}

function fakeClient(options?: {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  contextData?: unknown[] | null;
  contextError?: { code?: string; message: string } | null;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options?.user === undefined ? { id: USER_ID } : options.user },
    error: options?.userError ?? null,
  });
  const rpc = vi.fn().mockResolvedValue({
    data:
      options?.contextData === undefined
        ? [
            {
              link_id: LINK_ID,
              dept_id: DEPT_ID,
              dept_name: "영업팀",
              role: "member",
              display_name: "이사수",
              consented_at: null,
            },
          ]
        : options.contextData,
    error: options?.contextError ?? null,
  });

  return {
    client: { auth: { getUser }, rpc } as unknown as SupabaseClient,
    getUser,
    rpc,
  };
}

describe("readBearer", () => {
  it("reads one case-insensitive Bearer token", () => {
    expect(readBearer(request("bearer device-token"))).toBe("device-token");
  });

  it.each([
    undefined,
    "",
    "Basic abc",
    "Bearer",
    "Bearer one two",
    "Bearer token, Bearer second",
  ])("rejects a missing or malformed authorization header", (authorization) => {
    expect(readBearer(request(authorization))).toBeNull();
  });
});

describe("requireBearerUser", () => {
  it("returns no_token without creating a client", async () => {
    const createClient = vi.fn();

    const result = await requireBearerUser(request(), { createClient });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "기기 로그인이 필요합니다.",
      code: "no_token",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("validates the exact token with getUser", async () => {
    const { client, getUser } = fakeClient();
    const createClient = vi.fn(() => client);

    const result = await requireBearerUser(request("Bearer signed-token"), {
      createClient,
    });

    expect(createClient).toHaveBeenCalledWith("signed-token");
    expect(getUser).toHaveBeenCalledWith("signed-token");
    expect(result).toEqual({
      ok: true,
      client,
      userId: USER_ID,
      token: "signed-token",
    });
  });

  it.each([
    { user: null, userError: null },
    { user: null, userError: { message: "session_not_found" } },
  ])("maps an absent or rejected auth session to session_invalid", async (state) => {
    const { client } = fakeClient(state);

    const result = await requireBearerUser(request("Bearer expired"), {
      createClient: () => client,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "기기 로그인이 만료되었습니다. 다시 로그인해 주세요.",
      code: "session_invalid",
    });
  });
});

describe("requireDeviceContext", () => {
  it("returns device_revoked when companion_context has no row", async () => {
    const { client } = fakeClient({ contextData: [] });

    const result = await requireDeviceContext(request("Bearer active"), {
      createClient: () => client,
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "이 기기 연결이 해제되었습니다. 다시 로그인해 주세요.",
      code: "device_revoked",
    });
  });

  it("builds all department authority fields only from companion_context", async () => {
    const { client, rpc } = fakeClient();

    const result = await requireDeviceContext(request("Bearer active"), {
      createClient: () => client,
    });

    expect(rpc).toHaveBeenCalledWith("companion_context");
    expect(result).toEqual({
      ok: true,
      ctx: {
        client,
        userId: USER_ID,
        deptId: DEPT_ID,
        role: "member",
        consentedAt: null,
        linkId: LINK_ID,
        deptName: "영업팀",
        displayName: "이사수",
      },
    });
  });

  it("returns a result instead of throwing when the context query fails", async () => {
    const { client } = fakeClient({
      contextData: null,
      contextError: { code: "XX000", message: "database unavailable" },
    });

    const result = await requireDeviceContext(request("Bearer active"), {
      createClient: () => client,
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "기기 연결을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      code: "context_failed",
    });
  });
});
