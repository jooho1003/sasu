import { SalesReviewSourceSelection, type SalesReviewSourceSelection as Selection } from "@/lib/contracts";
import { buildSalesReviewSourcePreview, type SalesReviewSourcePreview, type SalesReviewSourceRow } from "@/lib/sales-review-sources";

type Role = "request" | "old_quote" | "new_quote" | "policy";
type TopicId = "price" | "schedule" | "contract" | "approval";
export type SalesReviewConditionChecklist = {
  sources: SalesReviewSourcePreview["sources"];
  topics: Array<{
    id: TopicId;
    label: string;
    question: string | null;
    evidence: Array<{ role: Role; source_id: string; quote: string; href: string }>;
    matches: Record<Role, number>;
    truncated: boolean;
  }>;
};

const TOPICS: Array<{ id: TopicId; label: string; question: string; korean: string[]; english: RegExp }> = [
  { id: "price", label: "가격", question: "가격·할인·부가세 조건이 고객 요청과 영업 원칙에 맞는지 확인했나요?",
    korean: ["가격", "금액", "견적", "할인", "부가세"], english: /\b(?:vat|price|discount)\b/i },
  { id: "schedule", label: "일정", question: "시작일·납기·기한을 지킬 수 있는지 담당자에게 확인했나요?",
    korean: ["일정", "납기", "시작일", "마감", "기한"], english: /\b(?:delivery|deadline)\b/i },
  { id: "contract", label: "계약", question: "계약·해지·갱신 조건을 원문과 담당자에게 확인했나요?",
    korean: ["계약", "해지", "갱신", "위약"], english: /\b(?:contract|renewal)\b/i },
  { id: "approval", label: "승인", question: "필요한 검토·결재·승인 절차와 담당자를 확인했나요?",
    korean: ["승인", "결재", "검토"], english: /\bapproval\b/i },
];

function wholeLines(content: string): string[] {
  if (content.length > 100_000) throw new Error("sales_review_checklist_too_large");
  const lines = content.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 2_000 || lines.some(line => Array.from(line).length > 2_000)) {
    throw new Error("sales_review_checklist_too_large");
  }
  return lines;
}

// Design Ref: §4 — the caller supplies the current session's RLS-filtered rows.
export function buildSalesReviewConditionChecklist(
  rawSelection: Selection, rows: SalesReviewSourceRow[], deptId: string,
): SalesReviewConditionChecklist {
  const selection = SalesReviewSourceSelection.parse(rawSelection);
  const preview = buildSalesReviewSourcePreview(selection, rows, deptId);
  const byId = new Map(rows.map(row => [row.id, row]));
  const roles: Array<[Role, string]> = [
    ["request", selection.request_item_id], ["old_quote", selection.old_quote_item_id],
    ["new_quote", selection.new_quote_item_id], ["policy", selection.policy_item_id],
  ];
  // Check every input before producing any output, including sources with no keyword matches.
  const inputs = roles.map(([role, id]) => {
    const row = byId.get(id);
    if (!row) throw new Error("sales_review_source_unavailable");
    return { role, row, lines: wholeLines(row.content) };
  });
  return {
    sources: preview.sources,
    topics: TOPICS.map(topic => {
      const matches: Record<Role, number> = { request: 0, old_quote: 0, new_quote: 0, policy: 0 };
      const evidence: SalesReviewConditionChecklist["topics"][number]["evidence"] = [];
      for (const { role, row, lines } of inputs) {
        const matching = lines.filter(line => topic.korean.some(word => line.includes(word)) || topic.english.test(line));
        matches[role] = matching.length;
        for (const quote of matching.slice(0, 3)) {
          if (!row.content.includes(quote)) throw new Error("sales_review_citation_invalid");
          evidence.push({ role, source_id: row.id, quote, href: preview.sources[role].href });
        }
      }
      return { id: topic.id, label: topic.label, question: evidence.length ? topic.question : null,
        evidence, matches, truncated: Object.values(matches).some(count => count > 3) };
    }),
  };
}
