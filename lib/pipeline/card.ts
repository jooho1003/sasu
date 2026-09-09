import { CardDraft, type CardDraft as CardDraftValue } from "@/lib/contracts";
import { enqueue, registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Visibility = "dept" | "leads_only";

type CitationReference = {
  itemId?: string;
  decisionId?: string;
  quote: string;
};

type Member = {
  userId: string;
  displayName: string;
  role: "lead" | "member";
};

type OriginItemRow = {
  id: string;
  source_id: string;
  dept_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string | null;
  embedding: string | number[] | null;
  source: { visibility: string } | { visibility: string }[] | null;
};

type ItemRow = {
  id: string;
  source_id: string;
  content: string;
  created_at: string | null;
  visibility?: string;
};

type SimilarItemRow = {
  id: string;
  content: string;
  source_visibility: string;
};

type PrincipleSourceRow = {
  id: string;
  visibility: string;
};

type DecisionRow = {
  id: string;
  request_id: string | null;
  outcome: string;
  rationale: string;
  decided_at: string | null;
};

type RequestVisibilityRow = {
  id: string;
  visibility: string;
};

type MemberRow = {
  user_id: string;
  display_name: string;
  role: string;
};

type CardInput = {
  originItem: { item_id: string; content: string };
  similarItems: { item_id: string; content: string }[];
  principleItems: { item_id: string; content: string }[];
  recentDecisions: {
    decision_id: string;
    outcome: string;
    rationale: string;
  }[];
};

class CardPipelineDatabaseError extends Error {
  constructor() {
    super("Card pipeline database operation failed");
    this.name = "CardPipelineDatabaseError";
  }
}

function visibilityOf(value: string | null | undefined): Visibility {
  return value === "leads_only" ? "leads_only" : "dept";
}

function sourceVisibility(item: OriginItemRow): Visibility {
  const source = Array.isArray(item.source) ? item.source[0] : item.source;
  return visibilityOf(source?.visibility);
}

function ensureNoDatabaseError(error: unknown): void {
  if (error) {
    throw new CardPipelineDatabaseError();
  }
}

function citationReferences(draft: CardDraftValue): CitationReference[] {
  return draft.citations.map((citation) => ({
    ...(citation.item_id === null ? {} : { itemId: citation.item_id }),
    ...(citation.decision_id === null
      ? {}
      : { decisionId: citation.decision_id }),
    quote: citation.quote,
  }));
}

function itemIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("make_card job payload is invalid");
  }

  const itemId = Reflect.get(payload, "itemId");
  if (typeof itemId !== "string" || itemId.length === 0) {
    throw new Error("make_card job payload is invalid");
  }

  return itemId;
}

export function verifyCitations(
  citations: CitationReference[],
  sources: Map<string, string>,
): { valid: CitationReference[]; dropped: number } {
  const valid = citations.filter((citation) => {
    const hasItemId =
      typeof citation.itemId === "string" && citation.itemId.length > 0;
    const hasDecisionId =
      typeof citation.decisionId === "string" && citation.decisionId.length > 0;

    if (hasItemId === hasDecisionId || citation.quote.length === 0) {
      return false;
    }

    const sourceId = hasItemId ? citation.itemId : citation.decisionId;
    const source = sourceId === undefined ? undefined : sources.get(sourceId);
    return source?.includes(citation.quote) === true;
  });

  return { valid, dropped: citations.length - valid.length };
}

export function narrowestVisibility(vs: Visibility[]): Visibility {
  return vs.includes("leads_only") ? "leads_only" : "dept";
}

export function resolveAssignee(args: {
  assigneeHint: string | null;
  members: Member[];
  visibility: Visibility;
}): string {
  const lead = args.members.find((member) => member.role === "lead");
  if (!lead) {
    throw new CardPipelineDatabaseError();
  }

  if (args.visibility === "leads_only" || args.assigneeHint === null) {
    return lead.userId;
  }

  const normalizedHint = args.assigneeHint.trim().toLocaleLowerCase("ko-KR");
  const matched = args.members.find(
    (member) =>
      member.displayName.trim().toLocaleLowerCase("ko-KR") === normalizedHint,
  );

  return matched?.userId ?? lead.userId;
}

async function generateDraft(
  input: CardInput,
  deptId: string,
  retry: boolean,
): Promise<CardDraftValue> {
  const result = await llm.structured(
    "make_card",
    CardDraft,
    {
      system: [
        "부서 기록을 근거로 지금 결정해야 할 카드 한 장을 작성하세요.",
        "제공된 item_id 또는 decision_id와 원문만 인용하세요.",
        "카드의 모든 내용은 citations로 뒷받침되는 근거 안에서만 작성하세요.",
        "먼저 citations를 채우고 background를 작성한 뒤 recommendation 결론은 마지막에 쓰세요.",
        retry
          ? "이전 응답의 인용이 원문 문자열 검증에 실패했습니다. quote를 제공된 원문에서 그대로 복사하세요."
          : "quote는 제공된 원문에 정확히 포함된 문자열이어야 합니다.",
      ].join(" "),
      user: JSON.stringify(input),
    },
    { deptId },
  );

  return result.data;
}

async function findExistingOpenCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  itemId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("decision_requests")
    .select("id")
    .eq("origin_item_id", itemId)
    .eq("status", "open")
    .maybeSingle<{ id: string }>();

  ensureNoDatabaseError(error);
  return data?.id ?? null;
}

async function insertCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  values: Record<string, unknown>,
  itemId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("decision_requests")
    .insert(values)
    .select("id")
    .single<{ id: string }>();

  if (!error) {
    if (!data?.id) {
      throw new CardPipelineDatabaseError();
    }
    return data.id;
  }

  if (error.code === "23505") {
    const existingId = await findExistingOpenCard(client, itemId);
    if (existingId !== null) {
      return null;
    }
  }

  throw new CardPipelineDatabaseError();
}

export async function makeCard(itemId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const originResult = await client
    .from("items")
    .select(
      "id, source_id, dept_id, content, deleted_at, created_at, embedding, source:sources!inner(visibility)",
    )
    .eq("id", itemId)
    .maybeSingle<OriginItemRow>();

  ensureNoDatabaseError(originResult.error);
  const origin = originResult.data;
  if (!origin || origin.deleted_at !== null) {
    return;
  }

  if ((await findExistingOpenCard(client, itemId)) !== null) {
    return;
  }

  const [sameSourceResult, principleSourcesResult, decisionsResult, membersResult] =
    await Promise.all([
      client
        .from("items")
        .select("id, source_id, content, created_at")
        .eq("dept_id", origin.dept_id)
        .eq("source_id", origin.source_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      client
        .from("sources")
        .select("id, visibility")
        .eq("dept_id", origin.dept_id)
        .eq("is_principles", true)
        .eq("active", true),
      client
        .from("decisions")
        .select("id, request_id, outcome, rationale, decided_at")
        .eq("dept_id", origin.dept_id)
        .order("decided_at", { ascending: false })
        .limit(3),
      client
        .from("members")
        .select("user_id, display_name, role")
        .eq("dept_id", origin.dept_id),
    ]);

  ensureNoDatabaseError(sameSourceResult.error);
  ensureNoDatabaseError(principleSourcesResult.error);
  ensureNoDatabaseError(decisionsResult.error);
  ensureNoDatabaseError(membersResult.error);

  const sameSourceItems = (sameSourceResult.data ?? []) as ItemRow[];
  const principleSources = (principleSourcesResult.data ?? []) as PrincipleSourceRow[];
  const recentDecisions = (decisionsResult.data ?? []) as DecisionRow[];
  const memberRows = (membersResult.data ?? []) as MemberRow[];

  const principleSourceIds = principleSources.map((source) => source.id);
  const requestIds = recentDecisions.flatMap((decision) =>
    decision.request_id === null ? [] : [decision.request_id],
  );
  const [principleItemsResult, requestVisibilitiesResult] = await Promise.all([
    principleSourceIds.length === 0
      ? Promise.resolve({ data: [] as ItemRow[], error: null })
      : client
          .from("items")
          .select("id, source_id, content, created_at")
          .in("source_id", principleSourceIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
    requestIds.length === 0
      ? Promise.resolve({ data: [] as RequestVisibilityRow[], error: null })
      : client
          .from("decision_requests")
          .select("id, visibility")
          .in("id", requestIds),
  ]);

  ensureNoDatabaseError(principleItemsResult.error);
  ensureNoDatabaseError(requestVisibilitiesResult.error);

  const principleItems = (principleItemsResult.data ?? []) as ItemRow[];
  const requestVisibilities = (requestVisibilitiesResult.data ?? []) as RequestVisibilityRow[];
  const members: Member[] = memberRows
    .filter((member) => member.role === "lead" || member.role === "member")
    .map((member) => ({
      userId: member.user_id,
      displayName: member.display_name,
      role: member.role as Member["role"],
    }));

  let similarItems = sameSourceItems;
  const lead = members.find((member) => member.role === "lead");
  if (origin.embedding && lead && typeof client.rpc === "function") {
    const similarityResult = await client.rpc("search_as", {
      p_user: lead.userId,
      p_dept: origin.dept_id,
      p_query: origin.embedding,
      p_limit: 6,
    });
    if (!similarityResult.error && Array.isArray(similarityResult.data)) {
      similarItems = (similarityResult.data as SimilarItemRow[])
        .filter((item) => item.id !== origin.id)
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          source_id: "",
          content: item.content,
          created_at: null,
          visibility: item.source_visibility,
        }));
    }
  }

  const input: CardInput = {
    originItem: { item_id: origin.id, content: origin.content },
    similarItems: similarItems.map((item) => ({
      item_id: item.id,
      content: item.content,
    })),
    principleItems: principleItems.map((item) => ({
      item_id: item.id,
      content: item.content,
    })),
    recentDecisions: recentDecisions.map((decision) => ({
      decision_id: decision.id,
      outcome: decision.outcome,
      rationale: decision.rationale,
    })),
  };

  const texts = new Map<string, string>();
  const visibilities = new Map<string, Visibility>();
  const originVisibility = sourceVisibility(origin);
  const principleVisibility = new Map(
    principleSources.map((source) => [source.id, visibilityOf(source.visibility)]),
  );
  const requestVisibility = new Map(
    requestVisibilities.map((request) => [
      request.id,
      visibilityOf(request.visibility),
    ]),
  );

  for (const item of similarItems) {
    texts.set(item.id, item.content);
    visibilities.set(item.id, visibilityOf(item.visibility ?? originVisibility));
  }
  texts.set(origin.id, origin.content);
  visibilities.set(origin.id, originVisibility);

  for (const item of principleItems) {
    texts.set(item.id, item.content);
    visibilities.set(
      item.id,
      principleVisibility.get(item.source_id) ?? "dept",
    );
  }

  for (const decision of recentDecisions) {
    texts.set(decision.id, `${decision.outcome}\n${decision.rationale}`);
    visibilities.set(
      decision.id,
      decision.request_id === null
        ? "dept"
        : (requestVisibility.get(decision.request_id) ?? "dept"),
    );
  }

  let draft = await generateDraft(input, origin.dept_id, false);
  let verified = verifyCitations(citationReferences(draft), texts);
  if (verified.valid.length === 0) {
    draft = await generateDraft(input, origin.dept_id, true);
    verified = verifyCitations(citationReferences(draft), texts);
  }

  const status = verified.valid.length === 0 ? "needs_review" : "open";
  const visibility =
    verified.valid.length === 0
      ? originVisibility
      : narrowestVisibility(
          verified.valid.map((citation) => {
            const sourceId = citation.itemId ?? citation.decisionId;
            return sourceId === undefined
              ? "dept"
              : (visibilities.get(sourceId) ?? "dept");
          }),
        );
  const assigneeId = resolveAssignee({
    assigneeHint: draft.assignee_hint,
    members,
    visibility,
  });
  const cardId = await insertCard(
    client,
    {
      dept_id: origin.dept_id,
      title: draft.title,
      background: draft.background,
      recommendation: draft.recommendation,
      deadline: draft.deadline,
      assignee_id: assigneeId,
      visibility,
      status,
      origin_item_id: origin.id,
    },
    origin.id,
  );

  if (cardId === null) {
    return;
  }

  if (verified.valid.length > 0) {
    const citationResult = await client.from("citations").insert(
      verified.valid.map((citation) => ({
        owner_kind: "decision_request",
        owner_id: cardId,
        item_id: citation.itemId ?? null,
        decision_id: citation.decisionId ?? null,
        quote: citation.quote,
      })),
    );
    ensureNoDatabaseError(citationResult.error);
  }

  const realDecisionIds = new Set(recentDecisions.map((decision) => decision.id));
  const conflicts = draft.conflicts
    .filter((conflict) => realDecisionIds.has(conflict.decision_id))
    .map((conflict) => ({
      request_id: cardId,
      prior_decision_id: conflict.decision_id,
      explanation: conflict.explanation,
      confirmed: false,
    }));

  if (conflicts.length > 0) {
    const conflictResult = await client.from("conflicts").insert(conflicts);
    ensureNoDatabaseError(conflictResult.error);
  }

  if (status === "open") {
    await enqueue(
      "send_slack",
      { requestId: cardId },
      { dedupeKey: cardId },
    );
  }
}

export function registerMakeCardHandler(): void {
  registerHandler("make_card", async (payload: unknown) => {
    await makeCard(itemIdFromPayload(payload));
  });
}
