// V20 decision-candidate measurement: runs the real summarize_document pipeline (chunk extraction + one merge call)
// on labeled synthetic meetings in the LOCAL QA database and scores candidates before/after the merge call.
//   npx tsx scripts/measure-decision-merge.ts <meetings.json> <local-env.json> <out.json>
// "before" = verified chunk extractions combined without the merge call (what the pipeline had before ADR B6);
// "after" = the stored, verified final summary. A candidate matches a label when it cites one of the label's evidence items.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

type Label = { id: string; type: "decision" | "action"; evidence: number[] };
type Meeting = { id: string; title: string; items: string[]; labels: Label[] };
type Entry = { item_id: string; text: string };

const [meetingsPath, envPath, outPath] = process.argv.slice(2);
if (!meetingsPath || !envPath || !outPath) throw new Error("usage: measure-decision-merge.ts <meetings.json> <local-env.json> <out.json>");
const local = JSON.parse(readFileSync(resolve(envPath), "utf8")) as { url: string; anon: string; service: string };
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(local.url)) throw new Error("local_supabase_required");
process.env.NEXT_PUBLIC_SUPABASE_URL = local.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.anon;
process.env.SUPABASE_SERVICE_ROLE_KEY = local.service;
loadEnvConfig(process.cwd());

const DEPT = "22222222-2222-4222-8222-222222222222";

async function main() {
  const { llm } = await import("../lib/llm");
  const { summarizeDocument, mergeDocumentSummaries, verifyDocumentSummary } = await import("../lib/pipeline/document-summary");
  const { createServiceSupabaseClient } = await import("../lib/supabase/service");
  const db = createServiceSupabaseClient();
  const calls: Array<{ kind: "chunk" | "merge"; itemId: string | null; data: unknown }> = [];
  const original = llm.structured;
  llm.structured = (async (purpose, schema, prompt, opts) => {
    const result = await original(purpose, schema, prompt, opts);
    if (purpose === "summarize_document") {
      const payload = JSON.parse(prompt.user) as { items?: Array<{ item_id: string }> };
      calls.push({ kind: payload.items ? "chunk" : "merge", itemId: payload.items?.[0]?.item_id ?? null, data: result.data });
    }
    return result;
  }) as typeof llm.structured;

  const { meetings } = JSON.parse(readFileSync(resolve(meetingsPath), "utf8")) as { meetings: Meeting[] };
  const report: unknown[] = [];
  for (const meeting of meetings) {
    calls.length = 0;
    const stamp = new Date().toISOString();
    const source = await db.from("sources").insert({ dept_id: DEPT, kind: "document", external_id: `v20-meeting:${meeting.id}:${stamp}`, title: `V20 합성 회의 ${meeting.id} ${meeting.title}`, visibility: "dept", active: true }).select("id").single();
    if (source.error) throw new Error(`source_insert_failed:${source.error.code}`);
    const sid = source.data.id as string;
    const inserted = await db.from("items").insert(meeting.items.map((content, index) => ({
      source_id: sid, dept_id: DEPT, external_ref: `review-section-${index}`, author: "동의 확인 음성 전사", content,
    }))).select("id,external_ref");
    if (inserted.error) throw new Error(`items_insert_failed:${inserted.error.code}`);
    const indexOf = new Map<string, number>(inserted.data.map((row) => [row.id as string, Number(String(row.external_ref).replace("review-section-", ""))]));
    const contents = new Map<string, string>(inserted.data.map((row) => [row.id as string, meeting.items[indexOf.get(row.id as string)!]]));
    const summaryRow = await db.from("document_summaries").insert({ source_id: sid, dept_id: DEPT, status: "processing", extracted_chars: meeting.items.join("").length, chunk_count: meeting.items.length });
    if (summaryRow.error) throw new Error(`summary_insert_failed:${summaryRow.error.code}`);
    const started = Date.now();
    // The product job runner retries a failed summarize_document job; mirror that with up to 3 whole-document attempts.
    const attempts: string[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      calls.length = 0;
      await db.from("document_summaries").update({ status: "processing", summary: null, status_reason: null }).eq("source_id", sid);
      try { await summarizeDocument(sid); attempts.push("ok"); break; }
      catch (error) { attempts.push(error instanceof Error ? (Reflect.get(error, "error_code") as string | undefined) ?? error.message.slice(0, 80) : "unknown"); }
    }
    // A failed final attempt is scored as the product behaves: no stored summary => no candidates after the merge.
    const failed = attempts.at(-1) !== "ok";
    const stored = await db.from("document_summaries").select("status,status_reason,summary").eq("source_id", sid).single();
    // Rebuild "before": each chunk verified against its own item, combined without the merge call, verified again.
    const chunkResults = calls.filter((c) => c.kind === "chunk");
    const verifiedChunks = chunkResults.map((c) => verifyDocumentSummary(c.data as Parameters<typeof verifyDocumentSummary>[0],
      new Map([[c.itemId!, contents.get(c.itemId!)!]])).valid).filter((s) => s.citations.length > 0);
    const before = verifyDocumentSummary(mergeDocumentSummaries(verifiedChunks), contents).valid;
    const after = (failed ? null : stored.data?.summary) as typeof before | null;
    const score = (entries: Entry[], type: Label["type"]) => entries.map((entry) => {
      const index = indexOf.get(entry.item_id);
      const label = meeting.labels.find((l) => l.type === type && index !== undefined && l.evidence.includes(index));
      return { id: label ? label.id : `x${index ?? "?"}`, item: index ?? null, text: entry.text };
    });
    const row = {
      id: meeting.id, title: meeting.title, attempts, failed, ms: Date.now() - started, status: failed ? "summary_failed" : stored.data?.status, reason: stored.data?.status_reason,
      chunk_calls: chunkResults.length, merge_calls: calls.filter((c) => c.kind === "merge").length,
      labels: { decision: meeting.labels.filter((l) => l.type === "decision").map((l) => l.id), action: meeting.labels.filter((l) => l.type === "action").map((l) => l.id) },
      before: { decision: score(before.decisions, "decision"), action: score(before.actions, "action") },
      after: { decision: score(after?.decisions ?? [], "decision"), action: score(after?.actions ?? [], "action") },
    };
    report.push(row);
    console.log(JSON.stringify({ id: row.id, attempts, status: row.status, chunk_calls: row.chunk_calls, merge_calls: row.merge_calls,
      before: row.before.decision.map((e) => e.id), after: row.after.decision.map((e) => e.id), ms: row.ms }));
    await db.from("document_summaries").delete().eq("source_id", sid);
    await db.from("items").delete().eq("source_id", sid);
    await db.from("sources").delete().eq("id", sid);
  }
  writeFileSync(resolve(outPath), JSON.stringify({ measured_at: new Date().toISOString(), meetings: report }, null, 1));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "measure_failed"}\n`);
  process.exitCode = 1;
});
