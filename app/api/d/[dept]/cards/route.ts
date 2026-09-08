import { enqueue, kickWorker } from "@/lib/jobs";
import { registerMakeCardHandler } from "@/lib/pipeline/card";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PromotionBody = {
  origin_item_id?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  let body: PromotionBody;
  try {
    body = (await request.json()) as PromotionBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body.origin_item_id !== "string" || body.origin_item_id.length === 0) {
    return Response.json({ error: "승격할 항목을 선택해주세요." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const itemResult = await supabase
    .from("items")
    .select("id")
    .eq("id", body.origin_item_id)
    .eq("dept_id", membership.deptId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (itemResult.error) {
    return Response.json(
      { error: "항목을 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  if (!itemResult.data) {
    return Response.json({ error: "승격할 수 있는 항목이 아닙니다." }, { status: 404 });
  }

  const existingResult = await supabase
    .from("decision_requests")
    .select("id")
    .eq("origin_item_id", itemResult.data.id)
    .eq("status", "open")
    .maybeSingle<{ id: string }>();

  if (existingResult.error) {
    return Response.json(
      { error: "기존 카드를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  if (existingResult.data) {
    return Response.json({
      card_id: existingResult.data.id,
      existing: true,
      message: "이미 열린 결정 카드가 있습니다.",
    });
  }

  try {
    const jobId = await enqueue("make_card", { itemId: itemResult.data.id });
    registerMakeCardHandler();
    kickWorker();

    return Response.json({
      job_id: jobId,
      existing: false,
      message: "결정 카드 생성을 시작했습니다.",
    }, { status: 202 });
  } catch {
    return Response.json(
      { error: "카드 생성을 시작하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
