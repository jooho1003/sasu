import { useEffect, useState } from "react";
import { message } from "../App";
const roles = [["customer_request", "고객 요청"], ["existing_quote", "기존 견적"], ["changed_quote", "변경 견적"], ["principle", "원칙"]] as const;
type Role = (typeof roles)[number][0];

function errorCode(cause: unknown): string {
  if (!(cause instanceof Error)) return "";
  return cause.message.split(":", 1)[0] ?? "";
}

function forbiddenNotice(code: string): string | null {
  if (code === "lead_only") return "팀장만 사용할 수 있습니다.";
  if (code === "consent_required") return "동의한 팀장만 사용할 수 있습니다.";
  if (code === "demo") return "로그인 없이 보는 부서에서는 사용할 수 없습니다.";
  return null;
}

export function WorkSalesReview({ onNotice }: { onNotice: (text: string) => void }) {
  const [sources, setSources] = useState<Awaited<ReturnType<typeof window.sasu.sales.sources>>["candidates"] | null>(null);
  const [hidden, setHidden] = useState(false); const [taskId, setTaskId] = useState<string | null>(null); const [status, setStatus] = useState("");
  const [selection, setSelection] = useState<Record<Role, string>>({ customer_request: "", existing_quote: "", changed_quote: "", principle: "" });
  const reportError = (cause: unknown): void => {
    const code = errorCode(cause);
    if (code === "not_found" || code === "source_unavailable") {
      setHidden(true);
      return;
    }
    onNotice(forbiddenNotice(code) ?? message(cause));
  };
  useEffect(() => {
    void window.sasu.sales.sources()
      .then((result) => setSources(result.candidates))
      .catch(reportError);
  }, [onNotice]);
  useEffect(() => { if (!taskId || !["queued", "processing"].includes(status)) return; const timer = window.setInterval(() => void window.sasu.sales.status(taskId).then((next) => setStatus(next.status)).catch(reportError), 5_000); return () => window.clearInterval(timer); }, [taskId, status, onNotice]);
  if (hidden) return null;
  const start = async (): Promise<void> => { const ids = Object.values(selection); if (ids.some((id) => !id) || new Set(ids).size !== 4) { onNotice("서로 다른 원문 4건을 골라 주세요."); return; } try { const started = await window.sasu.sales.start({ request_item_id: selection.customer_request, old_quote_item_id: selection.existing_quote, new_quote_item_id: selection.changed_quote, policy_item_id: selection.principle, request_id: crypto.randomUUID() }); setTaskId(started.task_id); setStatus("queued"); } catch (cause) { reportError(cause); } };
  return <section className="workSection" aria-labelledby="sales-review-title"><h2 id="sales-review-title">영업 원문 검토</h2><p>원문 네 건을 골라 웹에서 검토를 시작합니다.</p>{roles.map(([role, label]) => <label key={role}>{label}<select aria-label={label} value={selection[role]} onChange={(e) => setSelection((old) => ({ ...old, [role]: e.target.value }))}><option value="">원문을 고르세요</option>{(sources ?? []).filter((source) => role !== "principle" || source.is_principles).map((source) => <option key={source.item_id} value={source.item_id}>{source.title}</option>)}</select></label>)}<button disabled={!sources || Object.values(selection).some((id) => !id)} onClick={() => void start()}>검토 시작하기</button>{status ? <p role="status">{status === "ready" ? "검토가 끝났습니다." : status === "failed" ? "검토를 끝내지 못했습니다." : "검토를 준비하고 있습니다."}</p> : null}{taskId && status === "ready" ? <button className="linkButton" onClick={() => void window.sasu.sales.status(taskId).then((next) => window.sasu.app.openWeb(next.web_path))}>웹에서 결과 보기</button> : null}</section>;
}
