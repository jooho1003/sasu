import type { DocumentSummary } from "@/lib/contracts";

const SECTION_LABELS: Array<
  [
    keyof Pick<
      DocumentSummary,
      "key_points" | "decisions" | "actions" | "open_questions"
    >,
    string,
  ]
> = [
  ["key_points", "핵심 내용"],
  ["decisions", "결정·정책"],
  ["actions", "다음 할 일"],
  ["open_questions", "확인이 필요한 질문"],
];

// 문서 정리 결과의 한눈에 보기 + 항목 구역. 실제 문서 화면과 게스트 데모 화면이 함께 쓴다.
export function DocumentSummarySections({ summary }: { summary: DocumentSummary }) {
  return (
    <>
      <section className="document-overview">
        <p className="eyebrow">한눈에 보기</p>
        <p>{summary.overview}</p>
      </section>
      {SECTION_LABELS.map(([key, label]) =>
        summary[key].length > 0 ? (
          <section className="summary-section" key={key}>
            <h4>{label}</h4>
            <ul>
              {summary[key].map((item) => (
                <li key={`${item.item_id}-${item.text}`}>{item.text}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </>
  );
}
