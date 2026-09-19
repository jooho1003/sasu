import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  download: vi.fn(),
  transcribe: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    rpc: mock.rpc,
    storage: { from: () => ({ download: mock.download }) },
  }),
}));
vi.mock("@/lib/llm", () => ({ llm: { transcribeAudio: mock.transcribe } }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mock.register }));
import { processReviewPart, sweepReviewParts } from "@/lib/pipeline/review-material";
import { encodeMonoWav } from "@/lib/adapters/review-audio";
describe("자료 변환 워커", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "claim_review_part"
          ? {
              part_id: "part",
              review_id: "review",
              dept_id: "dept",
              kind: "audio",
              filename: "test.wav",
              object_path: "private/part.wav",
              part_index: 0,
              start_seconds: 0,
              end_seconds: 1,
            }
          : true,
      error: null,
    }));
    mock.download.mockResolvedValue({
      data: new Blob([encodeMonoWav(new Float32Array(16000), 16000)]),
      error: null,
    });
    mock.transcribe.mockResolvedValue({
      data: { text: "연락 qa@example.com. 마지막 문장입니다." },
    });
  });
  it("획득한 구간만 변환하고 마스킹 후 저장한다", async () => {
    await processReviewPart({ partId: "part", attempt: 1 });
    expect(mock.transcribe).toHaveBeenCalledOnce();
    const completion = mock.rpc.mock.calls.find(
      (c) => c[0] === "finish_review_part",
    )![1];
    expect(completion.p_sections[0].text).toContain("[이메일]");
    expect(JSON.stringify(completion)).not.toContain("qa@example.com");
  });
  it("원본 만료 처리를 구간 정리보다 먼저 하고 실패 시 중단한다", async () => {
    await sweepReviewParts();
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["sweep_review_originals", "sweep_review_parts"]);
    mock.rpc.mockClear();
    mock.rpc.mockResolvedValueOnce({ error: { message: "private raw" }, data: null });
    await expect(sweepReviewParts()).rejects.toThrow("review_original_sweep_failed");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("취소·권한 회수·지난 attempt는 저장소와 LLM을 호출하지 않는다", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await processReviewPart({ partId: "part", attempt: 1 });
    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.transcribe).not.toHaveBeenCalled();
  });
  it("파일 유실은 재시도 가능한 실패이며 외부 오류 본문을 저장하지 않는다", async () => {
    mock.download.mockResolvedValue({
      data: null,
      error: { message: "private raw" },
    });
    await processReviewPart({ partId: "part", attempt: 1 });
    const completion = mock.rpc.mock.calls.find(
      (c) => c[0] === "finish_review_part",
    )![1];
    expect(completion.p_error).toBe("file_unavailable");
    expect(JSON.stringify(completion)).not.toContain("private raw");
  });
});
