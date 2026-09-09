import { Classification } from "@/lib/contracts";
import { enqueue, registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { classifyByRules } from "@/lib/rules";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const CLASSIFICATION_CONTENT_LIMIT = 4_000;
const AUTO_PROMOTION_CONFIDENCE = 0.6;

type ItemRow = {
  content: string;
  spoken_at: string | null;
  created_at: string | null;
  deleted_at: string | null;
  dept_id: string;
};

type ClassificationValues = {
  item_id: string;
  label: "decision" | "action" | "info" | "chatter" | "unclassified";
  method: "rule" | "llm";
  confidence: number | null;
  deadline_hint: string | null;
  assignee_hint: string | null;
  reasoning: string | null;
};

class ClassifyPipelineDatabaseError extends Error {
  constructor() {
    super("Classify pipeline database operation failed");
    this.name = "ClassifyPipelineDatabaseError";
  }
}

async function saveClassification(
  values: ClassificationValues,
): Promise<void> {
  const client = createServiceSupabaseClient();
  const { error } = await client.from("classifications").upsert(values);

  if (error) {
    throw new ClassifyPipelineDatabaseError();
  }
}

async function enqueueEmbedding(itemId: string): Promise<void> {
  await enqueue("embed", { itemId }, { dedupeKey: itemId });
}

function unclassifiedValues(itemId: string): ClassificationValues {
  // lib/jobs.ts의 classify 최종 실패 매핑과 같은 사용자 표시 상태다.
  return {
    item_id: itemId,
    label: "unclassified",
    method: "llm",
    confidence: null,
    deadline_hint: null,
    assignee_hint: null,
    reasoning: null,
  };
}

function itemIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("classify job payload is invalid");
  }

  const itemId = Reflect.get(payload, "itemId");
  if (typeof itemId !== "string" || itemId.length === 0) {
    throw new Error("classify job payload is invalid");
  }

  return itemId;
}

export async function classifyItem(itemId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const { data, error } = await client
    .from("items")
    .select("content, spoken_at, created_at, deleted_at, dept_id")
    .eq("id", itemId)
    .maybeSingle<ItemRow>();

  if (error) {
    throw new ClassifyPipelineDatabaseError();
  }

  if (!data || data.deleted_at !== null) {
    return;
  }

  const content = data.content.slice(0, CLASSIFICATION_CONTENT_LIMIT);
  const spokenAt = new Date(data.spoken_at ?? data.created_at ?? 0);
  const ruleSignal = classifyByRules({
    content,
    spokenAt,
    hasReplyWithin12h: undefined,
  });

  if (!ruleSignal.isDecisionCandidate) {
    await saveClassification({
      item_id: itemId,
      label: "info",
      method: "rule",
      confidence: null,
      deadline_hint: null,
      assignee_hint: null,
      reasoning: "규칙상 결정 후보 신호가 없습니다.",
    });
    await enqueueEmbedding(itemId);
    return;
  }

  let result;
  try {
    result = await llm.structured(
      "classify",
      Classification,
      {
        system:
          "부서 기록을 decision, action, info, chatter 중 하나로 분류하세요. 제공된 본문과 규칙 신호만 사용하세요.",
        user: JSON.stringify({
          content,
          ruleReasons: ruleSignal.reasons,
        }),
      },
      { deptId: data.dept_id },
    );
  } catch {
    await saveClassification(unclassifiedValues(itemId));
    await enqueueEmbedding(itemId);
    return;
  }

  const classification = result.data;
  const deadlineHint =
    ruleSignal.deadlineHint?.toISOString() ?? classification.deadline_hint;

  await saveClassification({
    item_id: itemId,
    label: classification.label,
    method: "llm",
    confidence: classification.confidence,
    deadline_hint: deadlineHint,
    assignee_hint: classification.assignee_hint,
    reasoning: classification.reasoning,
  });
  await enqueueEmbedding(itemId);

  if (
    classification.label === "decision" &&
    classification.confidence !== null &&
    classification.confidence >= AUTO_PROMOTION_CONFIDENCE
  ) {
    await enqueue("make_card", { itemId });
  }
}

export function registerClassifyHandler(): void {
  registerHandler("classify", async (payload: unknown) => {
    await classifyItem(itemIdFromPayload(payload));
  });
}
