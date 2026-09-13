import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DirectDecisionBody = {
  outcome?: unknown;
  rationale?: unknown;
  evidence_item_id?: unknown;
};

type ItemRow = {
  id: string;
  content: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dept: string }> },
) {
  const { dept } = await params;
  const membership = await requireMembership(dept);

  let body: DirectDecisionBody;
  try {
    body = (await request.json()) as DirectDecisionBody;
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
  const rationale =
    typeof body.rationale === "string" ? body.rationale.trim() : "";
  if (!outcome || !rationale) {
    return Response.json(
      { error: "결정 결과와 사유를 모두 입력해주세요." },
      { status: 400 },
    );
  }

  if (
    body.evidence_item_id !== undefined &&
    body.evidence_item_id !== null &&
    body.evidence_item_id !== "" &&
    typeof body.evidence_item_id !== "string"
  ) {
    return Response.json({ error: "근거 항목이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  let evidence: ItemRow | null = null;
  if (typeof body.evidence_item_id === "string" && body.evidence_item_id.length > 0) {
    const evidenceResult = await supabase
      .from("items")
      .select("id, content")
      .eq("id", body.evidence_item_id)
      .eq("dept_id", membership.deptId)
      .is("deleted_at", null)
      .maybeSingle<ItemRow>();

    if (evidenceResult.error) {
      return Response.json(
        { error: "선택한 근거를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      );
    }

    if (!evidenceResult.data) {
      return Response.json({ error: "선택한 근거를 볼 수 없습니다." }, { status: 403 });
    }

    evidence = evidenceResult.data;
  }

  const decisionResult = await supabase.rpc("record_direct_decision", {
    p_dept: membership.deptId,
    p_outcome: outcome,
    p_rationale: rationale,
    p_citations: evidence
      ? [{ item_id: evidence.id, quote: evidence.content }]
      : [],
  });

  if (decisionResult.error || typeof decisionResult.data !== "string") {
    if (decisionResult.error?.code === "42501") {
      return Response.json({ error: "선택한 근거를 볼 수 없습니다." }, { status: 403 });
    }
    if (decisionResult.error?.code === "22023") {
      return Response.json({ error: "선택한 근거가 올바르지 않습니다." }, { status: 400 });
    }
    return Response.json(
      { error: "결정을 원장에 기록하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      ok: true,
      decision_id: decisionResult.data,
      has_evidence: evidence !== null,
      message: "결정을 원장에 기록했습니다.",
    },
    { status: 201 },
  );
}
