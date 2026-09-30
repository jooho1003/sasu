import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewCitationHref, reviewCitationTarget, type PublishedReview } from "@/lib/recording/citation-location";

type AnswerRow = {
  id: string;
  asked_by: string | null;
  answer: string | null;
  status: "pending" | "done" | "refused" | "failed";
  refused: boolean;
  error_code: string | null;
};

type CitationRow = {
  quote: string;
  item_id: string | null;
  decision_id: string | null;
};

type ItemRow = {
  id: string;
  content: string;
  deleted_at: string | null;
  author: string | null;
  spoken_at: string | null;
  external_ref: string | null;
  source_id: string;
  sources: { kind: string; external_id: string; title: string | null } | { kind: string; external_id: string; title: string | null }[];
};

type DecisionRow = {
  id: string;
  outcome: string;
  rationale: string;
  decided_by_name: string;
  decided_at: string | null;
};

function relation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function itemHref(item: ItemRow, deptId: string, answerId: string): string {
  const source = relation(item.sources);
  if (source.kind === "slack_channel" && item.external_ref) {
    return `https://slack.com/archives/${encodeURIComponent(source.external_id)}/p${item.external_ref.replace(/\D/gu, "")}`;
  }
  if (source.kind === "notion_page") {
    return source.external_id.startsWith("http")
      ? source.external_id
      : `https://www.notion.so/${source.external_id.replace(/-/gu, "")}`;
  }
  return `/d/${encodeURIComponent(deptId)}/evidence/${encodeURIComponent(item.id)}?answer=${encodeURIComponent(answerId)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const membership = await requireMembership(dept);
  const supabase = await createServerSupabaseClient();
  const answerResult = await supabase
    .from("answers")
    .select("id, asked_by, answer, status, refused, error_code")
    .eq("id", id)
    .eq("dept_id", membership.deptId)
    .eq("asked_by", membership.userId)
    .maybeSingle<AnswerRow>();

  if (answerResult.error) {
    return Response.json({ error: "답변 상태를 확인하지 못했습니다." }, { status: 500 });
  }
  if (!answerResult.data) {
    return Response.json({ error: "질문을 찾을 수 없습니다." }, { status: 404 });
  }

  const answer = answerResult.data;
  if (answer.status === "pending" || !answer.answer) {
    return Response.json({
      id: answer.id,
      status: answer.status,
      answer: answer.answer,
      refused: answer.refused,
      citations: [],
    });
  }

  const citationResult = await supabase
    .from("citations")
    .select("quote, item_id, decision_id")
    .eq("owner_kind", "answer")
    .eq("owner_id", answer.id)
    .order("ordinal", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (citationResult.error) {
    return Response.json({ error: "답변 근거를 불러오지 못했습니다." }, { status: 500 });
  }

  const citations = (citationResult.data ?? []) as CitationRow[];
  const itemIds = citations.flatMap((citation) => citation.item_id ? [citation.item_id] : []);
  const decisionIds = citations.flatMap((citation) => citation.decision_id ? [citation.decision_id] : []);
  const [itemsResult, decisionsResult] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve({ data: [] as ItemRow[], error: null })
      : supabase
          .from("items")
          .select("id, content, deleted_at, author, spoken_at, external_ref, source_id, sources!inner(kind, external_id, title)")
          .in("id", itemIds).eq("sources.active", true),
    decisionIds.length === 0
      ? Promise.resolve({ data: [] as DecisionRow[], error: null })
      : supabase
          .from("decisions")
          .select("id, outcome, rationale, decided_by_name, decided_at")
          .in("id", decisionIds),
  ]);

  if (itemsResult.error || decisionsResult.error) {
    return Response.json({ error: "답변 근거를 확인하지 못했습니다." }, { status: 500 });
  }

  const items = new Map(((itemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]));
  const decisions = new Map(((decisionsResult.data ?? []) as DecisionRow[]).map((decision) => [decision.id, decision]));
  // reviewed_materials SELECT is lead-only RLS. A member never receives a review ID or audio location.
  const reviewSourceIds = [...new Set([...items.values()].filter((item) => relation(item.sources).kind === "document").map((item) => item.source_id))];
  const reviewResult = reviewSourceIds.length
    ? await supabase.from("reviewed_materials").select("id,kind,revision,published_revision,published_source_id,original_uploaded,original_deleted_at,deleted_at,sections")
      .in("published_source_id", reviewSourceIds)
    : { data: [], error: null };
  const reviews = new Map(((reviewResult.error ? [] : reviewResult.data) ?? []).map((review) => [review.published_source_id, review as PublishedReview]));
  const visibleCitations = citations.flatMap((citation) => {
    if (citation.item_id) {
      const item = items.get(citation.item_id);
      if (!item || item.deleted_at || !citation.quote || !item.content.includes(citation.quote)) return [];
      const source = relation(item.sources);
      const review = reviews.get(item.source_id);
      const target = review ? reviewCitationTarget(item.external_ref, review) : null;
      return [{ quote: citation.quote, author: item.author ?? "작성자 미상", source: source.title ?? source.kind, occurred_at: item.spoken_at ?? null,
        href: target ? reviewCitationHref(membership.deptId, target) : itemHref(item, membership.deptId, answer.id),
        low_confidence: target?.lowConfidence ?? false, boundary_review: target?.boundaryReview ?? false }];
    }
    if (citation.decision_id) {
      const decision = decisions.get(citation.decision_id);
      if (!decision || !citation.quote || !`${decision.outcome}\n${decision.rationale}`.includes(citation.quote)) return [];
      return [{ quote: citation.quote, author: decision.decided_by_name, source: `결정 기록 #${decision.id.slice(0, 8)}`, occurred_at: decision.decided_at ?? null, href: `/d/${membership.deptId}/ledger#decision-${decision.id}` }];
    }
    return [];
  });

  if (answer.status === "done" && (visibleCitations.length === 0 || visibleCitations.length !== citations.length)) {
    return Response.json({ id: answer.id, status: "refused", answer: "현재 확인할 수 있는 근거로 답변을 표시할 수 없습니다. 다시 질문해 주세요.", refused: true, citations: [] });
  }

  return Response.json({
    id: answer.id,
    status: answer.status,
    answer: answer.answer,
    refused: answer.refused,
    citations: visibleCitations,
  });
}
