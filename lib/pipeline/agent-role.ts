import {
  AgentRoleDefinition,
  AgentRoleEvaluation,
  type AgentRoleDefinition as AgentRoleDefinitionValue,
} from "@/lib/contracts";
import {
  buildAgentRolePrompt,
  selectAgentRoleChunks,
  verifyAgentRoleEvaluation,
  weightedScore,
} from "@/lib/agent-role";
import { registerHandler } from "@/lib/jobs";
import { llm } from "@/lib/llm";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ResultRow = {
  id: string;
  role_id: string;
  source_id: string;
  dept_id: string;
  status: string;
};

type RoleRow = {
  id: string;
  name: string;
  instruction: string;
  criteria: unknown;
  visibility: "dept" | "leads_only";
};

type ItemRow = { id: string; content: string };

function resultIdFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("run_agent_role job payload is invalid");
  }
  const resultId = Reflect.get(payload, "resultId");
  if (typeof resultId !== "string" || !resultId) {
    throw new Error("run_agent_role job payload is invalid");
  }
  return resultId;
}

function roleDefinition(role: RoleRow): AgentRoleDefinitionValue {
  return AgentRoleDefinition.parse({
    name: role.name,
    instruction: role.instruction,
    visibility: role.visibility,
    criteria: role.criteria,
  });
}

async function updateResult(
  resultId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const client = createServiceSupabaseClient();
  const update = await client
    .from("agent_role_results")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", resultId);
  if (update.error) throw new Error("agent_role_database_failed");
}

export async function runAgentRole(resultId: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const resultQuery = await client
    .from("agent_role_results")
    .select("id, role_id, source_id, dept_id, status")
    .eq("id", resultId)
    .maybeSingle<ResultRow>();
  if (resultQuery.error) throw new Error("agent_role_database_failed");
  const result = resultQuery.data;
  if (!result || result.status !== "processing") return;

  const roleQuery = await client
    .from("agent_roles")
    .select("id, name, instruction, criteria, visibility")
    .eq("id", result.role_id)
    .maybeSingle<RoleRow>();
  if (roleQuery.error) throw new Error("agent_role_database_failed");
  if (!roleQuery.data) throw new Error("agent_role_database_failed");
  const role = roleDefinition(roleQuery.data);

  const itemsQuery = await client
    .from("items")
    .select("id, content")
    .eq("source_id", result.source_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (itemsQuery.error) throw new Error("agent_role_database_failed");
  const items = (itemsQuery.data ?? []) as ItemRow[];
  if (items.length === 0) {
    await updateResult(result.id, { status: "failed", status_reason: "no_document_chunks", result: null, weighted_score: null });
    return;
  }

  const selected = selectAgentRoleChunks(items);
  const output = await llm.structured(
    "run_agent_role",
    AgentRoleEvaluation,
    buildAgentRolePrompt(role, selected.items),
    { deptId: result.dept_id },
  );
  const verified = verifyAgentRoleEvaluation(
    output.data,
    role,
    new Map(items.map((item) => [item.id, item.content])),
  );
  const score = weightedScore(verified.criteria);
  if (score === null) {
    await updateResult(result.id, { status: "failed", status_reason: "citation_invalid", result: null, weighted_score: null });
    return;
  }

  await updateResult(result.id, {
    status: "completed",
    status_reason: selected.truncated ? "document_truncated" : verified.dropped > 0 ? "citation_invalid_dropped" : null,
    result: { criteria: verified.criteria, summary: verified.summary },
    weighted_score: score,
  });
}

export function registerAgentRoleHandler(): void {
  registerHandler("run_agent_role", async (payload: unknown) => {
    await runAgentRole(resultIdFromPayload(payload));
  });
}
