import { SalesReviewSourceSelection, type SalesReviewSourceSelection as Selection } from "@/lib/contracts";

type RelatedSource = {
  dept_id: string;
  title: string | null;
  kind: string;
  active: boolean;
  is_principles: boolean;
};

export type SalesReviewSourceRow = {
  id: string;
  dept_id: string;
  content: string;
  deleted_at: string | null;
  sources: RelatedSource | RelatedSource[] | null;
};

export type SalesReviewSourceCandidate = {
  item_id: string;
  title: string;
  kind: string;
  quote: string;
  is_principles: boolean;
};

type Role = "request" | "old_quote" | "new_quote" | "policy";
export type SalesReviewSourcePreview = {
  sources: Record<Role, SalesReviewSourceCandidate & { href: string }>;
};

function currentCandidate(row: SalesReviewSourceRow, deptId: string): SalesReviewSourceCandidate | null {
  const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
  if (!source || row.dept_id !== deptId || source.dept_id !== deptId ||
      row.deleted_at !== null || source.active !== true || typeof row.content !== "string") return null;
  const quote = row.content.trim().slice(0, 320).trimEnd();
  if (!quote || !row.content.includes(quote)) return null;
  return {
    item_id: row.id,
    title: source.title?.trim() || "제목 없는 부서 기록",
    kind: source.kind,
    quote,
    is_principles: source.is_principles === true,
  };
}

// Design Ref: §1 — the caller supplies rows already filtered by the session's RLS.
export function salesReviewSourceCandidates(rows: SalesReviewSourceRow[], deptId: string): SalesReviewSourceCandidate[] {
  return rows.flatMap((row) => {
    const candidate = currentCandidate(row, deptId);
    return candidate ? [candidate] : [];
  });
}

export function buildSalesReviewSourcePreview(
  rawSelection: Selection,
  rows: SalesReviewSourceRow[],
  deptId: string,
): SalesReviewSourcePreview {
  const selection = SalesReviewSourceSelection.parse(rawSelection);
  const ids = Object.values(selection);
  if (new Set(ids).size !== 4) throw new Error("sales_review_source_duplicate");
  const byId = new Map(salesReviewSourceCandidates(rows, deptId).map((row) => [row.item_id, row]));
  const roles: [Role, string][] = [
    ["request", selection.request_item_id],
    ["old_quote", selection.old_quote_item_id],
    ["new_quote", selection.new_quote_item_id],
    ["policy", selection.policy_item_id],
  ];
  const sources = {} as SalesReviewSourcePreview["sources"];
  for (const [role, id] of roles) {
    const candidate = byId.get(id);
    if (!candidate || (role === "policy" && !candidate.is_principles)) throw new Error("sales_review_source_unavailable");
    sources[role] = { ...candidate, href: `/d/${encodeURIComponent(deptId)}/evidence/${encodeURIComponent(id)}` };
  }
  return { sources };
}
