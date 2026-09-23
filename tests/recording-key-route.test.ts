import { beforeEach, describe, expect, it, vi } from "vitest";

import { deriveRecordingKey } from "@/lib/recording/recording-key";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));

import { POST } from "@/app/api/d/[dept]/recordings/[id]/key/route";

const deptId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const recordingId = "33333333-3333-4333-8333-333333333333";
const secret = "0123456789abcdef0123456789abcdef0123456789abcdef";
const context = { params: Promise.resolve({ dept: deptId, id: recordingId }) };

describe("recording key route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.stubEnv("RECORDING_KEY_SECRET", secret);
    mocks.membership.mockResolvedValue({
      userId,
      deptId,
      role: "lead",
      displayName: "팀장",
      consentedAt: "2026-09-20T00:00:00Z",
    });
    mocks.create.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({
      data: { recording_id: recordingId, user_id: userId, dept_id: deptId },
      error: null,
    });
  });

  it("derives a no-store key only from the SQL-validated session context", async () => {
    const response = await POST(new Request("http://localhost"), context);
    const expected = await deriveRecordingKey(secret, { recordingId, userId, deptId });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ key: Buffer.from(expected).toString("base64url") });
    expect(mocks.rpc).toHaveBeenCalledWith("recording_key_context", {
      p_dept: deptId,
      p_review: recordingId,
    });
  });

  it.each([
    [{ code: "42501", message: "review_editor_required" }, 403],
    [{ code: "42501", message: "browser_recording_disabled" }, 403],
    [{ code: "P0002", message: "recording_unavailable" }, 404],
  ])("maps SQL authorization failures without deriving a key", async (error, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it("rejects non-leads, missing consent, mismatched SQL context, and missing server secret", async () => {
    mocks.membership.mockResolvedValueOnce({ userId, deptId, role: "member", consentedAt: "now" });
    expect((await POST(new Request("http://localhost"), context)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.membership.mockResolvedValueOnce({ userId, deptId, role: "lead", consentedAt: null });
    expect((await POST(new Request("http://localhost"), context)).status).toBe(403);

    mocks.rpc.mockResolvedValueOnce({
      data: { recording_id: recordingId, user_id: "forged", dept_id: deptId },
      error: null,
    });
    expect((await POST(new Request("http://localhost"), context)).status).toBe(403);

    vi.stubEnv("RECORDING_KEY_SECRET", "");
    expect((await POST(new Request("http://localhost"), context)).status).toBe(503);
  });
});
