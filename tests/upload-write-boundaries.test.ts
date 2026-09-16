import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(), serverFrom: vi.fn(), rpc: vi.fn(), serviceFrom: vi.fn(),
  serviceClient: vi.fn(), enqueue: vi.fn(), kickWorker: vi.fn(),
  writes: [] as Array<{ client: string; table: string; value: unknown }>,
  sourceError: false, itemError: false,
  upload: vi.fn(),
}));
vi.mock("@/lib/supabase/membership", () => ({ requireMembership: mocks.membership }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.serverFrom, rpc: mocks.rpc, storage:{from:()=>({upload:mocks.upload})} }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: mocks.serviceClient }));
vi.mock("@/lib/jobs", () => ({ enqueue: mocks.enqueue, kickWorker: mocks.kickWorker }));
vi.mock("@/lib/pipeline/classify", () => ({ registerClassifyHandler: vi.fn() }));
vi.mock("@/lib/pipeline/embed", () => ({ registerEmbedHandler: vi.fn() }));
vi.mock("@/lib/pipeline/document-summary", () => ({ registerDocumentSummaryHandler: vi.fn() }));
vi.mock("@/lib/pipeline/meeting-summary", () => ({ registerMeetingSummaryHandler: vi.fn() }));

import { POST as documentPost } from "@/app/api/d/[dept]/documents/route";
import { POST as transcriptPost } from "@/app/api/d/[dept]/meetings/transcript/route";

const deptId = "22222222-2222-4222-8222-222222222222";
function builder(client: string, table: string) {
  const data = table === "members"
    ? [{ user_id: "lead", display_name: "팀장", slack_user_id: "U_LEAD", consented_at: "2026-09-15" },
      { user_id: "member", display_name: "미동의", slack_user_id: "U_NO", consented_at: null }]
    : table === "items" ? [{ id: "item" }] : { id: "source", source_id: "source" };
  const error = (table === "sources" && mocks.sourceError) || (table === "items" && mocks.itemError) ? { code: "42501" } : null;
  const result = { data: error ? null : data, error };
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    insert: vi.fn((value: unknown) => { mocks.writes.push({ client, table, value }); return query; }),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}
function request(kind: string, content?: string) {
  const form = new FormData();
  form.set("file", new File([content ?? (kind === "document"
    ? "합성 문서 연락 qa@example.com 010-1234-5678 예산 100만원"
    : "팀장: qa@example.com 010-1234-5678 예산 100만원\n미동의: 저장금지발언\n외부인: 미등록발언")], "fixture.txt", { type: "text/plain" }));
  form.set("dept_id", "forged-department");
  form.set("visibility", "leads_only");
  return new Request("http://localhost/upload", { method: "POST", body: form });
}
const params = { params: Promise.resolve({ dept: deptId }) };

beforeEach(() => {
  vi.resetAllMocks(); mocks.writes.length = 0; mocks.sourceError = false; mocks.itemError = false;
  mocks.membership.mockResolvedValue({ userId: "lead", deptId, role: "lead", displayName: "팀장" });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.serverFrom.mockImplementation(table => builder("session", table));
  mocks.serviceFrom.mockImplementation(table => {
    if (table !== "items") throw new Error("service role may only insert items");
    return builder("service", table);
  });
  mocks.serviceClient.mockReturnValue({ from: mocks.serviceFrom });
  mocks.enqueue.mockResolvedValue("job");
  mocks.upload.mockResolvedValue({error:null});
});

describe.each([["transcript", transcriptPost]] as const)("%s 업로드 저장 경계", (kind, post) => {
  it("member는 DB 쓰기와 service role 생성 전에 거부한다", async () => {
    mocks.membership.mockResolvedValue({ deptId, role: "member" });
    expect((await post(request(kind), params)).status).toBe(403);
    expect(mocks.writes).toEqual([]); expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it.each([true, null])("데모 또는 불명확한 데모 판정(%s)은 저장하지 않는다", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await post(request(kind), params)).status).toBe(data === true ? 403 : 500);
    expect(mocks.writes).toEqual([]); expect(mocks.serviceClient).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("데모 판정 RPC 오류는 닫힌 상태로 실패한다", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: { code: "failure" } });
    expect((await post(request(kind), params)).status).toBe(500);
    expect(mocks.writes).toEqual([]); expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("소스의 세션 쓰기 실패 시 service role로 우회하지 않는다", async () => {
    mocks.sourceError = true;
    expect((await post(request(kind), params)).status).toBe(500);
    expect(mocks.serviceClient).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("세션 부서의 마스킹된 items만 service role로 저장하고 나머지는 세션을 유지한다", async () => {
    expect((await post(request(kind), params)).status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("is_demo_department", { p_dept: deptId });
    expect(mocks.serviceClient).toHaveBeenCalledOnce();
    expect(mocks.writes.filter(w => w.client === "service").map(w => w.table)).toEqual(["items"]);
    const itemWrite = mocks.writes.find(w => w.table === "items")!;
    expect(itemWrite.client).toBe("service");
    const rows = itemWrite.value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1); expect(rows[0].dept_id).toBe(deptId);
    const serialized = JSON.stringify(mocks.writes);
    for (const forbidden of ["qa@example.com", "010-1234-5678", "forged-department", "저장금지발언", "미등록발언"]) expect(serialized).not.toContain(forbidden);
    expect(rows[0].content).toContain("100만원");
    expect(mocks.enqueue).toHaveBeenCalledTimes(2); expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });
  it("items 저장 실패 시 job이나 worker를 실행하지 않는다", async () => {
    mocks.itemError = true;
    expect((await post(request(kind), params)).status).toBe(500);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  it("파일 누락 시 쓰기와 service role을 사용하지 않는다", async () => {
    const req = new Request("http://localhost/upload", { method: "POST", body: new FormData() });
    expect((await post(req, params)).status).toBe(400);
    expect(mocks.writes).toEqual([]); expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});

describe("문서 검토함 업로드 경계 (ADR-054)",()=>{
  it("멤버는 초안이나 파일을 쓰지 못한다",async()=>{
    mocks.membership.mockResolvedValue({deptId,role:"member"});expect((await documentPost(request("document"),params)).status).toBe(403);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("SQL의 데모·동의·권한 거부를 우회하지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"42501"}});expect((await documentPost(request("document"),params)).status).toBe(403);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.serviceClient).not.toHaveBeenCalled();expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  it("DB 실패는 원본 업로드와 작업 실행 전에 닫힌 상태로 실패한다",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"failure"}});expect((await documentPost(request("document"),params)).status).toBe(500);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
  it("요청 부서 위조는 무시하고 세션 RPC·비공개 원본만 쓰며 items는 생성하지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:"id",error:null});const response=await documentPost(request("document"),params);expect(response.status).toBe(202);expect(await response.json()).toHaveProperty("review_id");
    const created=mocks.rpc.mock.calls.find(c=>c[0]==="create_review")![1];expect(created.p_dept).toBe(deptId);expect(JSON.stringify(created)).not.toContain("forged-department");expect(created.p_input.visibility).toBe("leads_only");
    expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.writes).toEqual([]);expect(mocks.serviceClient).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith("queue_review_part",expect.objectContaining({p_index:0}));expect(mocks.kickWorker).toHaveBeenCalledOnce();
  });
  it("원본 저장 실패 시 변환을 시작하지 않는다",async()=>{
    mocks.rpc.mockResolvedValue({data:"id",error:null});mocks.upload.mockResolvedValue({error:{code:"storage_failed"}});expect((await documentPost(request("document"),params)).status).toBe(500);expect(mocks.rpc.mock.calls.some(c=>c[0]==="queue_review_part")).toBe(false);expect(mocks.kickWorker).not.toHaveBeenCalled();
  });
});

it("미동의·미등록 발언만 있는 전사는 저장하지 않는다", async () => {
  expect((await transcriptPost(request("transcript", "미동의: 저장금지발언\n외부인: 미등록발언"), params)).status).toBe(409);
  expect(mocks.writes).toEqual([]); expect(mocks.serviceClient).not.toHaveBeenCalled();
});
