"use client";

import { useEffect, useState } from "react";

type Candidate = { item_id: string; title: string; kind: string; quote: string; is_principles: boolean };
type Role = "request" | "old_quote" | "new_quote" | "policy";
type PreviewSource = Candidate & { href: string };
type Preview = { sources: Record<Role, PreviewSource> };

const ROLES: { id: Role; label: string }[] = [
  { id: "request", label: "고객 요청" },
  { id: "old_quote", label: "기존 견적" },
  { id: "new_quote", label: "변경 견적" },
  { id: "policy", label: "영업 원칙" },
];
const emptySelection: Record<Role, string> = { request: "", old_quote: "", new_quote: "", policy: "" };

export default function SalesReviewSources({ deptId }: { deptId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selection, setSelection] = useState<Record<Role, string>>(emptySelection);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/d/${encodeURIComponent(deptId)}/sales-review/sources`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as { candidates?: Candidate[]; error?: string };
        if (!response.ok || !body.candidates) throw new Error(body.error ?? "원문 목록을 불러오지 못했습니다.");
        setCandidates(body.candidates);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "원문 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint]);

  async function connect() {
    const ids = Object.values(selection);
    if (ids.some((id) => !id) || new Set(ids).size !== 4) {
      setError("서로 다른 원문 4건을 선택해 주세요.");
      setPreview(null);
      return;
    }
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ request_item_id: selection.request, old_quote_item_id: selection.old_quote,
          new_quote_item_id: selection.new_quote, policy_item_id: selection.policy }),
      });
      const body = (await response.json()) as Preview & { error?: string };
      if (!response.ok || !body.sources) throw new Error(body.error ?? "원문을 연결하지 못했습니다.");
      setPreview({ sources: body.sources });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원문을 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel grid gap-4 p-6" aria-labelledby="real-sales-sources-heading">
    <div className="grid gap-1">
      <p className="m-0 text-sm text-[var(--muted)]">실제 부서 기록 · 팀장 전용</p>
      <h2 className="m-0 text-2xl" id="real-sales-sources-heading">검토할 원문 연결</h2>
      <p className="m-0 text-sm leading-6 text-[var(--muted)]">현재 볼 수 있는 원문을 역할별로 고릅니다. 선택은 저장되지 않으며 금액·일정을 자동으로 해석하지 않습니다.</p>
    </div>
    {loading ? <p role="status">원문을 불러오는 중입니다.</p> : candidates.length === 0 ? <p>연결할 원문이 없습니다. <a className="underline" href={`/d/${encodeURIComponent(deptId)}/documents`}>부서 자료 보기</a></p> : <>
      {!candidates.some((candidate) => candidate.is_principles) ? <p className="m-0 text-sm" role="status">활성 원칙 문서의 원문이 없습니다. 부서 원칙 문서를 연결한 뒤 다시 열어 주세요.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {ROLES.map(({ id, label }) => <label className="grid gap-2 text-sm font-bold" key={id}>{label}
          <select className="min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={selection[id]}
            onChange={(event) => { setSelection((current) => ({ ...current, [id]: event.target.value })); setPreview(null); }}>
            <option value="">원문 선택</option>
            {candidates.filter((candidate) => id !== "policy" || candidate.is_principles).map((candidate) =>
              <option key={candidate.item_id} value={candidate.item_id}>{candidate.title} · {candidate.quote.slice(0, 45)}</option>)}
          </select>
        </label>)}
      </div>
      <button className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 font-bold text-[var(--accent)] disabled:opacity-50" disabled={busy}
        onClick={() => void connect()} type="button">{busy ? "확인 중…" : "원문 나란히 보기"}</button>
    </>}
    {error ? <p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-3" role="alert">{error}</p> : null}
    {preview ? <div className="grid gap-3 lg:grid-cols-2" aria-label="선택한 원문 대조">
      {ROLES.map(({ id, label }) => <article className="rounded-xl border border-black/10 bg-white p-4" key={id}>
        <h3 className="mt-0 text-base">{label} · {preview.sources[id].title}</h3>
        <blockquote className="m-0 whitespace-pre-wrap text-sm leading-6">{preview.sources[id].quote}</blockquote>
        <a className="mt-3 inline-block text-sm font-bold text-[var(--accent)] underline" href={preview.sources[id].href}>원문 열기</a>
      </article>)}
    </div> : null}
  </section>;
}
