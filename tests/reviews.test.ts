import { describe, expect, it } from "vitest";
import {
  editReviewSections,
  sectionsFromText,
  reviewExport,
  reviewError,
} from "@/lib/reviews";

describe("자료 검토 계약", () => {
  it("추출 전문을 자르지 않고 마스킹해 구간으로 나눈다", () => {
    const input =
      "처음 문장\n" + "가".repeat(7201) + "\n연락 qa@example.com\n마지막 문장";
    const sections = sectionsFromText(input, "document");
    expect(sections.map((s) => s.text).join("\n")).toContain("마지막 문장");
    expect(sections.map((s) => s.text).join("\n")).not.toContain(
      "qa@example.com",
    );
    expect(sections.every((s) => s.text.length <= 2400)).toBe(true);
    expect(
      sections.every(
        (s) => s.origin === "extracted" && s.original_text === s.text,
      ),
    ).toBe(true);
  });
  it("사용자가 출처·원문·시각을 위조할 수 없고 새 문장은 사용자 추가다", () => {
    const original = sectionsFromText("원래 추출문", "document");
    const edited = editReviewSections(original, [
      { id: original[0].id, text: "교정 qa@example.com" },
      { id: "new-section", text: "직접 적은 메모" },
    ]);
    expect(edited[0]).toMatchObject({
      original_text: "원래 추출문",
      text: "교정 [이메일]",
      edited: true,
    });
    expect(edited[1]).toMatchObject({
      origin: "user",
      original_text: "",
      start_seconds: null,
      end_seconds: null,
    });
  });
  it("동일 구간 ID와 비정상적으로 큰 편집 입력을 거절한다", () => {
    expect(() =>
      editReviewSections(
        [],
        [
          { id: "same", text: "a" },
          { id: "same", text: "b" },
        ],
      ),
    ).toThrow();
    expect(() =>
      editReviewSections([], [{ id: "a", text: "가".repeat(20001) }]),
    ).toThrow();
  });
  it("삭제한 구간은 내보내지 않고 초안·확정 상태와 출처를 구분한다", () => {
    const original = sectionsFromText("유지\n\n삭제", "document");
    const sections = editReviewSections(original, [
      { id: original[0].id, text: "유지" },
    ]);
    const text = reviewExport(
      { title: "검토 자료", revision: 3, published_revision: 2, sections },
      "md",
    );
    expect(text).toContain("초안");
    expect(text).toContain("버전: 3");
    expect(text).not.toContain("삭제");
  });
  it("SQL 충돌과 권한 오류는 한국어 안내이며 원문/DB 세부정보를 노출하지 않는다", () => {
    expect(reviewError({ code: "40001", message: "sensitive" }).status).toBe(
      409,
    );
    expect(reviewError({ code: "42501" }).status).toBe(403);
    expect(JSON.stringify(reviewError({ message: "sensitive" }))).not.toContain(
      "sensitive",
    );
  });
  it("내보내기에 부서·공개 범위·원본·확인 시각을 보존한다", () => {
    const text = reviewExport(
      {
        title: "회의",
        revision: 2,
        published_revision: 2,
        sections: [],
        id: "review-id",
        dept_id: "dept-id",
        visibility: "leads_only",
        filename: "meeting.wav",
        created_at: "2026-09-16T00:00:00Z",
        confirmed_at: "2026-09-16T01:00:00Z",
      },
      "txt",
    );
    expect(text).toContain("부서: dept-id");
    expect(text).toContain("공개 범위: 부서장만");
    expect(text).toContain("meeting.wav");
    expect(text).toContain("확인: 2026-09-16T01:00:00Z");
  });
});
