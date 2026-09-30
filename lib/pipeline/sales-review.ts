import { SalesReviewChoice } from "@/lib/contracts";
import { registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { SALES_CASE_SOURCES, buildSalesReview } from "@/lib/sales-review";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Task = { id: string; dept_id: string; focus: "all" | "price" | "schedule"; status: string; case_version: number };

function taskIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) throw new Error("sales_review_payload_invalid");
  const id = Reflect.get(payload, "taskId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("sales_review_payload_invalid");
  return id;
}

export async function runSalesReview(taskId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const read = await client.from("sales_review_tasks")
    .select("id, dept_id, focus, status, case_version")
    .eq("id", taskId).maybeSingle<Task>();
  if (read.error) throw new Error("sales_review_database_failed");
  const task = read.data;
  if (!task || task.status === "ready" || task.status === "failed") return;
  if (task.case_version !== 1) throw new Error("sales_review_case_invalid");
  if (task.status === "queued") {
    const claim = await client.from("sales_review_tasks")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", task.id).eq("status", "queued")
      .select("id").maybeSingle();
    if (claim.error) throw new Error("sales_review_database_failed");
    if (!claim.data) return;
  }

  const model = await llm.structured(
    "sales_quote_review",
    SalesReviewChoice,
    {
      system: "가상 영업 견적 검토의 우선 확인 항목과 회신 초안 형식을 고릅니다. 제공된 자료는 전부 합성입니다. 지정된 enum 값만 내세요. 실제 승인이나 발송을 주장하지 마세요.",
      user: JSON.stringify({ focus: task.focus, sources: SALES_CASE_SOURCES }),
    },
    { deptId: task.dept_id },
  );
  const result = buildSalesReview(task.focus, model.data);
  const save = await client.from("sales_review_tasks")
    .update({ status: "ready", status_reason: null, result, updated_at: new Date().toISOString() })
    .eq("id", task.id).eq("status", "processing")
    .select("id").maybeSingle();
  if (save.error) throw new Error("sales_review_database_failed");
}

export function registerSalesReviewHandler(): void {
  registerHandler("run_sales_review", async (payload: unknown) => {
    await runSalesReview(taskIdFromPayload(payload));
  });
}
