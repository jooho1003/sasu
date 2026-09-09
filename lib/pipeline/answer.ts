import { embedText } from "@/lib/embeddings";
import { AnswerDraft, type AnswerDraft as AnswerDraftValue } from "@/lib/contracts";
import { registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { mask } from "@/lib/mask";
import { recentDecisionsAs, searchAs, type SearchResult } from "@/lib/search";
import { postMessage } from "@/lib/slack/post";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type CitationReference = {
  itemId?: string;
  decisionId?: string;
  quote: string;
};

type AnswerRow = {
  id: string;
  dept_id: string;
  asked_by: string | null;
  question: string;
  status: "pending" | "done" | "refused" | "failed";
};

type SlackReply = { channel: string; threadTs: string };

type DecisionSearchResult = {
  id: string;
  outcome: string;
  rationale: string;
  decided_at: string | null;
  decided_by_name: string;
};

type EvidenceItem = Pick<
  SearchResult,
  "id" | "content" | "source_kind" | "source_title" | "source_visibility"
>;

class AnswerPipelineDatabaseError extends Error {
  constructor() {
    super("Answer pipeline database operation failed");
    this.name = "AnswerPipelineDatabaseError";
  }
}

function ensureNoDatabaseError(error: unknown): void {
  if (error) {
    throw new AnswerPipelineDatabaseError();
  }
}

function citationReferences(draft: AnswerDraftValue): CitationReference[] {
  return draft.citations.map((citation) => ({
    ...(citation.item_id === null ? {} : { itemId: citation.item_id }),
    ...(citation.decision_id === null ? {} : { decisionId: citation.decision_id }),
    quote: citation.quote,
  }));
}

export function verifyAnswerCitations(
  citations: CitationReference[],
  sources: Map<string, string>,
): { valid: CitationReference[]; dropped: number } {
  const valid = citations.filter((citation) => {
    const hasItemId = typeof citation.itemId === "string" && citation.itemId.length > 0;
    const hasDecisionId =
      typeof citation.decisionId === "string" && citation.decisionId.length > 0;
    if (hasItemId === hasDecisionId || citation.quote.length === 0) {
      return false;
    }
    const sourceId = hasItemId ? citation.itemId : citation.decisionId;
    return sourceId !== undefined && sources.get(sourceId)?.includes(citation.quote) === true;
  });

  return { valid, dropped: citations.length - valid.length };
}

export function buildAnswerEvidence(args: {
  items: EvidenceItem[];
  decisions: Pick<DecisionSearchResult, "id" | "outcome" | "rationale">[];
}): { texts: Map<string, string>; prompt: string } {
  const texts = new Map<string, string>();
  const evidence = [
    ...args.items.map((item) => {
      texts.set(item.id, item.content);
      return {
        kind: "item",
        item_id: item.id,
        content: item.content,
        source: item.source_title ?? item.source_kind,
        visibility: item.source_visibility,
      };
    }),
    ...args.decisions.map((decision) => {
      const content = `${decision.outcome}\n${decision.rationale}`;
      texts.set(decision.id, content);
      return {
        kind: "decision",
        decision_id: decision.id,
        content,
      };
    }),
  ];

  return { texts, prompt: JSON.stringify(evidence) };
}

function answerJobFromPayload(payload: unknown): { answerId: string; slackReply: SlackReply | null } {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("answer job payload is invalid");
  }
  const answerId = Reflect.get(payload, "answerId");
  if (typeof answerId !== "string" || answerId.length === 0) {
    throw new Error("answer job payload is invalid");
  }
  const reply = Reflect.get(payload, "slackReply");
  if (typeof reply !== "object" || reply === null) return { answerId, slackReply: null };
  const channel = Reflect.get(reply, "channel");
  const threadTs = Reflect.get(reply, "threadTs");
  return typeof channel === "string" && channel.length > 0 && typeof threadTs === "string" && threadTs.length > 0
    ? { answerId, slackReply: { channel, threadTs } }
    : { answerId, slackReply: null };
}

async function replyInSlack(reply: SlackReply | null, text: string): Promise<void> {
  if (!reply) return;
  try {
    await postMessage({ channel: reply.channel, thread_ts: reply.threadTs, text, blocks: [] });
  } catch {
    // 웹 답변은 이미 저장했으므로 Slack 회신 실패가 Q&A 자체를 실패시키지 않는다.
  }
}

async function saveRefused(
  client: ReturnType<typeof createServiceSupabaseClient>,
  answerId: string,
  answer: string,
  errorCode: string | null = null,
): Promise<void> {
  const result = await client
    .from("answers")
    .update({
      status: "refused",
      answer,
      refused: true,
      verified: true,
      error_code: errorCode,
    })
    .eq("id", answerId);
  ensureNoDatabaseError(result.error);
}

async function saveAnswer(
  client: ReturnType<typeof createServiceSupabaseClient>,
  answerId: string,
  draft: AnswerDraftValue,
  validCitations: CitationReference[],
): Promise<void> {
  const refused = draft.refused || validCitations.length === 0;
  const answerResult = await client
    .from("answers")
    .update({
      status: refused ? "refused" : "done",
      answer: refused && validCitations.length === 0
        ? "이 질문에 답할 근거를 부서 기록에서 확인하지 못했습니다."
        : draft.answer,
      refused,
      verified: true,
      error_code: validCitations.length === 0 ? "citation_invalid" : null,
    })
    .eq("id", answerId);
  ensureNoDatabaseError(answerResult.error);

  if (validCitations.length === 0) {
    return;
  }

  const citationResult = await client.from("citations").insert(
    validCitations.map((citation) => ({
      owner_kind: "answer",
      owner_id: answerId,
      item_id: citation.itemId ?? null,
      decision_id: citation.decisionId ?? null,
      quote: citation.quote,
    })),
  );
  ensureNoDatabaseError(citationResult.error);
}

export async function answerQuestion(answerId: string, slackReply: SlackReply | null = null): Promise<void> {
  const client = createServiceSupabaseClient();
  const answerResult = await client
    .from("answers")
    .select("id, dept_id, asked_by, question, status")
    .eq("id", answerId)
    .maybeSingle<AnswerRow>();
  ensureNoDatabaseError(answerResult.error);

  const answer = answerResult.data;
  if (!answer || answer.status !== "pending") {
    return;
  }
  if (!answer.asked_by) {
    await saveRefused(client, answer.id, "질문자 계정을 확인하지 못했습니다.", "auth");
    await replyInSlack(slackReply, "질문자 계정을 확인하지 못했습니다.");
    return;
  }

  const question = mask(answer.question).slice(0, 1_000);
  const embedding = await embedText(question);
  const [items, decisions] = await Promise.all([
    searchAs(client, {
      userId: answer.asked_by,
      deptId: answer.dept_id,
      queryVector: embedding.vector,
      limit: 8,
    }),
    recentDecisionsAs(client, {
      userId: answer.asked_by,
      deptId: answer.dept_id,
      limit: 3,
    }),
  ]);

  if (items.length === 0 && decisions.length === 0) {
    await saveRefused(
      client,
      answer.id,
      "아직 참고할 기록이 없습니다 — 채널을 연결하거나 회의 전사를 올려주세요.",
    );
    await replyInSlack(slackReply, "아직 참고할 기록이 없습니다 — 채널을 연결하거나 회의 전사를 올려주세요.");
    return;
  }

  const evidence = buildAnswerEvidence({ items, decisions });
  const result = await llm.structured(
    "answer",
    AnswerDraft,
    {
      system: [
        "부서 기록만 근거로 한국어로 답하세요.",
        "제공된 근거에 없는 문장은 쓰지 마세요.",
        "먼저 citations를 작성하고 answer를 작성하세요.",
        "모든 인용의 quote는 제공된 원문에 그대로 포함되어야 합니다.",
        "근거가 부족하면 refused=true로 답하세요.",
      ].join(" "),
      user: JSON.stringify({ question, evidence: evidence.prompt }),
    },
    { deptId: answer.dept_id },
  );
  const verified = verifyAnswerCitations(citationReferences(result.data), evidence.texts);
  await saveAnswer(client, answer.id, result.data, verified.valid);
  const replyText = result.data.refused || verified.valid.length === 0
    ? "이 질문에 답할 근거를 부서 기록에서 확인하지 못했습니다."
    : result.data.answer + "\n\n내 권한 범위 안의 부서 기록만 참고했습니다.";
  await replyInSlack(slackReply, replyText);
}

export function registerAnswerHandler(): void {
  registerHandler("answer", async (payload: unknown) => {
    const job = answerJobFromPayload(payload);
    await answerQuestion(job.answerId, job.slackReply);
  });
}
