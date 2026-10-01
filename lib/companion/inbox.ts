// Design Ref: desktop-companion §4 E05 — 내용 없이 현재 사용자의 받은 일만 요약한다.
import { CompanionInbox } from "@/lib/contracts";
import type { ActorContext, Result } from "@/lib/companion/context";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

type AnswerRow = {
  id: string;
  status: "pending" | "done" | "refused" | "failed";
  created_at: string;
};

type CardRow = {
  id: string;
  title: string;
  deadline: string | null;
  status: "open" | "needs_review";
};

type ReviewRow = {
  id: string;
  kind: "audio" | "document";
  title: string;
  status:
    | "uploading"
    | "processing"
    | "ready"
    | "failed"
    | "cancelled"
    | "deleted";
  created_at: string;
};

export type InboxRows = {
  answers: AnswerRow[];
  cards: CardRow[];
  reviews: ReviewRow[];
};

type InboxContext = ActorContext & { linkId: string };

function recent(value: string, cutoff: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= cutoff;
}

export function buildInbox(rows: InboxRows, now: Date): CompanionInbox {
  const cutoff = now.getTime() - RECENT_WINDOW_MS;

  return CompanionInbox.parse({
    server_time: now.toISOString(),
    cards: rows.cards.map(({ id, title, deadline, status }) => ({
      id,
      title,
      deadline,
      status,
    })),
    answers: rows.answers
      .filter((row) => recent(row.created_at, cutoff))
      .map(({ id, status, created_at }) => ({ id, status, created_at })),
    reviews: rows.reviews
      .filter(
        (row) => row.status !== "deleted" && recent(row.created_at, cutoff),
      )
      .map(({ id, kind, title, status }) => ({ id, kind, title, status })),
    sales: [],
  });
}

function failed(): Result<CompanionInbox> {
  return {
    ok: false,
    status: 500,
    error: "받은 일을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    code: "inbox_failed",
  };
}

export async function loadInbox(
  ctx: InboxContext,
): Promise<Result<CompanionInbox>> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RECENT_WINDOW_MS).toISOString();

  const answersPromise = ctx.client
    .from("answers")
    .select("id, status, created_at")
    .eq("asked_by", ctx.userId)
    .eq("dept_id", ctx.deptId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const cardsBase = ctx.client
    .from("decision_requests")
    .select("id, title, deadline, status")
    .eq("dept_id", ctx.deptId)
    .eq("assignee_id", ctx.userId);
  const cardsPromise = (
    ctx.role === "lead"
      ? cardsBase.in("status", ["open", "needs_review"])
      : cardsBase.eq("status", "open")
  )
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  const reviewsPromise =
    ctx.role === "lead"
      ? ctx.client
          .from("reviewed_materials")
          .select("id, kind, title, status, created_at")
          .eq("dept_id", ctx.deptId)
          .eq("created_by", ctx.userId)
          .gte("created_at", cutoff)
          .neq("status", "deleted")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [] as ReviewRow[], error: null });

  try {
    const [answers, cards, reviews] = await Promise.all([
      answersPromise,
      cardsPromise,
      reviewsPromise,
    ]);
    if (
      answers.error ||
      cards.error ||
      reviews.error ||
      !Array.isArray(answers.data) ||
      !Array.isArray(cards.data) ||
      !Array.isArray(reviews.data)
    ) {
      return failed();
    }

    return {
      ok: true,
      status: 200,
      body: buildInbox(
        {
          answers: answers.data as AnswerRow[],
          cards: cards.data as CardRow[],
          reviews: reviews.data as ReviewRow[],
        },
        now,
      ),
    };
  } catch {
    return failed();
  }
}
