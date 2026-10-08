// V20 glossary before/after on the SAME stored original: the department lead's session calls the product APIs.
//   node v20-reextract.mjs glossary-set            -> registers the 30 script terms (lead API)
//   node v20-reextract.mjs glossary-clear          -> removes all department terms (lead API)
//   node v20-reextract.mjs reextract|retry <reviewId> <outFile>  -> "원본 다시 읽기" / "처리 다시 시도", waits for the transcription
import fs from "node:fs";
import path from "node:path";
import { BASE, DEPT, WORK, service, sessionCookies, sleep, triggerJobs } from "./common.mjs";

const [command, reviewId, outFile] = process.argv.slice(2);
const { cookies } = await sessionCookies();
const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const api = async (pathname, init = {}) => {
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers: { cookie, origin: BASE, "content-type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

if (command === "glossary-set") {
  const { terms } = JSON.parse(fs.readFileSync(path.join(WORK, "scripts", "v20.json"), "utf8"));
  const results = [];
  for (const term of terms) {
    const r = await api(`/api/d/${DEPT}/glossary`, { method: "POST", body: JSON.stringify({ id: null, term, reading: null, note: null }) });
    results.push([term, r.status]);
  }
  const list = await api(`/api/d/${DEPT}/glossary`);
  console.log(JSON.stringify({ posted: results, entries: list.body?.entries?.length }));
} else if (command === "glossary-clear") {
  const list = await api(`/api/d/${DEPT}/glossary`);
  const out = [];
  for (const e of list.body?.entries ?? []) out.push([e.term, (await api(`/api/d/${DEPT}/glossary`, { method: "DELETE", body: JSON.stringify({ id: e.id }) })).status]);
  console.log(JSON.stringify({ deleted: out, remaining: (await api(`/api/d/${DEPT}/glossary`)).body?.entries?.length }));
} else if (command === "reextract" || command === "retry") {
  // Mirrors components/review-detail.tsx: 원본 다시 읽기 = review action "reextract" + POST /parts for every part;
  // 처리 다시 시도 = POST /parts for parts that are not done/processing/queued.
  const db = service();
  const before = (await db.from("reviewed_materials").select("revision,status,updated_at").eq("id", reviewId).single()).data;
  const partsBefore = (await db.from("review_parts").select("part_index,status").eq("review_id", reviewId).order("part_index")).data ?? [];
  const t0 = Date.now();
  if (command === "reextract") {
    const r = await api(`/api/d/${DEPT}/reviews/${reviewId}`, { method: "POST", body: JSON.stringify({ action: "reextract", revision: before.revision }) });
    console.log(JSON.stringify({ event: "reextract_request", status: r.status, body: r.body, revision: before.revision }));
    if (r.status !== 200) process.exit(1);
  }
  const targets = command === "reextract" ? partsBefore : partsBefore.filter((p) => !["done", "processing", "queued"].includes(p.status));
  for (const p of targets) {
    const q = await api(`/api/d/${DEPT}/reviews/${reviewId}/parts`, { method: "POST", body: JSON.stringify({ index: p.part_index }) });
    console.log(JSON.stringify({ event: "queue_part", index: p.part_index, status: q.status, body: q.status >= 400 ? q.body : undefined }));
  }
  let row = null; let parts = [];
  for (;;) {
    const run = await triggerJobs();
    if (run.claimed) console.log(JSON.stringify({ event: "jobs_run", ...run, ms: Date.now() - t0 }));
    row = (await db.from("reviewed_materials").select("status,status_reason,sections,revision").eq("id", reviewId).single()).data;
    parts = (await db.from("review_parts").select("part_index,start_seconds,end_seconds,status,attempt,error_code,last_word_end_seconds,updated_at").eq("review_id", reviewId).order("part_index")).data ?? [];
    const freshFailure = parts.some((p) => p.status === "failed" && Date.parse(p.updated_at) > t0);
    const settled = parts.every((p) => ["done", "failed"].includes(p.status));
    if (Date.now() - t0 > 5000 && row && ((settled && row.status !== "processing") || (row.status === "failed" && freshFailure))) break;
    if (Date.now() - t0 > 1_500_000) break;
    await sleep(2000);
  }
  fs.writeFileSync(outFile, JSON.stringify({ reviewId, command, status: row?.status, reason: row?.status_reason, revision: row?.revision, ms: Date.now() - t0, parts, sections: row?.sections ?? [] }, null, 1));
  console.log(JSON.stringify({ event: `${command}_done`, status: row?.status, reason: row?.status_reason, sections: row?.sections?.length, failedParts: parts.filter((p) => p.status === "failed").map((p) => [p.part_index, p.error_code]), ms: Date.now() - t0 }));
}
