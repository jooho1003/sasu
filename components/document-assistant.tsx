"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SummaryItem = { item_id: string; text: string };
type Citation = { item_id: string | null; decision_id: string | null; quote: string };
type DocumentSummary = {
  citations: Citation[];
  overview: string;
  key_points: SummaryItem[];
  decisions: SummaryItem[];
  actions: SummaryItem[];
  open_questions: SummaryItem[];
};

type Document = {
  id: string;
  title: string | null;
  visibility: "dept" | "leads_only";
  status: "processing" | "summarized" | "summary_failed";
  status_reason: string | null;
  summary: DocumentSummary | null;
  extracted_chars: number;
  chunk_count: number;
  created_at: string;
};

type UploadState = { kind: "idle" | "pending" | "success" | "error"; message?: string };

const SECTION_LABELS: Array<[keyof Pick<DocumentSummary, "key_points" | "decisions" | "actions" | "open_questions">, string]> = [
  ["key_points", "핵심 포인트"],
  ["decisions", "결정·정책"],
  ["actions", "다음 액션"],
  ["open_questions", "열린 질문"],
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "업로드 시각 미상" : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(document: Document): string {
  if (document.status === "processing") return "정리 중";
  if (document.status === "summary_failed") return "정리 실패";
  return "정리 완료";
}

export default function DocumentAssistant({ deptId, role }: { deptId: string; role: "lead" | "member" }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/documents`, { cache: "no-store" });
    const body = (await response.json()) as { documents?: Document[]; error?: string };
    if (!response.ok || !body.documents) throw new Error(body.error ?? "문서 목록을 불러오지 못했습니다.");
    setDocuments(body.documents);
    setLoadError(null);
  }, [deptId]);

  useEffect(() => {
    let cancelled = false;
    const initial = async () => {
      try {
        if (!cancelled) await load();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "문서 목록을 불러오지 못했습니다.");
      }
    };
    void initial();
    const timer = setInterval(() => {
      if (!cancelled && documents.some((document) => document.status === "processing")) void load().catch(() => undefined);
    }, 4_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [deptId, documents, load]);

  const upload = async () => {
    if (!file) {
      setUploadState({ kind: "error", message: "문서 파일을 선택해주세요." });
      return;
    }
    setUploadState({ kind: "pending", message: "문서를 읽고 정리 작업을 시작하는 중입니다." });
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim() || file.name);
    form.set("visibility", visibility);
    try {
      const response = await fetch(`/api/d/${encodeURIComponent(deptId)}/documents`, { method: "POST", body: form });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "문서를 업로드하지 못했습니다.");
      setUploadState({ kind: "success", message: "문서를 저장했습니다. 원문 근거를 확인하며 정리 중입니다." });
      setFile(null);
      setTitle("");
      await load();
    } catch (error) {
      setUploadState({ kind: "error", message: error instanceof Error ? error.message : "문서를 업로드하지 못했습니다." });
    }
  };

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-7 px-5 py-10 text-left sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수 · 문서 어시스턴트</p>
          <h1 className="m-0 text-4xl">문서에서 업무를 꺼내세요</h1>
          <p className="m-0 text-[var(--muted)]">문서 속 정책·결정·액션을 부서 권한 안에서 정리하고, 인용 가능한 근거로 묻기에 연결합니다.</p>
        </div>
        <nav className="flex gap-4 text-sm"><Link href={`/d/${deptId}`}>대시보드</Link><Link href={`/d/${deptId}/ask`}>묻기</Link><Link href={`/d/${deptId}/ledger`}>원장</Link></nav>
      </header>

      {role === "lead" ? (
        <section className="grid gap-4 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
          <div><h2 className="m-0 text-2xl">문서 업로드</h2><p className="mb-0 mt-2 text-sm text-[var(--muted)]">TXT · MD · CSV · JSON · PDF · DOCX, 최대 20MB. 원본 파일은 저장하지 않고 텍스트를 마스킹한 뒤 근거 chunk만 보관합니다.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">표시 이름<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="영업 정책 v2" /></label>
            <label className="grid gap-2 text-sm font-bold">공개 범위<select className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" value={visibility} onChange={(event) => setVisibility(event.target.value as "dept" | "leads_only")}><option value="dept">부서 전체</option><option value="leads_only">팀장만</option></select></label>
            <label className="grid gap-2 text-sm font-bold sm:col-span-2">파일<input className="rounded-lg border border-black/15 bg-white px-3 py-2 font-normal" accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>
          </div>
          <button className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={uploadState.kind === "pending"} onClick={() => void upload()} type="button">{uploadState.kind === "pending" ? "업로드 중…" : "문서 정리 시작"}</button>
          {uploadState.message ? <p className="m-0 text-sm text-[var(--muted)]" role="status">{uploadState.message}</p> : null}
        </section>
      ) : null}

      <section className="grid gap-4">
        <div><p className="m-0 text-sm text-[var(--muted)]">근거 기반 업무 정리</p><h2 className="m-0 text-2xl">내 권한으로 볼 수 있는 문서</h2></div>
        {loadError ? <div className="rounded-2xl bg-[var(--surface)] p-5"><p className="m-0">{loadError}</p></div> : null}
        {!loadError && documents.length === 0 ? <div className="rounded-2xl bg-[var(--surface)] p-8 text-[var(--muted)]">아직 업로드된 문서가 없습니다.</div> : null}
        <div className="grid gap-4">
          {documents.map((document) => {
            const summary = document.summary;
            const hasEvidence = Boolean(summary && summary.citations.length > 0);
            return <article key={document.id} className="grid gap-5 rounded-3xl bg-[var(--surface)] p-6 shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="m-0 text-xl">{document.title ?? "이름 없는 문서"}</h3><p className="mb-0 mt-1 text-sm text-[var(--muted)]">{formatDate(document.created_at)} · {document.chunk_count}개 근거 chunk · {document.visibility === "leads_only" ? "팀장만" : "부서 전체"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${document.status === "summarized" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-black/5 text-[var(--muted)]"}`}>{statusLabel(document)}</span></header>
              {document.status === "processing" ? <p className="m-0 rounded-xl bg-black/5 p-4 text-sm text-[var(--muted)]">텍스트를 읽고 인용 가능한 업무 단위로 정리하고 있습니다. 이 화면은 자동으로 갱신됩니다.</p> : null}
              {document.status === "summary_failed" ? <p className="m-0 rounded-xl bg-[var(--urgent)]/10 p-4 text-sm">문서 정리를 완료하지 못했습니다. {document.status_reason ?? "잠시 후 다시 업로드해주세요."}</p> : null}
              {document.status === "summarized" && hasEvidence && summary ? <div className="grid gap-5"><section className="grid gap-2"><h4 className="m-0 text-lg">한눈에 보기</h4><p className="m-0 whitespace-pre-wrap leading-7">{summary.overview}</p></section>{SECTION_LABELS.map(([key, label]) => summary[key].length > 0 ? <section key={key} className="grid gap-2"><h4 className="m-0 text-lg">{label}</h4><ul className="m-0 grid gap-2 pl-5">{summary[key].map((item) => <li key={`${item.item_id}-${item.text}`}>{item.text}</li>)}</ul></section> : null)}<section className="grid gap-2"><h4 className="m-0 text-lg">원문 근거</h4>{summary.citations.map((citation) => <a key={`${citation.item_id}-${citation.quote}`} className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 no-underline" href={`/d/${deptId}#item-${citation.item_id ?? ""}`}><q className="leading-7">{citation.quote}</q></a>)}</section><Link className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent)]" href={`/d/${deptId}/ask`}>이 문서의 정책을 사수에게 묻기 →</Link></div> : null}
            </article>;
          })}
        </div>
      </section>
    </main>
  );
}
