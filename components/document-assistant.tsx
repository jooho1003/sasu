"use client";

import Link from "next/link";
import { labelFrom } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

type SummaryItem = { item_id: string; text: string };
type Citation = {
  item_id: string | null;
  decision_id: string | null;
  quote: string;
};
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
type UploadState = {
  kind: "idle" | "pending" | "success" | "error";
  message?: string;
};
const SECTION_LABELS: Array<
  [
    keyof Pick<
      DocumentSummary,
      "key_points" | "decisions" | "actions" | "open_questions"
    >,
    string,
  ]
> = [
  ["key_points", "핵심 내용"],
  ["decisions", "결정·정책"],
  ["actions", "다음 할 일"],
  ["open_questions", "확인이 필요한 질문"],
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "업로드 시각 미상"
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(date);
}
function statusLabel(document: Document): string { return labelFrom("documentStatus",document.status); }
function statusClass(document: Document): string {
  return document.status === "summarized"
    ? "badge-green"
    : document.status === "summary_failed"
      ? "badge-urgent"
      : "badge-neutral";
}

export default function DocumentAssistant({
  deptId,
  role,
}: {
  deptId: string;
  role: "lead" | "member";
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPanel = useRef<HTMLDetailsElement>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/d/${encodeURIComponent(deptId)}/documents`,
          {
            cache: "no-store",
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
              : AbortSignal.timeout(15_000),
          },
        );
        const body = (await response.json()) as { documents?: Document[] };
        if (!response.ok || !body.documents) throw new Error("load_failed");
        if (signal?.aborted) return;
        setDocuments(body.documents);
        setLoadError(null);
      } catch {
        if (!signal?.aborted)
          setLoadError(
            "문서 목록을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [deptId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const hasProcessing = documents.some(
    (document) => document.status === "processing",
  );
  // Only pending documents need refreshing. A new result array must not trigger a new initial fetch.
  useEffect(() => {
    if (!hasProcessing || loadError) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (controller.signal.aborted) return;
      if (document.visibilityState === "visible") await load(controller.signal);
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 4_000);
    };
    timer = setTimeout(() => void poll(), 4_000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasProcessing, loadError, load]);

  const openUpload = () => {
    setUploadOpen(true);
    requestAnimationFrame(() => {
      uploadPanel.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      fileInput.current?.focus({ preventScroll: true });
    });
  };

  const upload = async () => {
    if (!file || uploadState.kind === "pending") return;
    setUploadState({ kind: "pending", message: "문서를 업로드하고 있습니다." });
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim() || file.name);
    form.set("visibility", visibility);
    try {
      const response = await fetch(
        `/api/d/${encodeURIComponent(deptId)}/documents`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60_000) },
      );
      const body = (await response.json()) as { error?: string; review_id?: string };
      if (!response.ok)
        throw new Error(body.error ?? "문서를 업로드하지 못했습니다.");
      if (body.review_id) {
        router.push(`/d/${deptId}/reviews/${body.review_id}`);
        return;
      }
      setUploadState({
        kind: "success",
        message:
          "문서를 저장했습니다. 정리가 끝나면 아래 목록에서 확인할 수 있습니다.",
      });
      setFile(null);
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      setQuery("");
      setSelectedId(null);
      await load();
    } catch (error) {
      setUploadState({
        kind: "error",
        message:
          error instanceof Error && error.name !== "TimeoutError"
            ? error.message
            : "업로드 결과를 확인하지 못했습니다. 문서 목록을 새로고침한 뒤 확인해 주세요.",
      });
    }
  };

  const visibleDocuments = documents.filter((document) =>
    (document.title ?? "이름 없는 문서")
      .toLocaleLowerCase("ko-KR")
      .includes(query.trim().toLocaleLowerCase("ko-KR")),
  );
  const selected =
    visibleDocuments.find((document) => document.id === selectedId) ??
    visibleDocuments[0];

  return (
    <main className="workspace-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">문서 정리</p>
          <h1>문서에서 업무를 꺼내세요</h1>
          <p>긴 문서의 핵심과 다음 할 일. 원문 근거까지 한곳에서 확인하세요.</p>
        </div>
        {role === "lead" ? (
          <button
            className="button button-primary button-small"
            onClick={openUpload}
            type="button"
          >
            <Icon name="file" size={17} />
            문서 추가
          </button>
        ) : null}
      </header>

      {role === "lead" ? (
        <details
          ref={uploadPanel}
          className="panel upload-panel"
          open={uploadOpen}
          onToggle={(event) => setUploadOpen(event.currentTarget.open)}
        >
          <summary>
            <span className="surface-icon">
              <Icon name="file" />
            </span>
            <span>
              <strong>새 문서 정리하기</strong>
              <small>
                읽힌 전문을 먼저 확인·수정한 뒤 확정하면 업무를 정리합니다.
              </small>
            </span>
            <Icon className="details-chevron" name="chevron" size={18} />
          </summary>
          <form
            className="upload-form"
            onSubmit={(event) => {
              event.preventDefault();
              void upload();
            }}
          >
            <fieldset disabled={uploadState.kind === "pending"}>
              <label className="file-dropzone">
                <Icon name="file" size={28} />
                <strong>{file ? file.name : "정리할 파일을 선택하세요"}</strong>
                <span>.txt 파일 · .md 파일 · .csv 파일 · .json 파일 · .pdf 파일 · .docx 파일 / 최대 20메가바이트</span>
                <input
                  ref={fileInput}
                  aria-label="문서 파일"
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx"
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    if (
                      next &&
                      (next.size > 20 * 1024 * 1024 ||
                        !/\.(txt|md|markdown|csv|json|pdf|docx)$/iu.test(
                          next.name,
                        ))
                    ) {
                      setFile(null);
                      event.target.value = "";
                      setUploadState({
                        kind: "error",
                        message:
                          "지원하는 형식의 20메가바이트 이하 파일을 선택해 주세요.",
                      });
                    } else {
                      setFile(next);
                      setUploadState({ kind: "idle" });
                    }
                  }}
                />
              </label>
              <div className="form-grid">
                <label className="field-label">
                  표시 이름 <span className="field-hint">선택 사항</span>
                  <input
                    className="field-input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="비워두면 파일 이름을 씁니다"
                  />
                </label>
                <label className="field-label">
                  볼 수 있는 사람
                  <select
                    className="field-input"
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(event.target.value as "dept" | "leads_only")
                    }
                  >
                    <option value="dept">부서 전체</option>
                    <option value="leads_only">팀장만</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <div className="upload-footer">
              <p>
                <Icon name="lock" size={14} />
                원본은 비공개로 보관합니다. 읽힌 텍스트는 개인정보를 가린 뒤 검토하며, 확인·확정한 내용만 업무에 사용합니다.
              </p>
              <button
                className="button button-primary button-small"
                disabled={!file || uploadState.kind === "pending"}
                type="submit"
              >
                {uploadState.kind === "pending"
                  ? "업로드 중…"
                  : "문서 정리 시작"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
            {uploadState.message ? (
              <p
                className={`inline-feedback ${uploadState.kind === "error" ? "feedback-error" : ""}`}
                role={uploadState.kind === "error" ? "alert" : "status"}
              >
                {uploadState.message}
              </p>
            ) : null}
          </form>
        </details>
      ) : null}

      <section
        className="document-library"
        aria-label="문서 보관함"
        aria-busy={loading}
      >
        <header className="section-heading">
          <div>
            <h2>
              문서 보관함{" "}
              {!loading ? (
                <span className="count-label">{documents.length}</span>
              ) : null}
            </h2>
            <p>내 권한으로 볼 수 있는 문서</p>
          </div>
          <button
            className="button button-secondary button-small"
            disabled={loading}
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </header>
        {loadError ? (
          <div className="inline-feedback feedback-error" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              className="text-link"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              다시 불러오기
            </button>
          </div>
        ) : null}
        {loading && documents.length === 0 ? (
          <div className="panel empty-state" role="status">
            <Icon name="file" size={28} />
            <h3>문서를 불러오고 있습니다</h3>
            <p>내 부서의 문서를 확인하고 있습니다.</p>
          </div>
        ) : !loadError && documents.length === 0 ? (
          <div className="panel empty-state">
            <span className="surface-icon">
              <Icon name="file" size={26} />
            </span>
            <h3>우리 부서의 지식을 모아보세요</h3>
            <p>
              {role === "lead"
                ? "정책서나 기획안을 올리면, 다음 결정에 쓸 수 있는 근거가 됩니다."
                : "팀장이 문서를 추가하면 이곳에서 요약과 근거를 확인할 수 있습니다."}
            </p>
            {role === "lead" ? (
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={openUpload}
              >
                첫 문서 추가
              </button>
            ) : null}
          </div>
        ) : null}
        {documents.length > 0 ? (
          <div className="document-workspace">
            <aside className="document-index panel">
              <label className="document-search">
                <span className="sr-only">문서 이름 검색</span>
                <input
                  className="field-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="문서 이름으로 찾기"
                />
              </label>
              <div
                className="document-options"
                role="group"
                aria-label="문서 선택"
              >
                {visibleDocuments.map((document) => (
                  <button
                    className="document-option"
                    key={document.id}
                    type="button"
                    aria-pressed={selected?.id === document.id}
                    aria-controls="document-detail"
                    onClick={() => setSelectedId(document.id)}
                  >
                    <span className="document-option-title">
                      <Icon name="file" size={18} />
                      <strong>{document.title ?? "이름 없는 문서"}</strong>
                    </span>
                    <span className="document-option-meta">
                      <span className={`badge ${statusClass(document)}`}>
                        {statusLabel(document)}
                      </span>
                      <span>
                        {document.visibility === "leads_only"
                          ? "팀장만"
                          : "부서 전체"}
                      </span>
                    </span>
                  </button>
                ))}
                {visibleDocuments.length === 0 ? (
                  <p className="m-0 p-5 text-sm text-muted" role="status">
                    검색한 이름의 문서가 없습니다.
                  </p>
                ) : null}
              </div>
            </aside>
            <div id="document-detail" className="min-w-0">
              {selected ? (
                <DocumentDetail
                  document={selected}
                  deptId={deptId}
                  role={role}
                />
              ) : (
                <div className="panel empty-state">
                  <Icon name="file" size={28} />
                  <h3>다른 이름으로 찾아보세요</h3>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => setQuery("")}
                  >
                    검색 초기화
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function DocumentDetail({
  document,
  deptId,
  role,
}: {
  document: Document;
  deptId: string;
  role: "lead" | "member";
}) {
  const summary = document.summary;
  const hasEvidence = Boolean(summary && summary.citations.length > 0);
  return (
    <article className="panel document-detail">
      <header>
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${statusClass(document)}`}>
            {statusLabel(document)}
          </span>
          <span className="badge badge-neutral">
            <Icon name="lock" size={12} />
            {document.visibility === "leads_only" ? "팀장만" : "부서 전체"}
          </span>
        </div>
        <h3>{document.title ?? "이름 없는 문서"}</h3>
        <p className="document-date">
          {formatDate(document.created_at)} · 근거 {document.chunk_count}개
        </p>
      </header>
      {document.status === "processing" ? (
        <div className="empty-state" role="status">
          <span className="surface-icon">
            <Icon name="spark" size={25} />
          </span>
          <h4>핵심과 근거를 정리하고 있습니다</h4>
          <p>정리가 끝나면 자동으로 표시됩니다. 다른 문서를 읽어도 됩니다.</p>
        </div>
      ) : null}
      {document.status === "summary_failed" ? (
        <div className="inline-feedback feedback-error" role="status">
          문서 정리를 완료하지 못했습니다.{" "}
          {role === "lead"
            ? "원문을 확인한 뒤 다시 업로드해 주세요."
            : "팀장에게 문서 확인을 요청해 주세요."}
        </div>
      ) : null}
      {document.status === "summarized" && !hasEvidence ? (
        <div className="inline-feedback" role="status">
          확인 가능한 원문 근거가 없어 요약을 표시할 수 없습니다.
        </div>
      ) : null}
      {document.status === "summarized" && hasEvidence && summary ? (
        <>
          <section className="document-overview">
            <p className="eyebrow">한눈에 보기</p>
            <p>{summary.overview}</p>
          </section>
          {SECTION_LABELS.map(([key, label]) =>
            summary[key].length > 0 ? (
              <section className="summary-section" key={key}>
                <h4>{label}</h4>
                <ul>
                  {summary[key].map((item) => (
                    <li key={`${item.item_id}-${item.text}`}>{item.text}</li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          <section className="summary-section">
            <h4>
              원문 근거{" "}
              <span className="count-label">{summary.citations.length}</span>
            </h4>
            <div className="document-citations">
              {summary.citations.map((citation) => (
                <Link
                  key={`${citation.item_id}-${citation.decision_id}-${citation.quote}`}
                  href={
                    citation.decision_id
                      ? `/d/${deptId}/ledger#decision-${citation.decision_id}`
                      : `/d/${deptId}?item=${citation.item_id ?? ""}#item-${citation.item_id ?? ""}`
                  }
                >
                  <q>{citation.quote}</q>
                  <span>
                    원문 확인 <Icon name="arrow" size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <footer className="document-actions">
            <Link
              className="button button-primary button-small"
              href={`/d/${deptId}/ask`}
            >
              사수에게 묻기 <Icon name="arrow" size={15} />
            </Link>
            {role === "lead" ? (
              <Link
                className="button button-secondary button-small"
                href={`/d/${deptId}/roles`}
              >
                역할 적용하기
              </Link>
            ) : null}
          </footer>
        </>
      ) : null}
    </article>
  );
}
