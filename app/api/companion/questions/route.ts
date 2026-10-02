// Design Ref: desktop-companion §4 E08 — 웹과 같은 질문 기록 RPC와 20건 커서를 쓴다.
import { jsonResult, type Result } from "@/lib/companion/context";
import { requireDeviceContext } from "@/lib/companion/device-context";
import { CompanionQuestionCursor } from "@/lib/contracts";

type QuestionRow = {
  id: string;
  question: string;
  status: string;
  created_at: string;
  parent_id: string | null;
};

type QuestionsResponse = {
  questions: QuestionRow[];
  next: { before: string; before_id: string } | null;
};

function failed<T>(status: number, code: string, error: string): Result<T> {
  return { ok: false, status, code, error };
}

export async function GET(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) return jsonResult(device);

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const beforeId = url.searchParams.get("before_id");
  if (
    (before === null) !== (beforeId === null) ||
    (before !== null &&
      !CompanionQuestionCursor.safeParse({
        before,
        before_id: beforeId,
      }).success)
  ) {
    return jsonResult(
      failed(
        400,
        "invalid_input",
        "질문 기록의 페이지가 올바르지 않습니다.",
      ),
    );
  }

  const result = await device.ctx.client.rpc("my_question_history", {
    p_dept: device.ctx.deptId,
    p_before: before,
    p_before_id: beforeId,
  });
  if (result.error || !Array.isArray(result.data)) {
    return jsonResult(
      failed(
        500,
        "question_history_failed",
        "질문 기록을 불러오지 못했습니다.",
      ),
    );
  }

  const rows = result.data as QuestionRow[];
  const questions = rows.slice(0, 20).map((row) => ({
    id: row.id,
    question: row.question,
    status: row.status,
    created_at: row.created_at,
    parent_id: row.parent_id,
  }));
  const last = questions.at(-1);
  const body: QuestionsResponse = {
    questions,
    next:
      rows.length > 20 && last
        ? { before: last.created_at, before_id: last.id }
        : null,
  };
  return jsonResult({ ok: true, status: 200, body });
}
