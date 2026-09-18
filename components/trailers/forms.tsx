"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrailerGateReport, TrailerScenario } from "@/lib/contracts";
import { trailerApprovalItems, trailerTextFields } from "@/lib/trailer-gate";
import { DEFAULT_TRAILER_RUBRIC } from "@/lib/trailer-generation";
import { adminButton, adminInput } from "@/components/admin/actions";
import { ruleLabels, trailerNotice, trailerPanel, trailerReason, trailerStatus } from "./views";
import { TrailerInvites } from "./invites";

async function send(endpoint: string, body?: unknown, method = "POST") {
  const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const data = await response.json();
  return { ok: response.ok, ...data } as { ok: boolean; message?: string; error?: string; fields?: string[]; publicPath?: string; approvedCount?: number; totalCount?: number };
}
export type TrailerListRow = { id: string; status: string; status_reason: string | null; title: string; slug: string | null; updated_at: string };
export function TrailerList({ deptId, initial, hasCandidates }: { deptId: string; initial: TrailerListRow[]; hasCandidates: boolean }) {
  const [rows, setRows] = useState(initial), [error, setError] = useState("");
  const pending = rows.some((row) => ["generating", "checking"].includes(row.status));
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    const timer = setInterval(() => { fetch(`/api/d/${deptId}/trailers`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data) => { setRows(data.trailers); setError(""); }).catch(() => { if (!controller.signal.aborted) setError("목록을 갱신하지 못했습니다. 새로고침해 주세요."); }); }, 10_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [deptId, pending]);
  return <div className="grid gap-5"><p className="m-0 text-muted">지원자가 입사 전에 부서의 일을 체험하는 가상 사례입니다.</p>{hasCandidates ? <Link className={adminButton} href={`/d/${deptId}/trailers/new`}>새 예고편</Link> : <p className={trailerPanel}>원장에 부서 공개 결정이 있어야 예고편을 만들 수 있습니다. <Link className="text-accent" href={`/d/${deptId}/ledger`}>원장 →</Link></p>}{pending ? <p role="status">이 화면을 떠나도 생성과 검사는 계속됩니다. 10초마다 상태를 갱신합니다.</p> : null}{error ? <p role="alert">{error}</p> : null}{rows.map((row) => <Link className={`${trailerPanel} grid gap-2`} href={`/d/${deptId}/trailers/${row.id}`} key={row.id}><span className="text-sm text-accent">{trailerStatus[row.status] ?? "확인 필요"}</span><strong>{row.title || "새 예고편"}</strong>{row.status_reason ? <span className="text-sm">{trailerReason[row.status_reason] ?? "처리하지 못했습니다. 다시 시도해 주세요."}</span> : null}</Link>)}{!rows.length ? <p className="text-muted">아직 만든 예고편이 없습니다.</p> : null}</div>;
}
export type TrailerCandidate = { decision_id: string; decided_at: string; outcome: string; card_title: string | null };
export function TrailerCreate({ deptId, candidates }: { deptId: string; candidates: TrailerCandidate[] }) {
  const router = useRouter(); const [selected, setSelected] = useState<string[]>([]), [names, setNames] = useState(""), [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <form className="grid max-w-3xl gap-5" onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setMessage(""); try { const result = await send(`/api/d/${deptId}/trailers`, { decisionIds: selected, bannedTerms: names.split(/[,\n]/u).map((v) => v.trim()).filter(Boolean), applyUrl: url.trim() || null }); if (!result.ok) setMessage(result.message ?? "생성을 시작하지 못했습니다."); else router.push(`/d/${deptId}/trailers`); } catch { setMessage("응답을 확인하지 못했습니다. 목록에서 생성 상태를 확인해 주세요."); } finally { setBusy(false); } }}>
    <fieldset disabled={busy} className={`${trailerPanel} grid gap-4`}><legend className="font-bold">가상 사례로 만들 결정 1~3개</legend>{candidates.length ? candidates.map((item) => <label key={item.decision_id} className="flex gap-3 border-b border-ink/10 pb-3"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={selected.includes(item.decision_id)} disabled={!selected.includes(item.decision_id) && selected.length >= 3} onChange={(e) => setSelected((old) => e.target.checked ? [...old, item.decision_id] : old.filter((id) => id !== item.decision_id))} /><span className="grid gap-1"><strong>{item.card_title ?? "원장의 결정"}</strong><span className="text-sm">{item.outcome}</span><span className="text-xs text-muted">{new Date(item.decided_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span></span></label>) : <p>원장에 부서 공개 결정이 있어야 예고편을 만들 수 있습니다.</p>}</fieldset>
    <label className="grid gap-2">가릴 고유명사<textarea className={adminInput} rows={3} value={names} onChange={(e) => setNames(e.target.value)} disabled={busy} placeholder="쉼표·줄바꿈으로 구분, 최대 50개" /></label><label className="grid gap-2">공고 URL (선택)<input className={adminInput} type="url" pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} placeholder="https로 시작하는 주소만" /></label>
    <section className={trailerPanel}><h2 className="mt-0 text-lg">기준표</h2>{DEFAULT_TRAILER_RUBRIC.map((item) => <p key={item.key} className="text-sm"><strong>{item.label}</strong> · {item.description}</p>)}</section>{message ? <p role="alert">{message}</p> : null}<button className={`${adminButton} bg-accent text-background`} disabled={busy || !selected.length}>{busy ? "생성 시작 중…" : "생성"}</button>
  </form>;
}
export type TrailerReviewData = { id: string; status: string; status_reason: string | null; scenarios: TrailerScenario[]; updated_at: string; gate_report: TrailerGateReport | null; approved_item_ids: string[]; slug: string | null; unpublished_at: string | null };
const fieldLabel = (path: string) => {
  const part = path.split(".").at(-1) ?? "";
  const label = ({ title: "제목", summary: "요약", label: "표제", text: "내용", question: "질문", quote: "인용" } as Record<string, string>)[part] ?? "내용";
  const group = /\.(facts|dialogues|choices)\[(\d+)\]/u.exec(path);
  if (group) return `${({ facts: "사실", dialogues: "대화", choices: "선택지" } as Record<string,string>)[group[1]]} ${Number(group[2])+1} · ${label}`;
  return path.includes(".ending.") ? `엔딩 · ${label}` : label;
};
export function TrailerReview({ deptId, data, invitesEnabled = false }: { deptId: string; data: TrailerReviewData; invitesEnabled?: boolean }) {
  const router = useRouter(); const [scenarios, setScenarios] = useState(data.scenarios), [approved, setApproved] = useState(data.approved_item_ids), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [fields, setFields] = useState<string[]>([]), [publicPath, setPublicPath] = useState(data.slug ? `/t/${data.slug}` : ""), [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const [confirm, setConfirm] = useState<"publish" | "delete" | "unpublish">("publish");
  const base = `/api/d/${deptId}/trailers/${data.id}`; const pending = ["generating", "checking"].includes(data.status), editable = ["review", "unpublished"].includes(data.status);
  useEffect(() => { if (!pending) return; const timer = setInterval(() => router.refresh(), 10_000); return () => clearInterval(timer); }, [pending, router]);
  const approvalItems = trailerApprovalItems(scenarios);
  async function action(kind: "update" | "approve" | "publish" | "delete" | "unpublish" | "recheck" | "regenerate") {
    if (busy) return; setBusy(true); setMessage(""); setFields([]);
    try {
      const result = await send(kind === "update" || kind === "delete" ? base : `${base}/${kind}`, kind === "update" ? { scenarios, seenUpdatedAt: data.updated_at } : kind === "approve" ? { itemIds: approved } : undefined, kind === "update" ? "PATCH" : kind === "delete" ? "DELETE" : "POST");
      if (!result.ok) { setMessage(result.message ?? "처리하지 못했습니다. 다시 시도해 주세요."); setFields(result.fields ?? []); return; }
      if (kind === "delete") { router.push(`/d/${deptId}/trailers`); return; }
      if (result.publicPath) { setPublicPath(result.publicPath); setMessage(data.unpublished_at ? "새 링크로 발행되었습니다." : "발행되었습니다."); }
      else if (kind === "approve") setMessage(`승인 ${result.approvedCount} / 전체 ${result.totalCount} 저장했습니다.`);
      else setMessage("처리했습니다.");
      if (kind === "unpublish") setPublicPath(""); if (kind === "update") setDirty(false); router.refresh();
    } catch { setMessage("응답을 확인하지 못했습니다. 새로고침해 상태를 확인해 주세요."); }
    finally { setBusy(false); dialog.current?.close(); }
  }
  function edit(path: string, text: string) {
    setScenarios((previous) => { const next = structuredClone(previous); const keys = path.replace(/^scenarios\[/u, "").replaceAll("]", "").split(/[.[]/u); let target: unknown = next; for (const key of keys.slice(0, -1)) target = (target as Record<string, unknown>)[key]; (target as Record<string, unknown>)[keys.at(-1)!] = text; return next; }); setDirty(true);
  }
  return <section className={`${trailerPanel} grid gap-5`}><div><h2 className="mt-0 text-xl">가상화본 · {trailerStatus[data.status]}</h2><p className="rounded-xl bg-accent/10 p-4 text-sm">{trailerNotice}</p>{pending ? <p role="status">화면을 떠나도 작업은 계속됩니다. 10초마다 상태를 갱신합니다.</p> : null}{data.status_reason ? <p>{trailerReason[data.status_reason] ?? "처리하지 못했습니다."}</p> : null}</div>
    {scenarios.map((scenario, index) => <fieldset key={scenario.id} disabled={busy || !editable} className="grid min-w-0 gap-4 border-t border-ink/10 pt-5"><legend className="font-bold">사례 {index + 1}</legend>{fields.some((p) => p === `scenarios[${index}]`) ? <p role="alert" className="text-sm text-red-700">이 사례의 형식과 인용 관계를 확인해 주세요.</p> : null}{trailerTextFields([scenario]).map((field) => { const path = field.path.replace("scenarios[0]", `scenarios[${index}]`); const violations = data.gate_report?.violations.filter((v) => v.path === path || path.startsWith(`${v.path}.`)) ?? []; const invalid = fields.includes(path) || violations.length > 0; return <label key={path} className="grid gap-2 text-sm">{fieldLabel(path)}<textarea aria-invalid={invalid} className={`${adminInput} ${invalid ? "border-red-600" : ""}`} rows={field.text.length > 100 ? 4 : 2} maxLength={2000} value={field.text} onChange={(e) => edit(path, e.target.value)} />{invalid ? <span className="text-red-700">{violations.map((v) => ruleLabels[v.rule]).join(" · ") || "형식과 인용을 확인해 주세요."}</span> : null}</label>; })}</fieldset>)}
    {editable ? <div className="flex flex-wrap gap-2"><button className={adminButton} disabled={busy || !dirty} onClick={() => void action("update")}>수정 저장</button><button className={adminButton} disabled={busy || dirty || data.status !== "review"} onClick={() => void action("recheck")}>다시 검사</button></div> : null}
    {data.status === "unpublished" ? <p className="m-0 text-sm text-muted">내용을 수정해 저장하면 다시 검토하고 발행할 수 있습니다.</p> : null}
    {(data.gate_report?.violations.length ?? 0) > 20 ? <p>다시 생성을 권합니다. 검토 상태에서는 삭제 후 새로 만들어 주세요.</p> : null}
    {data.status === "failed" ? <button className={adminButton} disabled={busy} onClick={() => void action("regenerate")}>다시 생성</button> : null}
    {approvalItems.length ? <fieldset disabled={busy || dirty || data.status !== "review" || !data.gate_report?.passed} className="grid min-w-0 gap-3"><legend className="font-bold">항목별 공개 승인 · 승인 {approved.length} / 전체 {approvalItems.length}</legend>{approvalItems.map((item) => <label className="flex gap-3 rounded-xl bg-ink/5 p-3 text-sm" key={item.id}><input className="mt-1 size-4 shrink-0" type="checkbox" checked={approved.includes(item.id)} onChange={(e) => setApproved((old) => e.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id))} /><span className="whitespace-pre-wrap break-words">{item.text}</span></label>)}<button className={adminButton} onClick={() => void action("approve")}>공개 승인 저장</button></fieldset> : null}
    {message ? <p role="status" className="whitespace-pre-wrap">{message}</p> : data.status === "published" ? <p role="status">{data.unpublished_at ? "새 링크로 발행되었습니다." : "발행되었습니다."}</p> : null}{publicPath ? <div className="grid gap-2"><Link href={publicPath} className="break-all text-accent">{publicPath}</Link><button className={adminButton} onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${publicPath}`); setMessage("링크를 복사했습니다."); } catch { setMessage("복사하지 못했습니다. 링크 주소를 직접 복사해 주세요."); } }}>복사</button></div> : null}
    <TrailerInvites deptId={deptId} trailerId={data.id} published={data.status === "published"} enabled={invitesEnabled} />
    <div className="flex flex-wrap gap-2">{([...(data.status === "review" ? ["publish"] : []), ...(data.status === "published" ? ["unpublish"] : []), ...(["review", "failed", "unpublished"].includes(data.status) ? ["delete"] : [])] as ("publish" | "unpublish" | "delete")[]).map((kind) => <button key={kind} disabled={busy || dirty} className={adminButton} onClick={() => { setConfirm(kind); dialog.current?.showModal(); }}>{kind === "publish" ? "발행" : kind === "unpublish" ? "철회" : "삭제"}</button>)}</div>
    <dialog ref={dialog} onCancel={(e) => { if (busy) e.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-6 text-ink backdrop:bg-black/40"><h3>{confirm === "publish" ? "공개 링크로 발행할까요?" : confirm === "unpublish" ? "공개 링크를 철회할까요?" : "이 예고편을 삭제할까요?"}</h3><p className="text-sm">{confirm === "publish" ? "링크를 가진 누구나 가상 사례를 체험할 수 있습니다." : confirm === "unpublish" ? "현재 공개 링크가 닫힙니다. 다시 발행하면 새 링크가 생깁니다." : "삭제한 초안은 되돌릴 수 없습니다."}</p><div className="flex gap-2"><button className={adminButton} disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button className={adminButton} disabled={busy} onClick={() => void action(confirm)}>확인</button></div></dialog>
  </section>;
}
