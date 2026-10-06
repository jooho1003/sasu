import { DocumentSummary } from "@/lib/contracts";
import { verifyDocumentSummary } from "@/lib/document-summary-check";

export type DemoSummaryRow = { source_id: string; summary: unknown };
export type DemoSummaryItem = { id: string; source_id: string; content: string };

// 게스트 데모가 읽은 문서 요약을 렌더 전에 같은 자료의 원문으로 다시 검증한다 (ADR-091).
// 스키마가 깨졌거나 검증 후 인용이 하나도 남지 않은 요약은 결과에서 뺀다.
export function verifiedDemoSummaries(
  rows: DemoSummaryRow[],
  items: DemoSummaryItem[],
): Record<string, DocumentSummary> {
  const bySource = new Map<string, Map<string, string>>();
  for (const item of items) {
    const sourceItems = bySource.get(item.source_id) ?? new Map<string, string>();
    sourceItems.set(item.id, item.content);
    bySource.set(item.source_id, sourceItems);
  }

  const result: Record<string, DocumentSummary> = {};
  for (const row of rows) {
    const parsed = DocumentSummary.safeParse(row.summary);
    if (!parsed.success) continue;
    const { valid } = verifyDocumentSummary(parsed.data, bySource.get(row.source_id) ?? new Map());
    if (valid.citations.length > 0) result[row.source_id] = valid;
  }
  return result;
}
