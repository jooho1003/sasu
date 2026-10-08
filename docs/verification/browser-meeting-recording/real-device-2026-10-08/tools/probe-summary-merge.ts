// Local diagnostic only (not committed): run summarize_document on one labeled meeting with Groq error / Zod issue logging.
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
const local = JSON.parse(readFileSync("../real-device-20261005/env.json", "utf8"));
process.env.NEXT_PUBLIC_SUPABASE_URL = local.url; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.anon; process.env.SUPABASE_SERVICE_ROLE_KEY = local.service;
loadEnvConfig(process.cwd());
const which = process.argv[2] ?? "M1";
const realFetch = globalThis.fetch;
let call = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await realFetch(input, init);
  if (String(input).includes("groq")) {
    call += 1;
    const user = (() => { try { const b = JSON.parse(String(init?.body)); return String(b.messages?.at(-1)?.content ?? "").slice(0, 160); } catch { return ""; } })();
    if (res.status >= 400) console.log(JSON.stringify({ call, groq_status: res.status, user, body: (await res.clone().text()).slice(0, 900) }));
  }
  return res;
}) as typeof fetch;
async function main() {
  const { DocumentSummary } = await import("../lib/contracts");
  const orig = DocumentSummary.safeParse.bind(DocumentSummary);
  (DocumentSummary as unknown as { safeParse: typeof orig }).safeParse = ((v: unknown) => { const r = orig(v); if (!r.success) console.log(JSON.stringify({ call, zod: r.error.issues.slice(0, 4).map((i) => ({ path: i.path, msg: i.message })), candidate: JSON.stringify(v).slice(0, 500) })); return r; }) as typeof orig;
  const { summarizeDocument } = await import("../lib/pipeline/document-summary");
  const { createServiceSupabaseClient } = await import("../lib/supabase/service");
  const db = createServiceSupabaseClient();
  const DEPT = "22222222-2222-4222-8222-222222222222";
  const meeting = JSON.parse(readFileSync("../real-device-20261005/scripts/v20-meetings.json", "utf8")).meetings.find((m: { id: string }) => m.id === which);
  const s = await db.from("sources").insert({ dept_id: DEPT, kind: "document", external_id: `v20-probe:${which}:${Date.now()}`, title: "probe", visibility: "dept", active: true }).select("id").single();
  const sid = s.data!.id as string;
  await db.from("items").insert(meeting.items.map((content: string, i: number) => ({ source_id: sid, dept_id: DEPT, external_ref: `review-section-${i}`, author: "동의 확인 음성 전사", content })));
  await db.from("document_summaries").insert({ source_id: sid, dept_id: DEPT, status: "processing", extracted_chars: 1, chunk_count: meeting.items.length });
  try { await summarizeDocument(sid); console.log(JSON.stringify({ ok: true, calls: call })); }
  catch (e) { console.log(JSON.stringify({ fail: (e as Error).message, code: (e as { error_code?: string }).error_code, calls: call })); }
  await db.from("document_summaries").delete().eq("source_id", sid); await db.from("items").delete().eq("source_id", sid); await db.from("sources").delete().eq("id", sid);
}
main();
