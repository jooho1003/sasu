import { CardDraft, type CardDraft as CardDraftValue } from "@/lib/contracts";
import { embedText, formatVector } from "@/lib/embeddings";
import { enqueue, registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Visibility = "dept" | "leads_only";

// PRD §6-3 ⑥. 이 수치를 바꾸려면 먼저 ADR을 추가해야 한다.
export const MERGE_WINDOW_HOURS = 72;
export const MERGE_SIMILARITY_THRESHOLD = 0.85;

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

type MergeTargetRow = {
  request_id: string;
  similarity: number;
};

type PrincipleSourceRow = {
  id: string;
  visibility: string;
};

type DecisionRow = {
  id: string;
  request_id: string | null;
  visibility: string;
  outcome: string;
  rationale: string;
  decided_at: string | null;
};

export type PriorDecision = DecisionRow;

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

async function findExistingCard(
  client: ReturnType<typeof createServiceSupabaseClient>,
  itemId: string,
): Promise<string | null> {
  const openResult = await client
    .from("decision_requests")
    .select("id")
    .eq("origin_item_id", itemId)
    .eq("status", "open")
    .maybeSingle<{ id: string }>();

  ensureNoDatabaseError(openResult.error);
  if (openResult.data?.id) return openResult.data.id;

  const reviewResult = await client
    .from("decision_requests")
    .select("id")
    .eq("origin_item_id", itemId)
    .eq("status", "needs_review")
    .maybeSingle<{ id: string }>();

  ensureNoDatabaseError(reviewResult.error);
  return reviewResult.data?.id ?? null;
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
    const existingId = await findExistingCard(client, itemId);
    if (existingId !== null) {
      return null;
    }
  }

  throw new CardPipelineDatabaseError();
}

export function prioritizeSimilarDecisions(
  similar: PriorDecision[],
  recent: PriorDecision[],
  limit = 3,
): PriorDecision[] {
  const selected: PriorDecision[] = [];
  const seen = new Set<string>();

  for (const decision of [...similar, ...recent]) {
    if (seen.has(decision.id)) continue;
    seen.add(decision.id);
    selected.push(decision);
    if (selected.length === limit) break;
  }

  return selected;
}

async function findSimilarDecisions(
  client: ReturnType<typeof createServiceSupabaseClient>,
  deptId: string,
  embedding: string | number[] | null,
): Promise<PriorDecision[]> {
  if (embedding === null || typeof client.rpc !== "function") {
    return [];
  }

  const result = await client.rpc("similar_decisions_for_card", {
    p_dept: deptId,
    p_query: embedding,
    p_limit: 3,
  });
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }

  return result.data.filter((decision): decision is PriorDecision =>
    typeof decision === "object" &&
    decision !== null &&
    typeof Reflect.get(decision, "id") === "string" &&
    typeof Reflect.get(decision, "visibility") === "string" &&
    typeof Reflect.get(decision, "outcome") === "string" &&
    typeof Reflect.get(decision, "rationale") === "string",
  );
}

async function prepareOriginEmbedding(
  client: ReturnType<typeof createServiceSupabaseClient>,
  origin: OriginItemRow,
): Promise<string | number[] | null> {
  if (origin.embedding !== null) {
    return origin.embedding;
  }

  try {
    const result = await embedText(origin.content, { inputType: "document" });
    const embedding = formatVector(result.vector);
    const updateResult = await client
      .from("items")
      .update({
        embedding,
        embed_model: result.model,
        embed_status: "done",
      })
      .eq("id", origin.id);
    if (updateResult.error) {
      return null;
    }
    return embedding;
  } catch {
    // 병합은 최적화다. 임베딩 장애가 새 카드 생성까지 막아서는 안 된다.
    return null;
  }
}

async function findMergeTarget(
  client: ReturnType<typeof createServiceSupabaseClient>,
  origin: OriginItemRow,
  originVisibility: Visibility,
  embedding: string | number[],
): Promise<MergeTargetRow | null> {
  if (typeof client.rpc !== "function") {
    return null;
  }

  const result = await client.rpc("find_merge_target", {
    p_dept: origin.dept_id,
    p_query: embedding,
    p_origin_visibility: originVisibility,
    p_exclude_item: origin.id,
  });
  if (result.error || !Array.isArray(result.data)) {
    return null;
  }

  const target = result.data[0] as Partial<MergeTargetRow> | undefined;
  return typeof target?.request_id === "string" &&
    typeof target.similarity === "number"
    ? { request_id: target.request_id, similarity: target.similarity }
    : null;
}

async function appendMergeCitation(
  client: ReturnType<typeof createServiceSupabaseClient>,
  requestId: string,
  origin: OriginItemRow,
): Promise<void> {
  const existingResult = await client
    .from("citations")
    .select("id")
    .eq("owner_kind", "decision_request")
    .eq("owner_id", requestId)
    .eq("item_id", origin.id)
    .maybeSingle<{ id: string }>();
  ensureNoDatabaseError(existingResult.error);
  if (existingResult.data !== null) {
    return;
  }

  const insertResult = await client.from("citations").insert({
    owner_kind: "decision_request",
    owner_id: requestId,
    item_id: origin.id,
    decision_id: null,
    quote: origin.content,
  });
  if (insertResult.error?.code === "23505") {
    return;
  }
  ensureNoDatabaseError(insertResult.error);
}

export async function makeCard(itemId: string): Promise<string | undefined> {
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

  if ((await findExistingCard(client, itemId)) !== null) {
    return;
  }

  const originVisibility = sourceVisibility(origin);
  const originEmbedding = await prepareOriginEmbedding(client, origin);
  if (originEmbedding !== null) {
    const mergeTarget = await findMergeTarget(
      client,
      origin,
      originVisibility,
      originEmbedding,
    );
    if (mergeTarget !== null) {
      await appendMergeCitation(client, mergeTarget.request_id, origin);
      return `merged_into=${mergeTarget.request_id}`;
    }
  }

  const [sameSourceResult, principleSourcesResult, decisionsResult, membersResult, similarDecisions] =
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
        .select("id, request_id, visibility, outcome, rationale, decided_at")
        .eq("dept_id", origin.dept_id)
        .order("decided_at", { ascending: false })
        .limit(3),
      client
        .from("members")
        .select("user_id, display_name, role")
        .eq("dept_id", origin.dept_id),
      findSimilarDecisions(client, origin.dept_id, originEmbedding),
    ]);

  ensureNoDatabaseError(sameSourceResult.error);
  ensureNoDatabaseError(principleSourcesResult.error);
  ensureNoDatabaseError(decisionsResult.error);
  ensureNoDatabaseError(membersResult.error);

  const sameSourceItems = (sameSourceResult.data ?? []) as ItemRow[];
  const principleSources = (principleSourcesResult.data ?? []) as PrincipleSourceRow[];
  const recentDecisions = prioritizeSimilarDecisions(
    similarDecisions,
    (decisionsResult.data ?? []) as DecisionRow[],
  );
  const memberRows = (membersResult.data ?? []) as MemberRow[];

  const principleSourceIds = principleSources.map((source) => source.id);
  const principleItemsResult = principleSourceIds.length === 0
    ? { data: [] as ItemRow[], error: null }
    : await client
        .from("items")
        .select("id, source_id, content, created_at")
        .in("source_id", principleSourceIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

  ensureNoDatabaseError(principleItemsResult.error);

  const principleItems = (principleItemsResult.data ?? []) as ItemRow[];
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
  const principleVisibility = new Map(
    principleSources.map((source) => [source.id, visibilityOf(source.visibility)]),
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
    visibilities.set(decision.id, visibilityOf(decision.visibility));
  }

  let draft = await generateDraft(input, origin.dept_id, false);
  let verified = verifyCitations(citationReferences(draft), texts);
  if (verified.valid.length === 0) {
    draft = await generateDraft(input, origin.dept_id, true);
    verified = verifyCitations(citationReferences(draft), texts);
  }

  const originCitationIndex = verified.valid.findIndex(
    (citation) => citation.itemId === origin.id,
  );
  if (verified.valid.length > 0 && origin.content.length > 0 && originCitationIndex >= 0) {
    verified = {
      ...verified,
      valid: verified.valid.map((citation, index) =>
        index === originCitationIndex
          ? { ...citation, quote: origin.content }
          : citation,
      ),
    };
  } else if (verified.valid.length > 0 && origin.content.length > 0) {
    verified = {
      ...verified,
      valid: [
        { itemId: origin.id, quote: origin.content },
        ...verified.valid,
      ],
    };
  }

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
      status: "needs_review",
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

    const publishResult = await client
      .from("decision_requests")
      .update({ status: "open" })
      .eq("id", cardId);
    ensureNoDatabaseError(publishResult.error);
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

  if (verified.valid.length > 0) {
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
