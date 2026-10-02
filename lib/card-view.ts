// Design Ref: desktop-companion §4.1 W03 — 웹과 기기가 같은 RLS 조회·인용 필터를 사용한다.
import { reviewCitationHref, reviewCitationTarget, type PublishedReview } from "@/lib/recording/citation-location";
import type { ActorContext, Result } from "@/lib/companion/context";

type CardStatus = "open" | "decided" | "deferred" | "rejected" | "needs_review";
type SourceRow = { kind: "slack_channel" | "meeting" | "notion_page" | "document"; external_id: string; title: string | null };
type CardRow = { id: string; dept_id: string; title: string; background: string; recommendation: string | null; deadline: string | null; assignee_id: string | null; status: CardStatus; visibility: "dept" | "leads_only" };
type CitationRow = { item_id: string | null; decision_id: string | null; quote: string };
type ItemRow = { id: string; source_id: string; content: string; deleted_at: string | null; author: string | null; spoken_at: string | null; external_ref: string | null; sources: SourceRow | SourceRow[] };
type DecisionRow = { id: string; decided_by_name: string; decided_at: string | null; outcome: string; rationale: string };
export type CardConflict = { id: string; prior_decision_id: string; explanation: string };
export type CardCitation = { quote: string; author: string; occurredAt: string | null; source: string; href: string; lowConfidence: boolean; boundaryReview: boolean };
export type CardView = { card: CardRow; citations: CardCitation[]; conflicts: CardConflict[]; decisions: DecisionRow[] };

function firstRelation<T>(relation: T | T[]): T { return Array.isArray(relation) ? relation[0] : relation; }

function originalHref(item: ItemRow, deptId: string): string {
  const source = firstRelation(item.sources);
  if (source.kind === "slack_channel" && item.external_ref) return `https://slack.com/archives/${encodeURIComponent(source.external_id)}/p${item.external_ref.replace(/\D/g, "")}`;
  if (source.kind === "notion_page") return source.external_id.startsWith("http") ? source.external_id : `https://www.notion.so/${source.external_id.replace(/-/g, "")}`;
  return `/d/${deptId}?item=${encodeURIComponent(item.id)}#item-${item.id}`;
}

export async function loadCardView(ctx: ActorContext, cardId: string): Promise<Result<CardView>> {
  const cardResult = await ctx.client.from("decision_requests").select("id, dept_id, title, background, recommendation, deadline, assignee_id, status, visibility").eq("id", cardId).eq("dept_id", ctx.deptId).maybeSingle<CardRow>();
  if (cardResult.error) return { ok: false, status: 500, code: "card_read_failed", error: "결정 카드를 불러오지 못했습니다." };
  if (!cardResult.data) return { ok: false, status: 404, code: "card_not_found", error: "결정 카드를 찾을 수 없습니다." };
  const card = cardResult.data;
  const [citationsResult, conflictsResult] = await Promise.all([
    ctx.client.from("citations").select("item_id, decision_id, quote").eq("owner_kind", "decision_request").eq("owner_id", card.id),
    ctx.client.from("conflicts").select("id, prior_decision_id, explanation").eq("request_id", card.id),
  ]);
  if (citationsResult.error || conflictsResult.error) return { ok: false, status: 500, code: "card_evidence_read_failed", error: "카드 근거를 불러오지 못했습니다." };
  const citations = (citationsResult.data ?? []) as CitationRow[];
  const conflicts = (conflictsResult.data ?? []) as CardConflict[];
  const itemIds = citations.flatMap((citation) => citation.item_id ? [citation.item_id] : []);
  const decisionIds = [...new Set([...citations.flatMap((citation) => citation.decision_id ? [citation.decision_id] : []), ...conflicts.map((conflict) => conflict.prior_decision_id)])];
  const [itemsResult, decisionsResult] = await Promise.all([
    itemIds.length ? ctx.client.from("items").select("id, source_id, content, deleted_at, author, spoken_at, external_ref, sources!inner(kind, external_id, title)").in("id", itemIds).is("deleted_at", null).eq("sources.active", true) : Promise.resolve({ data: [] as ItemRow[], error: null }),
    decisionIds.length ? ctx.client.from("decisions").select("id, decided_by_name, decided_at, outcome, rationale").in("id", decisionIds) : Promise.resolve({ data: [] as DecisionRow[], error: null }),
  ]);
  if (itemsResult.error || decisionsResult.error) return { ok: false, status: 500, code: "card_source_read_failed", error: "근거가 된 원문을 불러오지 못했습니다." };
  const itemMap = new Map(((itemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]));
  const reviewSourceIds = [...new Set([...itemMap.values()].filter((item) => firstRelation(item.sources).external_id.startsWith("review:")).map((item) => item.source_id))];
  const reviewResult = reviewSourceIds.length ? await ctx.client.from("reviewed_materials").select("id,kind,revision,published_revision,published_source_id,original_uploaded,original_deleted_at,deleted_at,sections").in("published_source_id", reviewSourceIds) : { data: [], error: null };
  const reviews = new Map(((reviewResult.error ? [] : reviewResult.data) ?? []).map((review) => [review.published_source_id, review as PublishedReview]));
  const decisions = (decisionsResult.data ?? []) as DecisionRow[];
  const decisionMap = new Map(decisions.map((decision) => [decision.id, decision]));
  const visibleCitations = citations.flatMap((citation): CardCitation[] => {
    if (citation.item_id) {
      const item = itemMap.get(citation.item_id);
      if (!item || item.deleted_at || !citation.quote || !item.content.includes(citation.quote)) return [];
      const source = firstRelation(item.sources); const target = reviews.get(item.source_id) ? reviewCitationTarget(item.external_ref, reviews.get(item.source_id)!) : null;
      return [{ quote: citation.quote, author: item.author ?? "작성자 미상", occurredAt: item.spoken_at, source: source.title ?? "이름 없는 소스", href: target ? reviewCitationHref(ctx.deptId, target) : originalHref(item, ctx.deptId), lowConfidence: target?.lowConfidence ?? false, boundaryReview: target?.boundaryReview ?? false }];
    }
    if (citation.decision_id) { const decision = decisionMap.get(citation.decision_id); return decision ? [{ quote: citation.quote, author: decision.decided_by_name, occurredAt: decision.decided_at, source: `결정 기록 #${decision.id.slice(0, 8)}`, href: `/d/${ctx.deptId}/ledger#decision-${decision.id}`, lowConfidence: false, boundaryReview: false }] : []; }
    return [];
  });
  return { ok: true, status: 200, body: { card, citations: visibleCitations, conflicts, decisions } };
}
