import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));

import { NO_STORE, recordingAccess, recordingFailure } from "@/lib/recording/recording-routes";

describe("NO_STORE", () => {
  it("declares the shared private no-store cache header", () => {
    expect(NO_STORE).toEqual({ "cache-control": "private, no-store, max-age=0" });
  });
});

describe("recordingFailure", () => {
  it.each([
    ["42501", 403, "녹음 권한과 참여자 동의, 조직 설정을 확인해 주세요."],
    ["P0002", 404, "녹음 기록을 찾을 수 없습니다."],
    ["40001", 409, "같은 녹음 번호의 정보가 다릅니다. 기존 기록을 확인해 주세요."],
    ["55000", 409, "이미 끝난 녹음입니다. 현재 상태를 확인해 주세요."],
    ["54000", 429, "진행 중인 녹음이 많습니다. 기존 녹음을 저장하거나 폐기해 주세요."],
    ["22023", 400, "녹음 정보와 동의 항목을 확인해 주세요."],
    ["XX000", 500, "녹음 기록을 처리하지 못했습니다. 다시 시도해 주세요."],
    ["", 500, "녹음 기록을 처리하지 못했습니다. 다시 시도해 주세요."],
  ])("maps code %s to status %i without leaking the SQL message, with no-store", async (code, status, korean) => {
    const result = recordingFailure({ code, message: "private database text" });
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toContain("no-store");
    const text = await result.text();
    expect(text).toContain(korean);
    expect(text).not.toContain("private database text");
  });

  it("maps a null error to the generic 500 fallback with no-store", async () => {
    const result = recordingFailure(null);
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await result.text()).toContain("녹음 기록을 처리하지 못했습니다. 다시 시도해 주세요.");
  });

  it.each([
    ["recording_not_saved", 409, "먼저 녹음을 저장해 주세요."],
    ["recording_failed", 409, "원본 확인에 실패했습니다. 녹음을 폐기하고 다시 녹음해 주세요."],
    ["recording_already_saved", 409, "저장이 끝난 녹음입니다. 자료 검토함에서 확인해 주세요."],
  ])("maps SQL message %s to a specific status before the generic code map, with no-store", async (message, status, korean) => {
    const result = recordingFailure({ code: "55000", message });
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await result.text()).toContain(korean);
  });

  it("falls back to the generic 55000 mapping when the message does not match a specific case", async () => {
    const result = recordingFailure({ code: "55000", message: "private database text" });
    expect(result.status).toBe(409);
    const text = await result.text();
    expect(text).toContain("이미 끝난 녹음입니다. 현재 상태를 확인해 주세요.");
    expect(text).not.toContain("private database text");
  });
});

describe("recordingAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 403 without creating a client for a member", async () => {
    mocks.membership.mockResolvedValue({ userId: "user", deptId: "dept", role: "member", consentedAt: "2026-09-25" });
    const result = await recordingAccess("dept-slug");
    expect(result.response).toBeInstanceOf(Response);
    expect(result.response?.status).toBe(403);
    expect(result.response?.headers.get("cache-control")).toContain("no-store");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 403 without creating a client for an unconsented lead", async () => {
    mocks.membership.mockResolvedValue({ userId: "user", deptId: "dept", role: "lead", consentedAt: null });
    const result = await recordingAccess("dept-slug");
    expect(result.response?.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns the member and a session client for a consented lead", async () => {
    const member = { userId: "user", deptId: "dept", role: "lead", consentedAt: "2026-09-25" };
    mocks.membership.mockResolvedValue(member);
    const client = { rpc: vi.fn() };
    mocks.create.mockResolvedValue(client);
    const result = await recordingAccess("dept-slug");
    expect(result.response).toBeUndefined();
    expect(result.member).toEqual(member);
    expect(result.client).toBe(client);
    expect(mocks.membership).toHaveBeenCalledExactlyOnceWith("dept-slug");
  });
});
