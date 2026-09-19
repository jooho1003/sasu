import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { decryptConnectionSecret } from "@/lib/retro/connection-crypto";
import { mapConnectorRows } from "@/lib/retro/connectors/map";
import { mask } from "@/lib/mask";

export async function pullRetroConnection(payload: { connectionId: string; date: string }) {
  const client = createServiceSupabaseClient();
  const connection = await client.from("retro_connections").select("id,user_id,dept_id,provider,config,encrypted_secret,status,failure_count").eq("id", payload.connectionId).maybeSingle();
  if (connection.error || !connection.data || connection.data.status !== "active") return;
  try {
    const secret = decryptConnectionSecret(connection.data.encrypted_secret, connection.data.user_id, connection.data.provider);
    const endpoint = typeof connection.data.config?.endpoint === "string" ? connection.data.config.endpoint : "";
    if (!/^https:\/\//.test(endpoint)) throw Object.assign(new Error("connector_not_configured"), { code: "connector_not_configured" });
    const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Object.assign(new Error("connector_http_failed"), { code: response.status === 429 ? "rate_limited" : "connector_http_failed" });
    const body = await response.json() as { rows?: unknown[] };
    const rows = Array.isArray(body.rows) ? body.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
    const activities = mapConnectorRows(connection.data.provider, rows, payload.date, typeof connection.data.config?.tz === "string" ? connection.data.config.tz : "Asia/Seoul").map(activity => ({ ...activity, title: mask(activity.title), text: mask(activity.text) }));
    const saved = await client.rpc("upsert_retro_activities_as", { p_user: connection.data.user_id, p_dept: connection.data.dept_id, p_date: payload.date, p_activities: activities });
    if (saved.error) throw Object.assign(new Error("connector_save_failed"), { code: "connector_save_failed" });
    await client.from("retro_connections").update({ last_pulled_at: new Date().toISOString(), last_error: null, failure_count: 0, updated_at: new Date().toISOString() }).eq("id", connection.data.id);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "connector_failed";
    await client.from("retro_connections").update({ status: "error", last_error: code, failure_count: Math.min(99, (connection.data.failure_count ?? 0) + 1), updated_at: new Date().toISOString() }).eq("id", connection.data.id);
  }
}
export function registerRetroPullHandler() { registerHandler("retro_pull", async payload => { if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).connectionId !== "string" || typeof (payload as Record<string, unknown>).date !== "string") throw new Error("invalid_retro_pull"); await pullRetroConnection(payload as { connectionId: string; date: string }); }); }
