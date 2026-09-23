import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from }) }));
import { GET } from "@/app/api/d/[dept]/evidence/[id]/route";
const answerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const read = (answer?: string) => GET(new Request(`http://localhost${answer === undefined ? "" : `?answer=${encodeURIComponent(answer)}`}`), { params: Promise.resolve({ dept: "requested-dept", id: "item-1" }) });
describe("원문 열람", () => {
  let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> };
  let citation: typeof query;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.membership.mockResolvedValue({ deptId: "verified-dept", userId: "member" });
    query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: "item-1", content: "마스킹된 원문", author: null, sources: [{ title: "회의 기록", kind: "meeting_transcript" }] }, error: null });
    citation = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
    citation.select.mockReturnValue(citation); citation.eq.mockReturnValue(citation);
    citation.maybeSingle.mockResolvedValue({ data: { quote: "마스킹된" }, error: null });
    mocks.from.mockImplementation(table => table === "citations" ? citation : query);
  });
  it("보이는 원문을 확인한 뒤 세션 RLS로 해당 답변의 인용만 강조한다", async () => {
    const response = await read(answerId);
    expect(await response.json()).toMatchObject({ kind: "meeting_transcript", highlight: "마스킹된" });
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(["items", "citations"]);
    expect(citation.select).toHaveBeenCalledWith("quote");
    expect(citation.eq.mock.calls).toEqual([["owner_kind", "answer"], ["owner_id", answerId], ["item_id", "item-1"]]);
    expect(query.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(citation.select.mock.invocationCallOrder[0]);
  });
  it.each([undefined, "", "invalid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' OR true"])("유효한 UUID가 아니면 인용을 조회하지 않는다", async answer => {
    expect(await (await read(answer)).json()).toMatchObject({ highlight: null });
    expect(citation.select).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: { quote: "다른 원문" }, error: null }, { data: { quote: "" }, error: null }, { data: { quote: "마스킹된" }, error: { code: "57014" } }])("강조 실패는 원문 읽기를 막지 않는다", async result => {
    citation.maybeSingle.mockResolvedValue(result);
    const response = await read(answerId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ highlight: null, content: "마스킹된 원문" });
  });
  it("선택적인 강조 조회가 예외를 던져도 원문을 반환한다", async () => {
    citation.maybeSingle.mockRejectedValue(new Error("private details"));
    const response = await read(answerId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ highlight: null });
  });
  it("세션 부서의 삭제되지 않은 활성 원문만 조회한다", async () => {
    const response = await read();
    expect(query.eq).toHaveBeenCalledWith("dept_id", "verified-dept");
    expect(query.eq).toHaveBeenCalledWith("sources.active", true);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(await response.json()).toMatchObject({ title: "회의 기록", content: "마스킹된 원문" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("RLS가 숨긴 항목은 존재 여부와 본문을 반환하지 않는다", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await read(answerId); expect(response.status).toBe(404);
    expect(citation.select).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("content");
  });
  it("멤버십 검증 실패 뒤에는 자료를 조회하지 않는다", async () => {
    mocks.membership.mockRejectedValue(new Error("membership_required"));
    await expect(read()).rejects.toThrow("membership_required"); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("DB 오류 원문을 노출하지 않는다", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "private details" } });
    const response = await read(); expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private details");
  });
});
