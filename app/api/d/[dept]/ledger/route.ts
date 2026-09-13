import { NextRequest } from "next/server";

import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DecisionRow = {
  id: string;
  request_id: string | null;
  decided_by: string | null;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
  supersedes_id: string | null;
  lead_time_min: number | null;
};

type RequestRow = {
  id: string;
  status: string;
  assignee_id: string | null;
};

type MemberRow = {
  user_id: string;
  display_name: string;
};

type CitationRow = {
  owner_kind: string;
  owner_id: string;
  item_id: string | null;
  decision_id: string | null;
  quote: string;
};

type SourceRow = {
  kind: "slack_channel" | "meeting" | "notion_page" | "document";
  external_id: string;
  title: string | null;
};

type ItemRow = {
  id: string;
  author: string | null;
  spoken_at: string | null;
  external_ref: string | null;
  content: string;
  sources: SourceRow | SourceRow[];
};

type ConflictRow = {
  id: string;
  request_id: string;
  prior_decision_id: string;
  explanation: string;
};

type SerializedCitation = {
  quote: string;
  author: string;
  occurred_at: string | null;
  source: string;
  href: string;
};

type SerializedDecision = {
  id: string;
  status: string;
  assignee_id: string | null;
  assignee_name: string;
  decided_by_name: string;
  decided_at: string | null;
  outcome: string;
  rationale: string;
  lead_time_min: number | null;
  has_evidence: boolean;
  citations: SerializedCitation[];
  conflicts: {
    id: string;
    explanation: string;
    prior_decision_id: string;
    prior_decided_at: string | null;
  }[];
  history: SerializedDecision[];
};

function firstRelation<T>(relation: T | T[]): T {
  return Array.isArray(relation) ? relation[0] : relation;
}

function isValidDate(value: string | null): value is string {
  return value !== null && !Number.isNaN(new Date(value).getTime());
}

function originalHref(item: ItemRow, deptId: string): string {
  const source = firstRelation(item.sources);
  if (source.kind === "slack_channel" && item.external_ref) {
    return `https://slack.com/archives/${encodeURIComponent(source.external_id)}/p${item.external_ref.replace(/\D/g, "")}`;
  }

  if (source.kind === "notion_page") {
    return source.external_id.startsWith("http")
      ? source.external_id
      : `https://www.notion.so/${source.external_id.replace(/-/g, "")}`;
  }

  return `/d/${deptId}?item=${encodeURIComponent(item.id)}#item-${item.id}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const statusFilter = request.nextUrl.searchParams.get("status");
  const assigneeFilter = request.nextUrl.searchParams.get("assignee");
  const fromFilter = request.nextUrl.searchParams.get("from");
  const toFilter = request.nextUrl.searchParams.get("to");

  if (statusFilter !== null && !["decided", "direct"].includes(statusFilter)) {
    return Response.json({ error: "지원하지 않는 상태 필터입니다." }, { status: 400 });
  }

  if ((fromFilter && !isValidDate(fromFilter)) || (toFilter && !isValidDate(toFilter))) {
    return Response.json({ error: "기간 필터가 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const [decisionsResult, membersResult, evidenceResult] = await Promise.all([
    supabase
      .from("decisions")
      .select(
        "id, request_id, decided_by, decided_by_name, decided_at, outcome, rationale, supersedes_id, lead_time_min",
      )
      .eq("dept_id", membership.deptId)
      .order("decided_at", { ascending: false }),
    supabase
      .from("members")
      .select("user_id, display_name")
      .eq("dept_id", membership.deptId)
      .order("display_name"),
    supabase
      .from("items")
      .select("id, author, spoken_at, external_ref, content, sources!inner(kind, external_id, title)")
      .eq("dept_id", membership.deptId)
      .is("deleted_at", null)
      .order("spoken_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  if (decisionsResult.error || membersResult.error || evidenceResult.error) {
    return Response.json(
      { error: "결정 원장을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const allDecisions = (decisionsResult.data ?? []) as DecisionRow[];
  const members = (membersResult.data ?? []) as MemberRow[];
  const evidenceItems = (evidenceResult.data ?? []) as ItemRow[];
  const decisionIds = allDecisions.map((decision) => decision.id);
  const requestIds = allDecisions.flatMap((decision) =>
    decision.request_id ? [decision.request_id] : [],
  );

  const [requestsResult, decisionCitationsResult, requestCitationsResult, ownConflictsResult, priorConflictsResult] =
    await Promise.all([
      requestIds.length === 0
        ? Promise.resolve({ data: [] as RequestRow[], error: null })
        : supabase
            .from("decision_requests")
            .select("id, status, assignee_id")
            .in("id", requestIds),
      decisionIds.length === 0
        ? Promise.resolve({ data: [] as CitationRow[], error: null })
        : supabase
            .from("citations")
            .select("owner_kind, owner_id, item_id, decision_id, quote")
            .eq("owner_kind", "decision")
            .in("owner_id", decisionIds),
      requestIds.length === 0
        ? Promise.resolve({ data: [] as CitationRow[], error: null })
        : supabase
            .from("citations")
            .select("owner_kind, owner_id, item_id, decision_id, quote")
            .eq("owner_kind", "decision_request")
            .in("owner_id", requestIds),
      requestIds.length === 0
        ? Promise.resolve({ data: [] as ConflictRow[], error: null })
        : supabase
            .from("conflicts")
            .select("id, request_id, prior_decision_id, explanation")
            .in("request_id", requestIds),
      decisionIds.length === 0
        ? Promise.resolve({ data: [] as ConflictRow[], error: null })
        : supabase
            .from("conflicts")
            .select("id, request_id, prior_decision_id, explanation")
            .in("prior_decision_id", decisionIds),
    ]);

  if (
    requestsResult.error ||
    decisionCitationsResult.error ||
    requestCitationsResult.error ||
    ownConflictsResult.error ||
    priorConflictsResult.error
  ) {
    return Response.json(
      { error: "원장의 근거를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const requestMap = new Map(
    ((requestsResult.data ?? []) as RequestRow[]).map((row) => [row.id, row]),
  );
  const allCitations = [
    ...((decisionCitationsResult.data ?? []) as CitationRow[]),
    ...((requestCitationsResult.data ?? []) as CitationRow[]),
  ];
  const itemIds = [...new Set(allCitations.flatMap((citation) => citation.item_id ? [citation.item_id] : []))];
  const citedDecisionIds = [
    ...new Set(allCitations.flatMap((citation) => citation.decision_id ? [citation.decision_id] : [])),
  ];

  const [citationItemsResult, citedDecisionsResult] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve({ data: [] as ItemRow[], error: null })
      : supabase
          .from("items")
          .select("id, author, spoken_at, external_ref, content, sources!inner(kind, external_id, title)")
          .in("id", itemIds),
    citedDecisionIds.length === 0
      ? Promise.resolve({ data: [] as DecisionRow[], error: null })
      : supabase
          .from("decisions")
          .select(
            "id, request_id, decided_by, decided_by_name, decided_at, outcome, rationale, supersedes_id, lead_time_min",
          )
          .in("id", citedDecisionIds),
  ]);

  if (citationItemsResult.error || citedDecisionsResult.error) {
    return Response.json(
      { error: "인용 원문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const citationItemMap = new Map(
    ((citationItemsResult.data ?? []) as ItemRow[]).map((item) => [item.id, item]),
  );
  const citedDecisionMap = new Map(
    ((citedDecisionsResult.data ?? []) as DecisionRow[]).map((decision) => [
      decision.id,
      decision,
    ]),
  );
  const decisionMap = new Map(allDecisions.map((decision) => [decision.id, decision]));
  const memberMap = new Map(members.map((member) => [member.user_id, member.display_name]));
  const citationMap = new Map<string, CitationRow[]>();
  for (const citation of allCitations) {
    const key = `${citation.owner_kind}:${citation.owner_id}`;
    citationMap.set(key, [...(citationMap.get(key) ?? []), citation]);
  }

  const conflicts = new Map<string, ConflictRow>();
  for (const conflict of [
    ...((ownConflictsResult.data ?? []) as ConflictRow[]),
    ...((priorConflictsResult.data ?? []) as ConflictRow[]),
  ]) {
    conflicts.set(conflict.id, conflict);
  }
  const conflictRows = [...conflicts.values()];

  const serializeCitation = (citation: CitationRow): SerializedCitation | null => {
    if (citation.item_id) {
      const item = citationItemMap.get(citation.item_id);
      if (!item) {
        return null;
      }
      const source = firstRelation(item.sources);
      return {
        quote: citation.quote,
        author: item.author ?? "작성자 미상",
        occurred_at: item.spoken_at,
        source: source.title ?? "이름 없는 소스",
        href: originalHref(item, membership.deptId),
      };
    }

    if (citation.decision_id) {
      const cited = citedDecisionMap.get(citation.decision_id) ?? decisionMap.get(citation.decision_id);
      if (!cited) {
        return null;
      }
      return {
        quote: citation.quote,
        author: cited.decided_by_name,
        occurred_at: cited.decided_at,
        source: `원장 #${cited.id.slice(0, 8)}`,
        href: `/d/${membership.deptId}/ledger#decision-${cited.id}`,
      };
    }

    return null;
  };

  const serializeDecision = (
    decision: DecisionRow,
    includeHistory: boolean,
  ): SerializedDecision => {
    const linkedRequest = decision.request_id ? requestMap.get(decision.request_id) : undefined;
    const ownCitations = citationMap.get(`decision:${decision.id}`) ?? [];
    const requestCitations = decision.request_id
      ? (citationMap.get(`decision_request:${decision.request_id}`) ?? [])
      : [];
    const serializedCitations = [...ownCitations, ...requestCitations]
      .map(serializeCitation)
      .filter((citation): citation is SerializedCitation => citation !== null);
    const relatedConflicts = conflictRows
      .filter(
        (conflict) =>
          conflict.request_id === decision.request_id ||
          conflict.prior_decision_id === decision.id,
      )
      .map((conflict) => ({
        id: conflict.id,
        explanation: conflict.explanation,
        prior_decision_id: conflict.prior_decision_id,
        prior_decided_at:
          decisionMap.get(conflict.prior_decision_id)?.decided_at ?? null,
      }));

    const history: SerializedDecision[] = [];
    if (includeHistory) {
      const visited = new Set<string>([decision.id]);
      let previousId = decision.supersedes_id;
      while (previousId && !visited.has(previousId)) {
        visited.add(previousId);
        const previous = decisionMap.get(previousId);
        if (!previous) {
          break;
        }
        history.push(serializeDecision(previous, false));
        previousId = previous.supersedes_id;
      }
    }

    return {
      id: decision.id,
      status: linkedRequest?.status ?? "direct",
      assignee_id: linkedRequest?.assignee_id ?? decision.decided_by,
      assignee_name:
        (linkedRequest?.assignee_id ? memberMap.get(linkedRequest.assignee_id) : null) ??
        decision.decided_by_name,
      decided_by_name: decision.decided_by_name,
      decided_at: decision.decided_at,
      outcome: decision.outcome,
      rationale: decision.rationale,
      lead_time_min: decision.lead_time_min,
      has_evidence: serializedCitations.length > 0,
      citations: serializedCitations,
      conflicts: relatedConflicts,
      history,
    };
  };

  const supersededIds = new Set(
    allDecisions.flatMap((decision) => decision.supersedes_id ? [decision.supersedes_id] : []),
  );
  const latestDecisions = allDecisions
    .filter((decision) => !supersededIds.has(decision.id))
    .map((decision) => serializeDecision(decision, true))
    .filter((decision) => statusFilter === null || decision.status === statusFilter)
    .filter((decision) => assigneeFilter === null || decision.assignee_id === assigneeFilter)
    .filter((decision) => {
      if (!decision.decided_at) {
        return fromFilter === null && toFilter === null;
      }
      const decidedAt = new Date(decision.decided_at).getTime();
      return (
        (fromFilter === null || decidedAt >= new Date(fromFilter).getTime()) &&
        (toFilter === null || decidedAt <= new Date(toFilter).getTime())
      );
    });

  return Response.json({
    decisions: latestDecisions,
    members: members.map((member) => ({ id: member.user_id, name: member.display_name })),
    evidenceOptions: evidenceItems.map((item) => ({
      id: item.id,
      label: `${item.author ?? "작성자 미상"} · ${item.content.slice(0, 80)}`,
    })),
  });
}
