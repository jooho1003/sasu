import { ReviewSection, ReviewEdit } from "@/lib/contracts";
import { chunkDocumentText } from "@/lib/adapters/document";
import { mask } from "@/lib/mask";

export const REVIEW_BUCKET = "review-materials";

export function sectionsFromText(
  text: string,
  kind: "audio" | "document",
  prefix = "section",
  start: number | null = null,
  end: number | null = null,
): ReviewSection[] {
  return chunkDocumentText(mask(text)).map((text, index) => ({
    id: `${prefix}-${index}`,
    text,
    original_text: text,
    origin: kind === "audio" ? "transcribed" : "extracted",
    edited: false,
    location: kind === "audio" ? "음성 구간 (문장별 정확한 시각 아님)" : null,
    start_seconds: start,
    end_seconds: end,
  }));
}

export function editReviewSections(
  current: ReviewSection[],
  edits: { id: string; text: string }[],
): ReviewSection[] {
  const parsed = ReviewEdit.shape.sections.parse(edits);
  if (new Set(parsed.map((s) => s.id)).size !== parsed.length)
    throw new Error("duplicate_section");
  if (parsed.reduce((n, s) => n + s.text.length, 0) > 1_000_000)
    throw new Error("review_too_large");
  const previous = new Map(current.map((s) => [s.id, s]));
  return parsed.map(({ id, text }) => {
    const prior = previous.get(id);
    const masked = mask(text);
    return prior
      ? { ...prior, text: masked, edited: masked !== prior.original_text }
      : {
          id,
          text: masked,
          original_text: "",
          origin: "user",
          edited: false,
          location: null,
          start_seconds: null,
          end_seconds: null,
        };
  });
}

export function reviewExport(
  review: {
    title: string;
    revision: number;
    published_revision: number | null;
    sections: ReviewSection[];
    id?: string;
    dept_id?: string;
    visibility?: "dept" | "leads_only";
    filename?: string;
    created_at?: string;
    confirmed_at?: string | null;
  },
  format: "txt" | "md",
): string {
  const lines = [
    `${format === "md" ? "# " : ""}${review.title}`,
    `버전: ${review.revision} · ${review.revision === review.published_revision ? "확정본" : "초안"}`,
    "",
  ];
  if (review.id) lines.push(`자료 ID: ${review.id}`);
  if (review.dept_id) lines.push(`부서: ${review.dept_id}`);
  if (review.visibility)
    lines.push(
      `공개 범위: ${review.visibility === "leads_only" ? "부서장만" : "우리 부서"}`,
    );
  if (review.filename) lines.push(`원본: ${review.filename}`);
  if (review.created_at) lines.push(`등록: ${review.created_at}`);
  if (review.confirmed_at)
    lines.push(
      `확인: ${review.confirmed_at} · 확정 버전 ${review.published_revision ?? "사용 중지"}`,
    );
  lines.push("");
  for (const s of review.sections) {
    const label =
      s.origin === "user"
        ? "사용자 추가"
        : s.edited
          ? "수정됨"
          : s.origin === "transcribed"
            ? "음성 전사"
            : "추출문";
    lines.push(
      `[${label}${s.start_seconds === null ? "" : ` · ${Math.floor(s.start_seconds / 60)}:${String(Math.floor(s.start_seconds % 60)).padStart(2, "0")}`}${s.location ? ` · ${s.location}` : ""}]`,
      s.text,
      "",
    );
  }
  return lines.join("\n");
}

export function reviewError(error: unknown): { status: number; error: string } {
  const code =
    error && typeof error === "object" ? Reflect.get(error, "code") : null;
  if (code === "40001")
    return {
      status: 409,
      error:
        "다른 창에서 자료가 변경됐습니다. 최신 내용을 다시 불러온 후 수정해 주세요.",
    };
  if (code === "42501")
    return {
      status: 403,
      error:
        "동의한 부서장만 이 자료를 변경할 수 있습니다. 자료 권한과 동의를 확인해 주세요.",
    };
  if (code === "22023" || code === "23514")
    return {
      status: 422,
      error:
        "모든 구간 처리와 동의 확인이 끝났는지 확인해 주세요. 입력 조건이 맞지 않습니다.",
    };
  return {
    status: 500,
    error: "자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
