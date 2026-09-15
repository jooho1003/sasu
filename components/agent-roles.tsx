"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type MemberRole = "lead" | "member";
type Visibility = "dept" | "leads_only";
type Criterion = { key: string; label: string; description: string; weight: number };
type Role = { id: string; name: string; instruction: string; criteria: Criterion[]; visibility: Visibility; created_at: string };
type Document = { id: string; title: string | null; status: "processing" | "summarized" | "summary_failed" };
type Citation = { item_id: string | null; decision_id: string | null; quote: string };
type ResultCriterion = { key: string; label: string; weight: number; score: number | null; rationale: string | null; citations: Citation[]; evidence: "ok" | "no_evidence" };
type ResultData = { criteria: ResultCriterion[]; summary: string };
type RoleResult = { id: string; source_id: string; title: string | null; status: "processing" | "completed" | "failed"; status_reason: string | null; result: ResultData | null; weighted_score: number | null; visibility: Visibility; updated_at: string };
type FormCriterion = Omit<Criterion, "key">;

const EMPTY_CRITERION: FormCriterion = { label: "", description: "", weight: 3 };

function errorMessage(body: { error?: string }, fallback: string) { return body.error ?? fallback; }
function failureMessage(reason: string | null) {
  if (reason === "no_document_chunks") return "문서에서 읽을 내용이 없습니다";
  if (reason === "citation_invalid") return "원문 근거를 찾지 못해 점수를 내지 않았습니다";
  if (reason === "llm_timeout") return "시간 초과";
  return "평가하지 못했습니다";
}
function visibilityLabel(visibility: Visibility) { return visibility === "leads_only" ? "팀장만" : "부서 전체"; }

export default function AgentRoles({ deptId, role }: { deptId: string; role: MemberRole }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [results, setResults] = useState<RoleResult[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("leads_only");
  const [criteria, setCriteria] = useState<FormCriterion[]>([{ ...EMPTY_CRITERION }]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "run" | "archive" | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);

  const selectedRole = useMemo(() => roles.find((item) => item.id === selectedRoleId) ?? null, [roles, selectedRoleId]);

  const loadDocuments = useCallback(async () => {
    const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/documents`, { cache: "no-store" });
    const body = (await response.json()) as { documents?: Document[]; error?: string };
    if (!response.ok || !body.documents) throw new Error(errorMessage(body, "문서 목록을 불러오지 못했습니다."));
    setDocuments(body.documents.filter((document) => document.status === "summarized").slice(0, 20));
  }, [deptId]);

  const loadResults = useCallback(async (roleId: string) => {
    const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/roles/${encodeURIComponent(roleId)}/runs`, { cache: "no-store" });
    const body = (await response.json()) as { results?: RoleResult[]; error?: string };
    if (!response.ok || !body.results) throw new Error(errorMessage(body, "점수표를 불러오지 못했습니다."));
    setResults(body.results);
  }, [deptId]);

  useEffect(() => {
    let cancelled = false;
    const initial = async () => {
      try {
        const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/roles`, { cache: "no-store" });
        const body = (await response.json()) as { roles?: Role[]; error?: string };
        if (!response.ok || !body.roles) throw new Error(errorMessage(body, "역할 목록을 불러오지 못했습니다."));
        if (!cancelled) {
          setRoles(body.roles);
          setSelectedRoleId((current) => current && body.roles?.some((item) => item.id === current) ? current : body.roles?.[0]?.id ?? null);
          setLoadError(null);
        }
        if (role === "lead") await loadDocuments();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "역할 정보를 불러오지 못했습니다.");
      }
    };
    void initial();
    return () => { cancelled = true; };
  }, [deptId, loadDocuments, role]);

  useEffect(() => {
    if (!selectedRoleId) return;
    const timer = window.setTimeout(() => {
      void loadResults(selectedRoleId).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "점수표를 불러오지 못했습니다."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadResults, selectedRoleId]);

  useEffect(() => {
    if (!selectedRoleId || !results.some((item) => item.status === "processing")) return;
    const timer = setInterval(() => { void loadResults(selectedRoleId).catch(() => undefined); }, 4_000);
    return () => clearInterval(timer);
  }, [loadResults, results, selectedRoleId]);

  const createRole = async () => {
    setFormError(null);
    setBusy("create");
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/roles`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, instruction, visibility, criteria: criteria.map((criterion, index) => ({ ...criterion, key: `criterion_${index + 1}` })) }),
      });
      const body = (await response.json()) as { role?: Role; error?: string };
      if (!response.ok || !body.role) throw new Error(errorMessage(body, "역할을 저장하지 못했습니다."));
      setRoles((current) => [body.role as Role, ...current]);
      setSelectedRoleId(body.role.id);
      setName(""); setInstruction(""); setVisibility("leads_only"); setCriteria([{ ...EMPTY_CRITERION }]);
    } catch (error) { setFormError(error instanceof Error ? error.message : "역할을 저장하지 못했습니다."); }
    finally { setBusy(null); }
  };

  const archiveRole = async (roleId: string) => {
    setBusy("archive");
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/roles/${encodeURIComponent(roleId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived: true }) });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(errorMessage(body, "역할을 보관하지 못했습니다."));
      setRoles((current) => current.filter((item) => item.id !== roleId));
      setArchiveConfirmId(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "역할을 보관하지 못했습니다."); }
    finally { setBusy(null); }
  };

  const runRole = async () => {
    if (!selectedRole || selectedDocuments.length === 0) { setRunError("적용할 처리 완료 문서를 하나 이상 선택해주세요."); return; }
    setRunError(null); setBusy("run");
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/roles/${encodeURIComponent(selectedRole.id)}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_ids: selectedDocuments }) });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(errorMessage(body, "역할 적용을 요청하지 못했습니다."));
      setSelectedDocuments([]);
      await loadResults(selectedRole.id);
    } catch (error) { setRunError(error instanceof Error ? error.message : "역할 적용을 요청하지 못했습니다."); }
    finally { setBusy(null); }
  };

  return <main className="workspace-page">
    <header className="flex flex-wrap items-end justify-between gap-4"><div className="grid gap-2"><p className="m-0 text-sm font-bold text-[var(--accent)]">사수 · 부서 에이전트 역할</p><h1 className="m-0 text-3xl">문서 기준표 평가</h1><p className="m-0 text-[var(--muted)]">역할과 근거가 있는 기준으로 문서를 검토합니다.</p></div></header>
    {loadError ? <p className="rounded-xl bg-[var(--surface)] p-4" role="alert">{loadError}</p> : null}
    <section className="grid gap-4 panel p-6"><div><p className="m-0 text-sm text-[var(--muted)]">역할 목록</p><h2 className="m-0 text-2xl">저장된 역할</h2></div>{roles.length === 0 ? <p className="m-0 text-[var(--muted)]">아직 저장된 역할이 없습니다.</p> : <div className="grid gap-3 sm:grid-cols-2">{roles.map((item) => <button key={item.id} className={`grid gap-2 rounded-2xl border p-4 text-left ${item.id === selectedRoleId ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-black/10"}`} onClick={() => setSelectedRoleId(item.id)} type="button"><span className="font-bold">{item.name}</span><span className="text-sm text-[var(--muted)]">{visibilityLabel(item.visibility)} · 기준 {item.criteria.length}개</span></button>)}</div>}</section>
    {selectedRole ? <section className="grid gap-5 panel p-6"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="m-0 text-sm text-[var(--muted)]">선택한 역할</p><h2 className="m-0 text-2xl">{selectedRole.name}</h2></div>{role === "lead" ? archiveConfirmId === selectedRole.id ? <div className="flex items-center gap-2"><span className="text-sm">이 역할을 보관할까요?</span><button className="rounded-lg bg-[var(--urgent)] px-3 py-2 text-sm font-bold text-white" disabled={busy === "archive"} onClick={() => void archiveRole(selectedRole.id)} type="button">보관</button><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setArchiveConfirmId(null)} type="button">취소</button></div> : <button className="rounded-lg border border-[var(--urgent)] px-3 py-2 text-sm font-bold text-[var(--urgent)]" onClick={() => setArchiveConfirmId(selectedRole.id)} type="button">보관</button> : null}</header><p className="m-0 whitespace-pre-wrap leading-7">{selectedRole.instruction}</p><div className="overflow-x-auto"><table className="w-full min-w-150 text-sm"><thead><tr className="border-b text-left text-[var(--muted)]"><th className="p-2">기준</th><th className="p-2">설명</th><th className="p-2">가중치</th></tr></thead><tbody>{selectedRole.criteria.map((criterion) => <tr key={criterion.key} className="border-b border-black/5"><td className="p-2 font-bold">{criterion.label}</td><td className="p-2">{criterion.description}</td><td className="p-2">{criterion.weight}</td></tr>)}</tbody></table></div></section> : null}
    {role === "lead" ? <section className="grid gap-5 panel p-6"><div><p className="m-0 text-sm text-[var(--muted)]">새 역할</p><h2 className="m-0 text-2xl">역할 만들기</h2></div><label className="grid gap-2 text-sm font-bold">이름<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" maxLength={60} onChange={(event) => setName(event.target.value)} value={name} /></label><label className="grid gap-2 text-sm font-bold">지시문<textarea className="min-h-32 rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" maxLength={2000} onChange={(event) => setInstruction(event.target.value)} placeholder="백엔드 개발자 채용 서류를 검토합니다. 우리 인재상은 … 프로젝트에서는 Next.js·Supabase를 …" value={instruction} /><span className="text-right font-normal text-[var(--muted)]">{instruction.length}/2000</span></label><label className="grid gap-2 text-sm font-bold">공개 범위<select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" onChange={(event) => setVisibility(event.target.value as Visibility)} value={visibility}><option value="leads_only">팀장만</option><option value="dept">부서 전체</option></select></label><div className="grid gap-3"><p className="m-0 text-sm font-bold">평가 기준</p>{criteria.map((criterion, index) => <div key={index} className="grid gap-3 rounded-xl border border-black/10 p-4 sm:grid-cols-[1fr_2fr_100px_auto]"><input aria-label={`기준 ${index + 1} 라벨`} className="rounded-lg border border-black/15 px-3 py-2" maxLength={40} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="라벨" value={criterion.label} /><input aria-label={`기준 ${index + 1} 설명`} className="rounded-lg border border-black/15 px-3 py-2" maxLength={300} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="설명" value={criterion.description} /><select aria-label={`기준 ${index + 1} 가중치`} className="rounded-lg border border-black/15 px-3 py-2" onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(event.target.value) } : item))} value={criterion.weight}>{[1, 2, 3, 4, 5].map((weight) => <option key={weight} value={weight}>가중치 {weight}</option>)}</select><button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={criteria.length === 1} onClick={() => setCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">삭제</button></div>)}</div><div className="flex flex-wrap gap-3"><button className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent)] disabled:opacity-50" disabled={criteria.length >= 10} onClick={() => setCriteria((current) => [...current, { ...EMPTY_CRITERION }])} type="button">기준 추가</button><button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy === "create"} onClick={() => void createRole()} type="button">{busy === "create" ? "저장 중…" : "역할 저장"}</button></div>{formError ? <p className="m-0 text-sm text-red-700" role="alert">{formError}</p> : null}</section> : null}
    {role === "lead" && selectedRole ? <section className="grid gap-4 panel p-6"><div><p className="m-0 text-sm text-[var(--muted)]">문서에 적용</p><h2 className="m-0 text-2xl">{selectedRole.name} 역할 적용</h2></div><p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-4 text-sm font-bold">지원자 등 외부인의 문서는 개인정보 수집·이용 동의를 받은 경우에만 올리세요.</p>{documents.length === 0 ? <p className="m-0 text-[var(--muted)]">처리 완료된 문서가 없습니다.</p> : <div className="grid gap-2">{documents.map((document) => <label key={document.id} className="flex items-center gap-3 rounded-xl border border-black/10 p-3"><input checked={selectedDocuments.includes(document.id)} onChange={(event) => setSelectedDocuments((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} type="checkbox" /><span>{document.title ?? "이름 없는 문서"}</span></label>)}</div>}<button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy === "run" || documents.length === 0} onClick={() => void runRole()} type="button">{busy === "run" ? "요청 중…" : "역할 적용"}</button>{runError ? <p className="m-0 text-sm text-red-700" role="alert">{runError}</p> : null}</section> : null}
    {selectedRole ? <section className="grid gap-4 panel p-6"><div><p className="m-0 text-sm text-[var(--muted)]">점수표</p><h2 className="m-0 text-2xl">{selectedRole.name} 평가 결과</h2><p className="mt-2 rounded-xl bg-[var(--accent)]/10 p-3 font-bold text-[var(--accent)]">AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다.</p><p className="mt-2 text-sm text-[var(--muted)]">가중 점수 = 기준별 점수×가중치 합 ÷ 전체 가중치. 근거 없는 기준은 0점.</p></div><div className="overflow-x-auto"><table className="w-full min-w-225 text-sm"><thead><tr className="border-b text-left text-[var(--muted)]"><th className="p-2">문서</th><th className="p-2">가중 점수</th>{selectedRole.criteria.map((criterion) => <th key={criterion.key} className="p-2">{criterion.label}</th>)}<th className="p-2">상태</th></tr></thead><tbody>{results.map((item) => { const resultCriteria = new Map(item.result?.criteria.map((criterion) => [criterion.key, criterion]) ?? []); const hasEvidence = (item.result?.criteria ?? []).some((criterion) => criterion.evidence === "ok"); return <><tr key={item.id} className="border-b border-black/10"><td className="p-2 font-bold"><button className="text-left underline" onClick={() => setExpandedResult((current) => current === item.id ? null : item.id)} type="button">{item.title ?? "이름 없는 문서"}</button></td><td className="p-2">{item.weighted_score === null ? "—" : item.weighted_score.toFixed(2)}</td>{selectedRole.criteria.map((criterion) => { const value = resultCriteria.get(criterion.key); return <td key={criterion.key} className="p-2">{value?.evidence === "ok" ? value.score : "근거 없음 (0점 반영)"}</td>; })}<td className="p-2">{item.status === "processing" ? "평가 중" : item.status === "failed" ? failureMessage(item.status_reason) : "완료"}{item.status === "completed" && item.status_reason === "document_truncated" ? <span className="ml-2 rounded-full bg-[var(--urgent)]/10 px-2 py-1 text-xs">문서가 길어 앞부분 24,000자만 평가</span> : null}</td></tr>{expandedResult === item.id ? <tr key={`${item.id}-detail`}><td className="bg-black/3 p-4" colSpan={selectedRole.criteria.length + 3}>{item.result ? <div className="grid gap-4">{item.result.criteria.map((criterion) => <section key={criterion.key} className="grid gap-2"><h3 className="m-0 text-base">{criterion.label} · {criterion.evidence === "ok" ? `${criterion.score}점` : "근거 없음 (0점 반영)"}</h3>{criterion.evidence === "ok" ? <><p className="m-0 whitespace-pre-wrap leading-7">{criterion.rationale}</p>{criterion.citations.map((citation) => <Link key={`${citation.item_id}-${citation.quote}`} className="w-fit rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3" href={`/d/${deptId}#item-${citation.item_id ?? ""}`}><q>{citation.quote}</q></Link>)}</> : <p className="m-0 text-[var(--muted)]">근거 없음 (0점 반영)</p>}</section>)}{hasEvidence ? <section className="grid gap-2 border-t border-black/10 pt-4"><h3 className="m-0 text-base">요약</h3><p className="m-0 whitespace-pre-wrap leading-7">{item.result.summary}</p></section> : null}</div> : <p className="m-0 text-[var(--muted)]">평가 결과를 기다리고 있습니다.</p>}</td></tr> : null}</>; })}</tbody></table></div>{results.length === 0 ? <p className="m-0 text-[var(--muted)]">아직 이 역할의 평가 결과가 없습니다.</p> : null}</section> : null}
  </main>;
}
