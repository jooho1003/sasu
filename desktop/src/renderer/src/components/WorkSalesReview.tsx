import { useEffect, useRef, useState } from "react";
import { message } from "../../../shared/messages";
import type { SalesStatus } from "../../../shared/contracts";
const roles = [["customer_request", "고객 요청"], ["existing_quote", "기존 견적"], ["changed_quote", "변경 견적"], ["principle", "원칙"]] as const;
type Role = (typeof roles)[number][0];
const STATUS: Record<SalesStatus["status"], string> = {
  queued: "검토를 준비하고 있습니다.", processing: "원문을 검토하고 있습니다.",
  ready: "검토가 끝났습니다.", refused: "검토 근거를 확인하지 못했습니다.", failed: "검토를 끝내지 못했습니다.",
};

function errorCode(cause: unknown): string {
  if (!(cause instanceof Error)) return "";
  const detail = cause.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/u, "");
  return detail.split(":", 1)[0] ?? "";
}
function forbiddenNotice(code: string): string | null {
  if (code === "lead_only") return "팀장만 사용할 수 있습니다.";
  if (code === "consent_required") return "동의한 팀장만 사용할 수 있습니다.";
  if (code === "demo") return "로그인 없이 보는 부서에서는 사용할 수 없습니다.";
  return null;
}
export function WorkSalesReview({ onNotice, onSeen }: {
  onNotice: (text: string) => void;
  onSeen: (id: string, stillCurrent?: () => boolean) => Promise<void>;
}) {
  const [sources, setSources] = useState<Awaited<ReturnType<typeof window.sasu.sales.sources>>["candidates"] | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState("");
  const [starting, setStarting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<SalesStatus["status"] | "">("");
  const [statusError, setStatusError] = useState("");
  const [checking, setChecking] = useState(false);
  const [selection, setSelection] = useState<Record<Role, string>>({ customer_request: "", existing_quote: "", changed_quote: "", principle: "" });
  const generation = useRef(0);
  const sourcesActive = useRef(true);
  const sourcesLocked = useRef(false);
  const startLocked = useRef(false);
  const statusLocked = useRef(false);
  const acceptedTask = useRef<string | null>(null);
  const attempt = useRef<{ selection: string; id: string } | null>(null);
  useEffect(() => {
    sourcesActive.current = true;
    return () => { sourcesActive.current = false; generation.current += 1; };
  }, []);
  const reportError = (cause: unknown): void => {
    const code = errorCode(cause);
    onNotice(forbiddenNotice(code) ?? message(cause));
  };
  // Design Ref: desktop-sales-flow U1/U8 — only the mounted view owns source responses.
  const loadSources = async (): Promise<void> => {
    if (sourcesLocked.current || startLocked.current || acceptedTask.current) return;
    sourcesLocked.current = true;
    // StrictMode's setup/cleanup/setup shares this pending read; a real unmount retires its instance.
    const current = (): boolean => sourcesActive.current;
    setSourcesLoading(true); setSourcesError(""); onNotice("");
    try {
      const result = await window.sasu.sales.sources();
      if (!current()) return;
      setSources(result.candidates);
    } catch (cause) {
      if (!current()) return;
      setSources(null); setSourcesError(forbiddenNotice(errorCode(cause)) ?? message(cause));
    } finally {
      if (current()) { sourcesLocked.current = false; setSourcesLoading(false); }
    }
  };
  useEffect(() => { void loadSources(); }, []);
  // Design Ref: desktop-sales-flow U5/U7/U8 — status/open share one flight in the current task generation.
  const checkStatus = async (open = false, manual = false): Promise<void> => {
    if (!taskId || statusLocked.current) return;
    statusLocked.current = true;
    const version = generation.current;
    const current = (): boolean => version === generation.current;
    setChecking(true); setStatusError("");
    if (open || manual) onNotice("");
    try {
      const next = await window.sasu.sales.status(taskId);
      if (!current()) return;
      setStatus(next.status);
      if (!open || next.status !== "ready") return;
      await window.sasu.app.openWeb(next.web_path);
      if (!current()) return;
      await onSeen(taskId, current);
      if (!current()) return;
    } catch (cause) {
      if (!current()) return;
      setStatus(""); setStatusError(forbiddenNotice(errorCode(cause)) ?? message(cause));
    } finally {
      if (current()) { statusLocked.current = false; setChecking(false); }
    }
  };
  useEffect(() => {
    if (!taskId || statusError || !["queued", "processing"].includes(status)) return;
    const timer = window.setInterval(() => void checkStatus(), 5_000);
    return () => window.clearInterval(timer);
  }, [taskId, status, statusError]);
  const newReview = (): void => {
    if (statusLocked.current || !["ready", "refused", "failed"].includes(status)) return;
    generation.current += 1;
    acceptedTask.current = null; attempt.current = null;
    sourcesLocked.current = false; startLocked.current = false; statusLocked.current = false;
    setTaskId(null); setStatus(""); setStatusError(""); setChecking(false); setStarting(false); onNotice("");
  };
  const changeSelection = (role: Role, id: string): void => {
    if (sourcesLocked.current || startLocked.current || acceptedTask.current || selection[role] === id) return;
    attempt.current = null;
    setSelection((old) => ({ ...old, [role]: id }));
  };
  const start = async (): Promise<void> => {
    if (sourcesLocked.current || startLocked.current || acceptedTask.current || !sources || sourcesError) return;
    const ids = roles.map(([role]) => selection[role]);
    const candidates = new Map(sources.map((candidate) => [candidate.item_id, candidate]));
    if (new Set(ids).size !== 4 || ids.some((id) => !candidates.has(id)) || !candidates.get(selection.principle)?.is_principles) {
      onNotice("서로 다른 현재 원문 4건을 골라 주세요."); return;
    }
    startLocked.current = true;
    const version = generation.current;
    const current = (): boolean => version === generation.current;
    const fingerprint = JSON.stringify(ids);
    if (!attempt.current || attempt.current.selection !== fingerprint) attempt.current = { selection: fingerprint, id: crypto.randomUUID() };
    setStarting(true); onNotice("");
    try {
      const started = await window.sasu.sales.start({ request_item_id: selection.customer_request, old_quote_item_id: selection.existing_quote, new_quote_item_id: selection.changed_quote, policy_item_id: selection.principle, request_id: attempt.current.id });
      if (!current()) return;
      acceptedTask.current = started.task_id;
      setTaskId(started.task_id); setStatus("queued");
    } catch (cause) {
      if (!current()) return;
      if (errorCode(cause) === "source_unavailable") { setSources(null); setSourcesError(message(cause)); setStatus(""); }
      else reportError(cause);
    } finally {
      if (current()) { startLocked.current = false; setStarting(false); }
    }
  };
  const frozen = sourcesLoading || starting || !!taskId;
  const missing = roles.some(([role]) => !sources?.some((source) => source.item_id === selection[role] && (role !== "principle" || source.is_principles)));
  return <section className="workSection" aria-labelledby="sales-review-title">
    <h2 id="sales-review-title">영업 원문 검토</h2><p>원문 네 건을 골라 검토를 시작합니다.</p>
    <button disabled={frozen} onClick={() => void loadSources()}>자료 다시 불러오기</button>
    {sourcesLoading ? <p role="status">자료를 불러오는 중입니다.</p> : sourcesError ? <p role="alert">{sourcesError}</p> : !sources?.length ? <p>선택할 원문이 없습니다.</p> : <>
      {roles.map(([role, label]) => <label key={role}>{label}<select aria-label={label} value={selection[role]} disabled={frozen} onChange={(event) => changeSelection(role, event.target.value)}><option value="">원문을 고르세요</option>{sources.filter((source) => role !== "principle" || source.is_principles).map((source) => <option key={source.item_id} value={source.item_id}>{source.title}</option>)}</select></label>)}
      <button disabled={frozen || missing} onClick={() => void start()}>검토 시작하기</button>
    </>}
    {starting ? <p role="status">검토를 시작하는 중입니다.</p> : null}
    {status ? <p role="status">{STATUS[status]}</p> : null}
    {checking ? <p role="status">검토 상태를 확인하는 중입니다.</p> : null}
    {statusError ? <><p role="alert">{statusError}</p><button disabled={checking} onClick={() => void checkStatus(false, true)}>상태 다시 확인</button></> : null}
    {taskId && status === "ready" ? <button className="linkButton" disabled={checking} onClick={() => void checkStatus(true)}>웹에서 결과 보기</button> : null}
    {["ready", "refused", "failed"].includes(status) ? <button disabled={checking} onClick={newReview}>새 검토</button> : null}
  </section>;
}
