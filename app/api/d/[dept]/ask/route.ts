import { AskQuestionInput } from "@/lib/contracts";
import { startAsk } from "@/lib/ask-start";
import {
  actorFromMembership,
  jsonResult,
} from "@/lib/companion/context";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const parsed = AskQuestionInput.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "질문을 5자 이상 입력해주세요." },
      { status: 400 },
    );
  }

  const client = await createServerSupabaseClient();
  return jsonResult(
    await startAsk(actorFromMembership(client, membership), parsed.data),
    { cacheControl: false, legacy: "ask" },
  );
}
