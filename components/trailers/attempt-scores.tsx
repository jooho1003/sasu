"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { TrailerAttemptResult, type TrailerAttemptSubmission, type TrailerScenario } from "@/lib/contracts";
import { ASSESSMENT_FIXED_COPY, validateAttemptSubmissions, verifyTrailerScore } from "@/lib/trailer-assessment";
import { adminButton } from "@/components/admin/actions";
import { trailerPanel } from "./views";
export type AttemptScoreRow = { id: string; label: string; email?: string | null; createdAt: string; submissions: TrailerAttemptSubmission[]; result: TrailerAttemptResult | null; weightedScore: number | null; status: "scoring" | "scored" | "failed"; statusReason?: string | null };
function reasonQuote(reason: string, quote: string): ReactNode {
  const index = reason.indexOf(quote); return index < 0 ? null : <span>{reason.slice(0,index)}<mark className="bg-accent/15 text-ink">{quote}</mark>{reason.slice(index+quote.length)}</span>;
}
export function AttemptScores({ attempts, scenarios, mode, kind = "synthetic", rescoreBase }: { attempts: AttemptScoreRow[]; scenarios: TrailerScenario[]; mode: "scores" | "full"; kind?: "synthetic" | "candidate"; rescoreBase?: string }) {
  const [byScore, setByScore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function rescore(id: string) {
    if (busy || !rescoreBase) return;
    setBusy(id); setMessage("");
    try {
      const response = await fetch(rescoreBase + "/" + id + "/rescore", { method: "POST", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error();
      setMessage("재채점을 요청했습니다."); router.refresh();
    } catch { setMessage("재채점을 요청하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(null); }
  }
  const rows = [...attempts].sort((a,b) => kind === "synthetic" && byScore ? (b.weightedScore ?? -1) - (a.weightedScore ?? -1) || a.createdAt.localeCompare(b.createdAt) : a.createdAt.localeCompare(b.createdAt) || a.label.localeCompare(b.label));
  return <section className="grid gap-5" aria-label={kind === "candidate" ? "지원자 제출 점수표" : "합성 지원자 점수표"}><div className={trailerPanel}>{(kind === "candidate" ? ["실제 지원자의 제출입니다. 점수는 면접 질문을 준비하기 위한 참고 자료이며 합격 여부의 기준이 아닙니다."] : ASSESSMENT_FIXED_COPY).map((copy) => <p className="my-2 text-sm" key={copy}>{copy}</p>)}{kind === "synthetic" ? <button className={`${adminButton} mt-3`} type="button" aria-pressed={byScore} onClick={() => setByScore(!byScore)}>{byScore ? "제출순으로 보기" : "점수순으로 보기"}</button> : <button className={adminButton} type="button" onClick={() => router.refresh()}>제출 상태 새로고침</button>}</div>
    {!rows.length ? <p>아직 제출한 지원자가 없습니다.</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {rows.map((attempt) => {
      let submissions: TrailerAttemptSubmission[]; try { submissions = validateAttemptSubmissions(scenarios,attempt.submissions); } catch { return <p key={attempt.id}>표시할 수 없는 채점 결과</p>; }
      const parsed = TrailerAttemptResult.safeParse(attempt.result);
      const result = parsed.success ? parsed.data : null;
      if (attempt.status === "scored" && !result) return <p key={attempt.id}>표시할 수 없는 채점 결과</p>;
      if (result) {
        const verified = verifyTrailerScore({criteria:result.criteria.map(c=>({key:c.key,score:c.score,rationale:c.rationale,evidence:c.evidence})),interview_questions:result.interview_questions},{rubric:result.rubric_snapshot,scenarios,submissions});
        if (JSON.stringify(TrailerAttemptResult.parse(verified)) !== JSON.stringify(result)) return <p key={attempt.id}>표시할 수 없는 채점 결과</p>;
      }
      function evidenceText(scenarioId:string,kind:string,quote:string|null,seq:number|null,ref:string|null): ReactNode {
        const scenario=scenarios.find(s=>s.id===scenarioId),submission=submissions.find(s=>s.scenario_id===scenarioId); if(!scenario||!submission)return null;
        if(kind==="reason_quote"&&quote)return reasonQuote(submission.reason,quote);
        if(kind==="fact")return `선택한 사실: 「${scenario.facts.find(f=>f.id===ref)?.label ?? ""}」`;
        if(kind==="unchecked_fact")return `확인하지 않은 사실: 「${scenario.facts.find(f=>f.id===ref)?.label ?? ""}」`;
        if(kind==="unchecked_dialogue")return `확인하지 않은 대화: 「${scenario.dialogues.find(d=>d.id===ref)?.question ?? ""}」`;
        const event=submission.events.find(e=>e.seq===seq);if(!event)return null;
        if(event.kind==="open_fact")return `사실 「${scenario.facts.find(f=>f.id===event.ref)?.label ?? ""}」 확인`;
        if(event.kind==="ask_dialogue")return `대화 「${scenario.dialogues.find(d=>d.id===event.ref)?.question ?? ""}」 확인`;
        if(event.kind==="choose")return `선택 「${scenario.choices.find(c=>c.id===event.ref)?.label ?? ""}」`;
        return `사례 「${scenario.title}」 제출`;
      }
      return <article key={attempt.id} className={trailerPanel} data-attempt-label={attempt.label}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="m-0 text-xl">{attempt.label}</h3><span>{attempt.status==="scoring" ? "채점 중" : attempt.status==="failed" ? `채점하지 못했습니다${attempt.statusReason==="timeout"?" · 시간이 초과됐습니다":attempt.statusReason==="citation_invalid"?" · 확인할 근거가 없습니다":""}` : attempt.weightedScore===null ? "근거 없음" : `${attempt.weightedScore.toFixed(2)} / 5`}</span></div>
        {kind === "candidate" && attempt.email ? <p className="text-sm text-muted">{attempt.email}</p> : null}
        {kind === "candidate" && attempt.status === "failed" && rescoreBase ? <button className={adminButton} type="button" disabled={busy !== null} onClick={() => void rescore(attempt.id)}>다시 채점</button> : null}
        {result&&attempt.status==="scored" ? <details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-accent">상세 보기</summary><div className="mt-4 grid gap-4">{result.criteria.map(c=><section key={c.key} className="rounded-xl border border-ink/10 p-4"><h4 className="m-0">{c.label} · 가중치 {c.weight}</h4>{c.evidence_status==="no_evidence"?<p className="mb-0 text-sm text-muted">근거 없음 (0점 반영)</p>:<><p className="text-sm">{c.score} / 5 · {c.rationale}</p><ul className="grid gap-2 pl-5 text-sm">{c.evidence.map((e,i)=><li key={i}>{evidenceText(e.scenario_id,e.kind,e.quote,e.seq,e.fact_id)}</li>)}</ul></>}</section>)}{mode==="full"&&result.interview_questions.length ? <section aria-label="면접 확인 질문"><h4>면접 확인 질문</h4>{result.interview_questions.map((q,i)=><div key={i} className="mb-4 rounded-xl bg-ink/5 p-4"><p className="mt-0">{q.question}</p><ul className="mb-0 grid gap-2 pl-5 text-sm">{q.basis.map((b,j)=><li key={j}>{evidenceText(b.scenario_id,b.kind,b.quote,b.seq,b.ref)}</li>)}</ul></div>)}</section>:null}</div></details>:null}
      </article>;
    })}
  </section>;
}
