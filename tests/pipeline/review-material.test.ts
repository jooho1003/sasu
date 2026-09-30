import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  download: vi.fn(),
  transcribe: vi.fn(),
  register: vi.fn(),
  review: vi.fn(),
  parts: vi.fn(),
  segments: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  glossary: vi.fn(async () => ({ data: [] as Array<{ term: string; reading: string | null; note: string | null; updated_at: string }>, error: null })),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    rpc: mock.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === "dept_glossaries"
            ? { order: () => mock.glossary() }
            : table === "reviewed_materials"
            ? { maybeSingle: mock.review }
            : table === "review_original_segments"
              ? mock.segments()
              : mock.parts(),
      }),
    }),
    storage: { from: () => ({ download: mock.download, remove: mock.remove, list: mock.list }) },
  }),
}));
vi.mock("@/lib/llm", () => ({ llm: { transcribeAudio: mock.transcribe } }));
vi.mock("@/lib/jobs", () => ({ registerHandler: mock.register }));
import { processReviewPart, purgeReviewFiles, registerReviewHandlers, sweepReviewParts, verifyReviewSegment } from "@/lib/pipeline/review-material";
import { encodeMonoWav, validateAudioPart } from "@/lib/adapters/review-audio";
import { pcmWav, RECORDING_RATE } from "@/lib/recording/pcm";
import type { RecordingManifest } from "@/lib/contracts";

const FULL_SAMPLES = 60 * RECORDING_RATE;
function wavSegment(index: number, samples: number, value: number) {
  const wav = new Uint8Array(pcmWav(new Int16Array(samples).fill(value)));
  const sha256 = createHash("sha256").update(wav).digest("hex");
  return { wav, descriptor: { index, sample_count: samples, bytes: 44 + samples * 2, sha256 } };
}
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
  it("현재 부서 용어만 음성 전사 prompt에 전달한다", async () => {
    mock.glossary.mockResolvedValueOnce({ data: [
      { term: "사수", reading: null, note: null, updated_at: "2026-09-29T00:00:00Z" },
    ], error: null });
    await processReviewPart({ partId: "part", attempt: 1 });
    expect(mock.transcribe.mock.calls[0][0].prompt).toBe("사수");
  });
  it("원본 만료 처리를 구간 정리보다 먼저 하고 실패 시 중단한다", async () => {
    await sweepReviewParts();
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["sweep_review_originals", "sweep_review_recordings", "sweep_abandoned_review_uploads", "sweep_review_parts"]);
    mock.rpc.mockClear();
    mock.rpc.mockResolvedValueOnce({ error: { message: "private raw" }, data: null });
    await expect(sweepReviewParts()).rejects.toThrow("review_original_sweep_failed");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("녹음 세션 만료 정리가 실패하면 뒤 작업을 중단하고 원문 없는 코드만 반환한다", async () => {
    mock.rpc.mockResolvedValueOnce({ data: 0, error: null }).mockResolvedValueOnce({ data: null, error: { message: "private raw" } });
    await expect(sweepReviewParts()).rejects.toThrow("recording_session_sweep_failed");
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["sweep_review_originals", "sweep_review_recordings"]);
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

describe("원본 파기 워커", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.review.mockResolvedValue({ data: { id: "review", dept_id: "dept", original_deleted_at: "2026-09-01T00:00:00Z" }, error: null });
    mock.parts.mockResolvedValue({ data: [{ object_path: "dept/review/parts/0.wav" }, { object_path: "dept/review/original" }], error: null });
    mock.remove.mockResolvedValue({ data: [], error: null });
  });

  it.each([null, { id: "review", dept_id: "dept", original_deleted_at: null }])("파기 표시가 없는 자료는 원본과 구간을 삭제하지 않는다", async data => {
    mock.review.mockResolvedValue({ data, error: null });
    await purgeReviewFiles({ reviewId: "review" });
    expect(mock.parts).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("해당 원본과 변환 구간만 중복 없이 삭제하며 전사를 다시 처리하지 않는다", async () => {
    await purgeReviewFiles({ reviewId: "review" });
    expect(mock.remove).toHaveBeenCalledExactlyOnceWith(["dept/review/original", "dept/review/parts/0.wav"]);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.transcribe).not.toHaveBeenCalled();
  });

  it("Storage 실패를 성공으로 처리하지 않고 같은 작업을 재시도할 수 있다", async () => {
    mock.remove.mockResolvedValueOnce({ data: null, error: { message: "private provider details" } });
    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_failed");
    await expect(purgeReviewFiles({ reviewId: "review" })).resolves.toBeUndefined();
    expect(mock.remove).toHaveBeenCalledTimes(2);
    expect(mock.remove.mock.calls[1]).toEqual(mock.remove.mock.calls[0]);
  });

  it.each(["review", "parts"] as const)("%s 조회가 실패하면 파일을 삭제하지 않는다", async table => {
    mock[table].mockResolvedValue({ data: null, error: { message: "private database details" } });
    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_lookup_failed");
    expect(mock.remove).not.toHaveBeenCalled();
  });
});

describe("구간 검증 워커", () => {
  const claimData = (overrides: Partial<{
    review_id: string; dept_id: string; index: number; attempt: number;
    object_path: string; sample_count: number; bytes: number; sha256: string;
  }> = {}) => ({
    review_id: "review", dept_id: "dept", index: 0, attempt: 1,
    object_path: "dept/review/original-segments/0-1.wav",
    sample_count: FULL_SAMPLES, bytes: 44 + FULL_SAMPLES * 2, sha256: "a".repeat(64),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("검증에 성공하면 verified로 완료하고 삭제하지 않는다", async () => {
    const segment = wavSegment(0, FULL_SAMPLES, 7);
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData({ ...segment.descriptor }) : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: new Blob([segment.wav]), error: null });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    expect(mock.remove).not.toHaveBeenCalled();
    const claimArgs = mock.rpc.mock.calls.find((c) => c[0] === "claim_review_segment")![1];
    expect(claimArgs).toEqual({ p_review: "review", p_index: 0, p_attempt: 1, p_run: 0, p_lease: expect.any(String) });
    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs).toEqual({ p_review: "review", p_index: 0, p_lease: expect.any(String), p_result: "verified" });
  });

  it("Storage 404(status)는 missing으로 완료하고 삭제하지 않는다", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData() : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: null, error: { message: "private raw", status: 404 } });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    expect(mock.remove).not.toHaveBeenCalled();
    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("missing");
  });

  it("Storage 404(statusCode 문자열)도 missing으로 완료한다", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData() : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: null, error: { message: "private raw", statusCode: "404" } });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("missing");
  });

  it("404가 아닌 저장소 오류는 retry로 완료하고 재시도 가능한 오류를 던지며 원문을 남기지 않는다", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData() : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: null, error: { message: "private raw", status: 500 } });

    await expect(verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 }))
      .rejects.toMatchObject({ message: "recording_segment_unavailable", error_code: "file_unavailable" });

    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("retry");
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("private raw");
  });

  it("크기가 다르면 내용을 읽지 않고 삭제 후 mismatch로 완료한다", async () => {
    const arrayBufferSpy = vi.fn();
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData({ bytes: 999 }) : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: { size: 123, arrayBuffer: arrayBufferSpy }, error: null });
    mock.remove.mockResolvedValue({ data: [], error: null });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(mock.remove).toHaveBeenCalledExactlyOnceWith(["dept/review/original-segments/0-1.wav"]);
    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("mismatch");
  });

  it("크기는 같지만 해시·헤더가 다르면 삭제 후 mismatch로 완료한다", async () => {
    const segment = wavSegment(0, 16000, 3);
    const corrupted = new Uint8Array(segment.wav);
    corrupted[50] ^= 0xff;
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData({ ...segment.descriptor }) : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: new Blob([corrupted]), error: null });
    mock.remove.mockResolvedValue({ data: [], error: null });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    expect(mock.remove).toHaveBeenCalledExactlyOnceWith(["dept/review/original-segments/0-1.wav"]);
    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("mismatch");
  });

  it("mismatch 삭제가 실패하면 attempt를 넘기지 않고 retry로 완료 후 재시도 가능한 오류를 던진다", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_segment" ? claimData({ bytes: 999 }) : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: { size: 123, arrayBuffer: vi.fn() }, error: null });
    mock.remove.mockResolvedValue({ data: null, error: { message: "private provider details" } });

    await expect(verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 }))
      .rejects.toMatchObject({ message: "recording_segment_unavailable", error_code: "file_unavailable" });

    const finishArgs = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_segment")![1];
    expect(finishArgs.p_result).toBe("retry");
  });

  it("획득 결과가 없으면 다운로드하지 않는다", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });

    await verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 });

    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledOnce();
  });

  it("claim 실패는 원문을 남기지 않고 일반 코드로 던진다", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "provider secret info" } });

    await expect(verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 }))
      .rejects.toThrow("recording_segment_claim_failed");

    expect(mock.download).not.toHaveBeenCalled();
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("provider secret info");
  });

  it("finish 실패는 원문을 남기지 않고 일반 코드로 던진다", async () => {
    const segment = wavSegment(0, FULL_SAMPLES, 7);
    mock.rpc.mockImplementation(async (name: string) => (
      name === "claim_review_segment"
        ? { data: claimData({ ...segment.descriptor }), error: null }
        : { data: null, error: { message: "provider secret info" } }
    ));
    mock.download.mockResolvedValue({ data: new Blob([segment.wav]), error: null });

    await expect(verifyReviewSegment({ reviewId: "review", index: 0, attempt: 1, run: 0 }))
      .rejects.toThrow("recording_segment_finish_failed");

    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("provider secret info");
  });
});

describe("자료 변환 워커 — audio_segments 창", () => {
  function claimAudioSegments(overrides: Record<string, unknown> = {}) {
    return {
      part_id: "part", review_id: "review", dept_id: "dept", kind: "audio" as const,
      filename: "review.wav", object_path: null, part_index: 0,
      start_seconds: 0, end_seconds: 61, original_layout: "audio_segments" as const,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mock.transcribe.mockResolvedValue({ data: { text: "안녕하세요.", segments: [], words: [] } });
  });

  it("두 원본으로 61초 창을 만들어 한 번만 변환한다", async () => {
    const first = wavSegment(0, FULL_SAMPLES, 17);
    const next = wavSegment(1, FULL_SAMPLES, -31);
    const manifest: RecordingManifest = { version: 1, segments: [first.descriptor, next.descriptor] };
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_part"
        ? claimAudioSegments({
            manifest,
            segment_paths: { current: "dept/review/original-segments/0-1.wav", next: "dept/review/original-segments/1-1.wav" },
          })
        : true,
      error: null,
    }));
    mock.download.mockImplementation(async (path: string) => (
      path === "dept/review/original-segments/0-1.wav"
        ? { data: new Blob([first.wav]), error: null }
        : { data: new Blob([next.wav]), error: null }
    ));

    await processReviewPart({ partId: "part", attempt: 1 });

    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/0-1.wav");
    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/1-1.wav");
    expect(mock.transcribe).toHaveBeenCalledOnce();
    const [audioInput] = mock.transcribe.mock.calls[0];
    expect(validateAudioPart(audioInput.bytes, 61)).toBe(true);
    expect(audioInput.includeTimestamps).toBe(true);
    expect(mock.rpc.mock.calls.some(([name]) => name === "finish_review_recording_part")).toBe(true);
  });

  it("다음 원본이 없는 마지막 창은 다운로드를 한 번만 한다", async () => {
    const only = wavSegment(0, FULL_SAMPLES, 5);
    const manifest: RecordingManifest = { version: 1, segments: [only.descriptor] };
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_part"
        ? claimAudioSegments({
            part_index: 0, start_seconds: 0, end_seconds: 60,
            manifest, segment_paths: { current: "dept/review/original-segments/0-1.wav", next: null },
          })
        : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: new Blob([only.wav]), error: null });

    await processReviewPart({ partId: "part", attempt: 1 });

    expect(mock.download).toHaveBeenCalledOnce();
    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/0-1.wav");
    expect(mock.transcribe).toHaveBeenCalledOnce();
  });

  it("다음 원본이 손상되면 변환하지 않고 audio_segment_invalid로 완료한다", async () => {
    const first = wavSegment(0, FULL_SAMPLES, 17);
    const next = wavSegment(1, FULL_SAMPLES, -31);
    const corruptedNext = new Uint8Array(next.wav);
    corruptedNext[50] ^= 0xff;
    const manifest: RecordingManifest = { version: 1, segments: [first.descriptor, next.descriptor] };
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_part"
        ? claimAudioSegments({
            manifest,
            segment_paths: { current: "dept/review/original-segments/0-1.wav", next: "dept/review/original-segments/1-1.wav" },
          })
        : true,
      error: null,
    }));
    mock.download.mockImplementation(async (path: string) => (
      path === "dept/review/original-segments/0-1.wav"
        ? { data: new Blob([first.wav]), error: null }
        : { data: new Blob([corruptedNext]), error: null }
    ));

    await processReviewPart({ partId: "part", attempt: 1 });

    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/0-1.wav");
    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/1-1.wav");
    expect(mock.transcribe).not.toHaveBeenCalled();
    const completion = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_recording_part")![1];
    expect(completion.p_error).toBe("audio_segment_invalid");
  });

  it("원본 다운로드가 실패하면 file_unavailable로 완료한다", async () => {
    const first = wavSegment(0, FULL_SAMPLES, 17);
    const next = wavSegment(1, FULL_SAMPLES, -31);
    const manifest: RecordingManifest = { version: 1, segments: [first.descriptor, next.descriptor] };
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_part"
        ? claimAudioSegments({
            manifest,
            segment_paths: { current: "dept/review/original-segments/0-1.wav", next: "dept/review/original-segments/1-1.wav" },
          })
        : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: null, error: { message: "private raw" } });

    await processReviewPart({ partId: "part", attempt: 1 });

    expect(mock.download).toHaveBeenCalledWith("dept/review/original-segments/0-1.wav");
    expect(mock.transcribe).not.toHaveBeenCalled();
    const completion = mock.rpc.mock.calls.find((c) => c[0] === "finish_review_recording_part")![1];
    expect(completion.p_error).toBe("file_unavailable");
    expect(JSON.stringify(completion)).not.toContain("private raw");
  });
  it("방치 업로드 정리가 실패하면 구간 정리를 시작하지 않는다", async () => {
    mock.rpc.mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "private raw" } });
    await expect(sweepReviewParts()).rejects.toThrow("review_upload_sweep_failed");
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["sweep_review_originals", "sweep_review_recordings", "sweep_abandoned_review_uploads"]);
  });

  it("앞 창 마지막 단어 끝을 받아 겹친 단어 없이 시각·신뢰도를 저장한다", async () => {
    const first = wavSegment(0, FULL_SAMPLES, 5);
    const second = wavSegment(1, FULL_SAMPLES, 7);
    const manifest: RecordingManifest = { version: 1, segments: [first.descriptor, second.descriptor] };
    mock.rpc.mockImplementation(async (name: string) => ({
      data: name === "claim_review_part"
        ? claimAudioSegments({ part_index: 1, start_seconds: 60, end_seconds: 120,
            previous_last_word_end_in_window: 0.3, manifest,
            segment_paths: { current: "second.wav", next: null } })
        : true,
      error: null,
    }));
    mock.download.mockResolvedValue({ data: new Blob([second.wav]), error: null });
    mock.transcribe.mockResolvedValue({ data: {
      text: "경계 후속",
      segments: [{ text: "경계 후속", start: 0, end: 0.8, avg_logprob: -1.2, no_speech_prob: 0.1 }],
      words: [{ word: "경계", start: 0, end: 0.3 }, { word: "후속", start: 0.4, end: 0.8 }],
    } });

    await processReviewPart({ partId: "part1", attempt: 1 });

    const finish = mock.rpc.mock.calls.find(([name]) => name === "finish_review_recording_part")![1];
    expect(finish.p_sections.map((section: { text: string }) => section.text)).toEqual(["후속"]);
    expect(finish.p_sections[0]).toMatchObject({ start_seconds: 60.4, end_seconds: 60.8, confidence: "low", boundary_review: false });
    expect(finish.p_last_word_end).toBe(0.8);
  });
});

describe("구간 원본 파기 워커 (audio_segments)", () => {
  const segmentsPrefix = "dept/review/original-segments";

  beforeEach(() => {
    vi.clearAllMocks();
    mock.review.mockResolvedValue({
      data: { id: "review", dept_id: "dept", original_deleted_at: "2026-09-01T00:00:00Z", original_layout: "audio_segments" },
      error: null,
    });
    mock.remove.mockResolvedValue({ data: [], error: null });
  });

  it("모든 attempt 경로와 뒤늦게 발견된 객체를 함께 지운다", async () => {
    mock.segments.mockResolvedValue({
      data: [{ segment_index: 0, attempt: 2 }, { segment_index: 1, attempt: 1 }],
      error: null,
    });
    mock.list
      .mockResolvedValueOnce({ data: [{ id: "late", name: "0-3.wav" }, { id: null, name: "" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await purgeReviewFiles({ reviewId: "review" });

    expect(mock.parts).not.toHaveBeenCalled();
    expect(mock.remove).toHaveBeenCalledTimes(1);
    expect(mock.remove.mock.calls[0][0].slice().sort()).toEqual([
      `${segmentsPrefix}/0-1.wav`,
      `${segmentsPrefix}/0-2.wav`,
      `${segmentsPrefix}/1-1.wav`,
      `${segmentsPrefix}/0-3.wav`,
    ].sort());
  });

  it("목록을 100개씩 끝까지 페이지네이션한다", async () => {
    mock.segments.mockResolvedValue({ data: [], error: null });
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}`, name: `x-${i}.wav` }));
    const shortPage = [{ id: "id-100", name: "x-100.wav" }];
    mock.list
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await purgeReviewFiles({ reviewId: "review" });

    expect(mock.list).toHaveBeenNthCalledWith(1, segmentsPrefix, { limit: 100, offset: 0 });
    expect(mock.list).toHaveBeenNthCalledWith(2, segmentsPrefix, { limit: 100, offset: 100 });
    const removedPaths = mock.remove.mock.calls.flatMap((call) => call[0] as string[]);
    expect(removedPaths).toHaveLength(101);
    expect(new Set(removedPaths).size).toBe(101);
  });

  it("두 번째 목록에서 발견된 잔여 객체를 다시 지운다", async () => {
    mock.segments.mockResolvedValue({ data: [{ segment_index: 0, attempt: 1 }], error: null });
    mock.list
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "late2", name: "0-2.wav" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await purgeReviewFiles({ reviewId: "review" });

    expect(mock.remove).toHaveBeenCalledTimes(2);
    expect(mock.remove.mock.calls[1][0]).toEqual([`${segmentsPrefix}/0-2.wav`]);
  });

  it("마지막 확인에도 남아 있으면 review_purge_incomplete로 재시도한다", async () => {
    mock.segments.mockResolvedValue({ data: [{ segment_index: 0, attempt: 1 }], error: null });
    mock.list
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: "stubborn", name: "0-9.wav" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "stubborn", name: "0-9.wav" }], error: null });

    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_incomplete");
    expect(mock.remove).toHaveBeenCalledTimes(2);
  });

  it("구간 조회가 실패하면 삭제하지 않는다", async () => {
    mock.segments.mockResolvedValue({ data: null, error: { message: "private database details" } });

    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_lookup_failed");
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("목록 조회가 실패하면 삭제하지 않는다", async () => {
    mock.segments.mockResolvedValue({ data: [], error: null });
    mock.list.mockResolvedValueOnce({ data: null, error: { message: "private storage details" } });

    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_lookup_failed");
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("삭제가 실패하면 재시도할 수 있도록 성공으로 처리하지 않는다", async () => {
    mock.segments.mockResolvedValue({ data: [{ segment_index: 0, attempt: 1 }], error: null });
    mock.list.mockResolvedValue({ data: [], error: null });
    mock.remove.mockResolvedValueOnce({ data: null, error: { message: "private provider details" } });

    await expect(purgeReviewFiles({ reviewId: "review" })).rejects.toThrow("review_purge_failed");
  });
});

describe("registerReviewHandlers", () => {
  it("verify_review_segment 핸들러를 등록한다", () => {
    vi.clearAllMocks();
    registerReviewHandlers();
    expect(mock.register).toHaveBeenCalledWith("verify_review_segment", verifyReviewSegment);
  });
});
