import { SalesReviewSourceSelection, type SalesReviewSourceSelection as Selection } from "@/lib/contracts";
import {
  buildSalesReviewSourcePreview,
  type SalesReviewSourcePreview,
  type SalesReviewSourceRow,
} from "@/lib/sales-review-sources";

const MAX_CONTENT_LENGTH = 100_000;
const MAX_PIECES = 2_000;
const PIECE_LENGTH = 320;
const SHOWN_PER_SIDE = 8;

type DifferenceEntry = { source_id: string; quote: string; href: string };
export type SalesReviewLiteralComparison = {
  sources: SalesReviewSourcePreview["sources"];
  difference: {
    old_only: DifferenceEntry[];
    new_only: DifferenceEntry[];
    old_only_total: number;
    new_only_total: number;
    truncated: boolean;
  };
};

function pieces(content: string): string[] {
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("sales_review_comparison_too_large");
  const result: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const characters = Array.from(line);
    for (let start = 0; start < characters.length; start += PIECE_LENGTH) {
      const quote = characters.slice(start, start + PIECE_LENGTH).join("").trim();
      if (!quote) continue;
      if (!content.includes(quote)) throw new Error("sales_review_citation_invalid");
      result.push(quote);
      if (result.length > MAX_PIECES) throw new Error("sales_review_comparison_too_large");
    }
  }
  return result;
}

function unmatched(left: string[], right: string[]): string[] {
  const remaining = new Map<string, number>();
  for (const value of right) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  const difference: string[] = [];
  for (const value of left) {
    const count = remaining.get(value) ?? 0;
    if (count > 0) remaining.set(value, count - 1);
    else difference.push(value);
  }
  return difference;
}

// Design Ref: §1.1 — rows have already passed the caller's current session RLS.
export function buildSalesReviewLiteralComparison(
  rawSelection: Selection,
  rows: SalesReviewSourceRow[],
  deptId: string,
): SalesReviewLiteralComparison {
  const selection = SalesReviewSourceSelection.parse(rawSelection);
  const preview = buildSalesReviewSourcePreview(selection, rows, deptId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const oldRow = byId.get(selection.old_quote_item_id);
  const newRow = byId.get(selection.new_quote_item_id);
  if (!oldRow || !newRow) throw new Error("sales_review_source_unavailable");
  const oldPieces = pieces(oldRow.content);
  const newPieces = pieces(newRow.content);
  const oldOnly = unmatched(oldPieces, newPieces);
  const newOnly = unmatched(newPieces, oldPieces);
  const entry = (sourceId: string, quote: string): DifferenceEntry => ({
    source_id: sourceId,
    quote,
    href: `/d/${encodeURIComponent(deptId)}/evidence/${encodeURIComponent(sourceId)}`,
  });
  return {
    sources: preview.sources,
    difference: {
      old_only: oldOnly.slice(0, SHOWN_PER_SIDE).map((quote) => entry(selection.old_quote_item_id, quote)),
      new_only: newOnly.slice(0, SHOWN_PER_SIDE).map((quote) => entry(selection.new_quote_item_id, quote)),
      old_only_total: oldOnly.length,
      new_only_total: newOnly.length,
      truncated: oldOnly.length > SHOWN_PER_SIDE || newOnly.length > SHOWN_PER_SIDE,
    },
  };
}
