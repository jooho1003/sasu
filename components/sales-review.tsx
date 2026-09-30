"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SalesReviewFocus, SalesReviewResult } from "@/lib/contracts";

type SourceId = "S1" | "S2" | "S3" | "S4";
type Task = {
  id: string;
  focus: SalesReviewFocus;
  status: "queued" | "processing" | "ready" | "failed";
  status_reason: string | null;
  result: SalesReviewResult | null;
  action: { action: "approve" | "reject"; created_at: string } | null;
  created_at: string;
};
type Line = SalesReviewResult["comparison"][number];

const FOCUS_LABELS: Record<SalesReviewFocus, string> = { all: "전체", price: "가격", schedule: "일정" };

function failureLabel(reason: string | null): string {
  if (reason === "llm_timeout" || reason === "timeout") return "처리 시간이 지나 검토를 완료하지 못했습니다. 새로 요청해 주세요.";
  if (reason === "citation_invalid") return "근거를 확인하지 못해 결과를 보여 주지 않습니다.";
  return "검토를 완료하지 못했습니다. 새로 요청해 주세요.";
}

function Lines({ title, lines }: { title: string; lines: Line[] }) {
  return <section className="grid gap-3 rounded-2xl border border-black/10 bg-white p-5">
    <h3 className="m-0 text-lg font-bold">{title}</h3>
    <ul className="m-0 grid list-none gap-4 p-0">
      {lines.map((line, index) => <li className="grid gap-2 border-t border-black/10 pt-3" key={`${title}-${index}`}>
        <p className="m-0 leading-7">{line.text}</p>
        <div className="flex flex-wrap gap-2">
          {line.citations.map((citation, citationIndex) => <a className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2 text-xs leading-5" href={`#sales-source-${citation.source_id}`} key={`${citation.source_id}-${citationIndex}`}><strong>{citation.source_id}</strong> <q>{citation.quote}</q></a>)}
        </div>
      </li>)}
    </ul>
  </section>;
}

export default function SalesReview({ deptId, role, consented, sources, titles }: {
  deptId: string;
  role: "member" | "lead";
  consented: boolean;
  sources: Record<SourceId, string>;
  titles: Record<SourceId, string>;
}) {
  const [focus, setFocus] = useState<SalesReviewFocus>("all");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/d/${encodeURIComponent(deptId)}/sales-review`;

  const load = useCallback(async (preferredId?: string) => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json()) as { tasks?: Task[]; error?: string };
    if (!response.ok || !body.tasks) throw new Error(body.error ?? "검토 목록을 불러오지 못했습니다.");
    setTasks(body.tasks);
    setSelectedId((current) => {
      if (preferredId && body.tasks?.some((task) => task.id === preferredId)) return preferredId;
      return current && body.tasks?.some((task) => task.id === current) ? current : body.tasks?.[0]?.id ?? null;
    });
    setLoading(false);
  }, [endpoint]);

  useEffect(() => {
    if (!consented) return;
    const timer = window.setTimeout(() => {
      void load().catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : "검토 목록을 불러오지 못했습니다."); setLoading(false); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [consented, load]);

  const pending = tasks.some((task) => task.status === "queued" || task.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 4_000);
    return () => window.clearInterval(timer);
  }, [load, pending]);

  const selected = useMemo(() => tasks.find((task) => task.id === selectedId) ?? null, [selectedId, tasks]);

  async function createTask() {
    setBusy("create"); setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ focus, request_id: crypto.randomUUID() }),
      });
      const body = (await response.json()) as { task_id?: string; error?: string };
      if (!response.ok || !body.task_id) throw new Error(body.error ?? "검토를 시작하지 못했습니다.");
      await load(body.task_id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "검토를 시작하지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function review(action: "approve" | "reject") {
    if (!selected) return;
    setBusy(action); setError(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(selected.id)}/review`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "팀장 검토를 기록하지 못했습니다.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "팀장 검토를 기록하지 못했습니다."); }
    finally { setBusy(null); }
  }

  return <main className="workspace-page grid gap-6">
    <header className="grid gap-2"><p className="m-0 text-sm font-bold text-[var(--accent)]">사수 · 영업 검토 연습</p><h1 className="m-0 text-3xl">견적 변경 검토</h1><p className="m-0 text-[var(--muted)]">고객 요청과 견적 초안의 차이를 근거와 함께 살펴봅니다.</p></header>
    <p className="m-0 rounded-xl border border-[var(--urgent)]/30 bg-[var(--urgent)]/10 p-4 font-bold">가상 사례입니다. 고객에게 발송되지 않으며 실제 가격·계약 승인이 아닙니다.</p>
    {!consented ? <p className="panel p-5">동의 후 이용할 수 있습니다.</p> : null}
    {error ? <p className="rounded-xl bg-[var(--urgent)]/10 p-4" role="alert">{error}</p> : null}
    <section className="panel grid gap-4 p-6"><div><p className="m-0 text-sm text-[var(--muted)]">가상 입력</p><h2 className="m-0 text-2xl">이번에 볼 자료</h2></div><div className="grid gap-3 lg:grid-cols-2">{(Object.keys(sources) as SourceId[]).map((id) => <article className="rounded-xl border border-black/10 bg-white p-4" id={`sales-source-${id}`} key={id}><h3 className="mt-0 text-base">{id} · {titles[id]}</h3><p className="m-0 whitespace-pre-wrap text-sm leading-6">{sources[id]}</p></article>)}</div></section>
    {consented ? <section className="panel grid gap-4 p-6"><div><p className="m-0 text-sm text-[var(--muted)]">새 검토</p><h2 className="m-0 text-2xl">어디를 먼저 볼까요?</h2></div><label className="grid max-w-xs gap-2 text-sm font-bold">검토 초점<select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" onChange={(event) => setFocus(event.target.value as SalesReviewFocus)} value={focus}><option value="all">전체</option><option value="price">가격</option><option value="schedule">일정</option></select></label><button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy !== null} onClick={() => void createTask()} type="button">{busy === "create" ? "요청 중…" : "가상 검토안 만들기"}</button><p className="m-0 text-sm text-[var(--muted)]">하루 10건까지 실행합니다. 결과는 이 부서 구성원만 볼 수 있습니다.</p></section> : null}
    <section className="panel grid gap-4 p-6"><div><p className="m-0 text-sm text-[var(--muted)]">작업 기록</p><h2 className="m-0 text-2xl">검토안</h2></div>{loading ? <p>불러오는 중…</p> : tasks.length === 0 ? <p className="m-0 text-[var(--muted)]">아직 검토한 작업이 없습니다.</p> : <div className="flex flex-wrap gap-2">{tasks.map((task) => <button aria-pressed={selectedId === task.id} className={`rounded-lg border px-3 py-2 text-sm ${selectedId === task.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-black/10"}`} key={task.id} onClick={() => setSelectedId(task.id)} type="button">{FOCUS_LABELS[task.focus]} · {new Date(task.created_at).toLocaleString("ko-KR")} · {task.status === "ready" ? "검토 준비" : task.status === "failed" ? "실패" : "진행 중"}</button>)}</div>}
      {selected?.status === "failed" ? <p role="status">{failureLabel(selected.status_reason)}</p> : null}
      {selected && (selected.status === "queued" || selected.status === "processing") ? <p role="status">검토안을 만드는 중입니다. 잠시 뒤 결과가 나타납니다.</p> : null}
      {selected?.status === "ready" && selected.result ? <div className="grid gap-4"><Lines title="변경 비교" lines={selected.result.comparison} /><Lines title="원칙과 승인" lines={selected.result.policy_flags} /><Lines title="확인 질문" lines={selected.result.questions} /><Lines title="고객 회신 초안 · 발송 안 됨" lines={selected.result.reply_draft} /><section className="rounded-2xl border border-black/10 bg-white p-5"><h3 className="mt-0 text-lg">팀장 내부 확인</h3>{selected.action ? <p className="m-0 font-bold">{selected.action.action === "approve" ? "내부 확인 완료" : "돌려보낸 작업"} · 실제 고객 발송/가격 승인이 아닙니다.</p> : role === "lead" ? <div className="flex flex-wrap gap-2"><button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy !== null} onClick={() => void review("approve")} type="button">내부 확인</button><button className="rounded-lg border px-4 py-2 font-bold disabled:opacity-50" disabled={busy !== null} onClick={() => void review("reject")} type="button">검토안 돌려보내기</button><p className="w-full text-sm text-[var(--muted)]">이 행동은 가상 결과의 내부 검토 기록만 남깁니다.</p></div> : <p className="m-0 text-[var(--muted)]">팀장 확인을 기다립니다.</p>}</section></div> : null}
    </section>
  </main>;
}
