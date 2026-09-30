import { describe, expect, it } from "vitest";
import { reviewCitationLocations, reviewCitationTarget } from "@/lib/recording/citation-location";

const section = (text: string, start_seconds: number | null = 12, confidence: "normal" | "low" = "normal", boundary_review = false) =>
  ({ text, start_seconds, confidence, boundary_review });

describe("발행한 녹음 인용 위치", () => {
  it("2,400 유니코드 문자 청크의 순번을 원래 구간으로 되돌린다", () => {
    const locations = reviewCitationLocations([section("가".repeat(2400) + "😀끝", 10), section("다음", 75)]);
    expect([...locations.entries()]).toEqual([
      [0, { sectionIndex: 0, startSeconds: 10, lowConfidence: false, boundaryReview: false }],
      [1, { sectionIndex: 0, startSeconds: 10, lowConfidence: false, boundaryReview: false }],
      [2, { sectionIndex: 1, startSeconds: 75, lowConfidence: false, boundaryReview: false }],
    ]);
  });
  it("Postgres btrim과 같이 공백만 있는 청크를 건너뛴다", () => {
    const locations = reviewCitationLocations([section(" ".repeat(2400) + "본문", 20), section("후속", 80, "low", true)]);
    expect(locations.get(0)?.sectionIndex).toBe(0);
    expect(locations.get(1)).toEqual({ sectionIndex: 1, startSeconds: 80, lowConfidence: true, boundaryReview: true });
  });
  it("발행 뒤 수정되었거나 원본이 없으면 위치 링크를 만들지 않는다", () => {
    const base = { id: "review-id", kind: "audio", published_revision: 2, revision: 2, original_uploaded: true, original_deleted_at: null, deleted_at: null, sections: [section("본문")] };
    expect(reviewCitationTarget("review-section-0", base)).toEqual({ reviewId: "review-id", sectionIndex: 0, startSeconds: 12, lowConfidence: false, boundaryReview: false });
    expect(reviewCitationTarget("review-section-0", { ...base, revision: 3 })).toBeNull();
    expect(reviewCitationTarget("review-section-0", { ...base, original_deleted_at: "2026-09-29" })).toBeNull();
    expect(reviewCitationTarget("review-section-0", { ...base, original_uploaded: false })).toBeNull();
    expect(reviewCitationTarget("review-section-0", { ...base, kind: "document" })).toBeNull();
    expect(reviewCitationTarget("review-section-abc", base)).toBeNull();
  });
});
