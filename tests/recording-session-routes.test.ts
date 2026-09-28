import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), rpc: vi.fn(), create: vi.fn(), kickWorker: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.create }));
vi.mock("@/lib/jobs", () => ({ kickWorker: mocks.kickWorker }));

import { GET, POST } from "@/app/api/d/[dept]/recordings/route";
import { GET as getOne } from "@/app/api/d/[dept]/recordings/[id]/route";
import { POST as discard } from "@/app/api/d/[dept]/recordings/[id]/discard/route";
import { POST as save } from "@/app/api/d/[dept]/recordings/[id]/save/route";
import { POST as finalize } from "@/app/api/d/[dept]/recordings/[id]/finalize/route";

const dept = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ dept: "department-slug", id }) };
const body = { id, title: "주간 회의", input_method: "microphone", visibility: "leads_only", participants: [], consent_confirmed: true, meeting_provider: "in_person" };
const request = (value: unknown = body) => new Request("https://sasu.example/api", { method: "POST", body: JSON.stringify(value) });
const manifest = { version: 1, segments: [{ index: 0, sample_count: 16_000, bytes: 32_044, sha256: "a".repeat(64) }] };
const capture = { paused: false, interrupted: false, captured_samples: 16_000 };
const saveBody = { manifest, capture };
const saveRequest = (value: unknown = saveBody) => new Request("https://sasu.example/api", { method: "POST", body: JSON.stringify(value) });

describe("recording metadata routes", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    vi.stubEnv("RECORDING_KEY_SECRET", "0123456789abcdef0123456789abcdef0123456789abcdef");
    mocks.membership.mockResolvedValue({ userId, deptId: dept, role: "lead", consentedAt: "2026-09-25" });
    mocks.create.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { id, state: "active", key_version: 1 }, error: null });
  });
  it("starts metadata using session department and server key version", async () => {
    vi.stubEnv("RECORDING_KEY_VERSION", "2");
    const result = await POST(request(), ctx);
    expect(result.status).toBe(201);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("start_review_recording", { p_dept: dept, p_input: body, p_key_version: 2 });
    expect(JSON.stringify(await result.json())).not.toContain("012345");
  });
  it("fixes a same-owner predecessor at session start through the continuation RPC", async () => {
    const continued = { ...body, continues_recording_id: "44444444-4444-4444-8444-444444444444" };
    expect((await POST(request(continued), ctx)).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("start_continued_review_recording", {
      p_dept: dept, p_input: continued, p_key_version: 1,
    });
    expect((await POST(request({ ...body, continues_recording_id: "bad" }), ctx)).status).toBe(400);
  });
  it.each(["dept_id", "created_by", "key_version", "original_path", "audio"])("rejects forged %s before SQL", async (key) => {
    expect((await POST(request({ ...body, [key]: "forged" }), ctx)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails before creating a session if key configuration is unavailable", async () => {
    vi.stubEnv("RECORDING_KEY_SECRET", "");
    expect((await POST(request(), ctx)).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the RLS-bound listing RPC and returns missing single sessions as 404", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await GET(request(), ctx)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("list_review_recordings", { p_dept: dept });
    expect((await getOne(request(), ctx)).status).toBe(404);
    expect(mocks.rpc).toHaveBeenLastCalledWith("list_review_recordings", { p_dept: dept, p_recording: id });
    mocks.rpc.mockResolvedValue({ data: [{ id, state: "expired" }], error: null });
    expect(await (await getOne(request(), ctx)).json()).toEqual({ recording: { id, state: "expired" } });
  });
  it("lists only the session owner's recent recordings for continuation", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id }], error: null }) };
    mocks.create.mockResolvedValue({ rpc: mocks.rpc, from: vi.fn().mockReturnValue(query) });
    const result = await GET(new Request("https://sasu.example/api/d/department-slug/recordings?recent=1"), ctx);
    expect(await result.json()).toEqual({ recordings: [{ id }] });
    expect(query.eq).toHaveBeenCalledWith("dept_id", dept);
    expect(query.eq).toHaveBeenCalledWith("created_by", userId);
  });
  it("discards only the route ID with the session department and kicks the worker", async () => {
    mocks.rpc.mockResolvedValue({ data: { id, state: "discarded" }, error: null });
    expect(await (await discard(request({ id: "forged" }), ctx)).json()).toEqual({ recording: { id, state: "discarded" } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("discard_review_recording", { p_dept: dept, p_recording: id });
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });
  it("does not kick the worker when discard fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "recording_already_saved" } });
    const result = await discard(request(), ctx);
    expect(result.status).toBe(409);
    expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  it("saves using the session department and route id, forwarding only manifest/capture", async () => {
    mocks.rpc.mockResolvedValue({ data: { review_id: id, state: "saving", segments: [] }, error: null });
    const result = await save(saveRequest(), ctx);
    expect(result.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_review_recording", {
      p_dept: dept, p_recording: id, p_manifest: manifest, p_capture: capture,
    });
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  it.each(["dept_id", "created_by", "path", "attempt", "status"])("rejects a forged %s in the save body before RPC", async (key) => {
    const result = await save(saveRequest({ ...saveBody, [key]: "forged" }), ctx);
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects an invalid manifest before RPC", async () => {
    const result = await save(saveRequest({ manifest: { version: 1, segments: [] }, capture }), ctx);
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid capture metadata before RPC", async () => {
    const result = await save(saveRequest({ manifest, capture: { paused: false, interrupted: false, captured_samples: 0 } }), ctx);
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a malformed recording id for save and finalize before RPC", async () => {
    const badCtx = { params: Promise.resolve({ dept, id: "bad" }) };
    expect((await save(saveRequest(), badCtx)).status).toBe(400);
    expect((await finalize(request(), badCtx)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks member/unconsented access before RPC for save and finalize", async () => {
    mocks.membership.mockResolvedValueOnce({ userId, deptId: dept, role: "member", consentedAt: "now" });
    expect((await save(saveRequest(), ctx)).status).toBe(403);
    mocks.membership.mockResolvedValueOnce({ userId, deptId: dept, role: "lead", consentedAt: null });
    expect((await finalize(request(), ctx)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("finalizes with the session department and route id, ignores the body, and kicks the worker once on success", async () => {
    mocks.rpc.mockResolvedValue({ data: { review_id: id, state: "completed", segments: [] }, error: null });
    const result = await finalize(request({ forged: true }), ctx);
    expect(result.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("finalize_review_recording", { p_dept: dept, p_recording: id });
    expect(mocks.kickWorker).toHaveBeenCalledOnce();
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("does not kick the worker when finalize fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "recording_not_saved" } });
    const result = await finalize(request(), ctx);
    expect(result.status).toBe(409);
    expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  // recordingFailure's per-code and per-message mapping (incl. recording_not_saved /
  // recording_failed / recording_already_saved and the unknown-code fallback) is unit
  // tested directly in tests/recording/recording-routes.test.ts, next to its module.
  it.each([["42501", 403], ["P0002", 404], ["40001", 409], ["23505", 409], ["55000", 409], ["54000", 429], ["22023", 400], ["XX000", 500]])("maps %s without exposing SQL details", async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private database text" } });
    const result = await POST(request(), ctx);
    expect(result.status).toBe(status);
    expect(await result.text()).not.toContain("private database text");
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("blocks member/missing consent and malformed IDs before RPC", async () => {
    mocks.membership.mockResolvedValueOnce({ userId, deptId: dept, role: "member", consentedAt: "now" });
    expect((await POST(request(), ctx)).status).toBe(403);
    mocks.membership.mockResolvedValueOnce({ userId, deptId: dept, role: "lead", consentedAt: null });
    expect((await GET(request(), ctx)).status).toBe(403);
    expect((await getOne(request(), { params: Promise.resolve({ dept, id: "bad" }) })).status).toBe(400);
    expect((await discard(request(), { params: Promise.resolve({ dept, id: "bad" }) })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
