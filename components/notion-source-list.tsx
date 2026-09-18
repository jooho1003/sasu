"use client";

import { useCallback, useEffect, useState } from "react";

export type CollectedNotionSource = {
  id: string;
  root_id: string;
  external_id: string;
  title: string | null;
  visibility: "dept" | "leads_only";
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  parent_external_id: string | null;
  ingest_mode: "classify" | "reference";
};

export type CollectedNotionRoot = {
  id: string;
  top_title: string | null;
  state: string;
  visibility: "dept" | "leads_only";
  card_candidates: boolean;
};

type CollectionPayload = {
  role: "lead" | "member";
  sources: CollectedNotionSource[];
  roots: CollectedNotionRoot[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const ERROR_GUIDANCE: Record<string, string> = {
  notion_not_found: "공유되지 않았거나 삭제됨",
  notion_page_too_large: "문서가 너무 큼",
  notion_database_unsupported: "지원하지 않는 데이터베이스",
  notion_rate_limited: "호출 제한으로 지연 중",
};

function sourceState(source: CollectedNotionSource) {
  if (!source.active || source.last_error === "notion_excluded") {
    return { label: "제외됨", className: "bg-black/5 text-[var(--muted)]" };
  }
  if (source.last_error) {
    return { label: "확인 필요", className: "bg-[var(--urgent)]/10 text-[var(--urgent)]" };
  }
  if (source.last_synced_at) {
    return { label: "수집 완료", className: "bg-[var(--accent)]/10 text-[var(--accent)]" };
  }
  return { label: "수집 대기", className: "bg-black/5 text-[var(--ink)]" };
}

function formatKst(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Seoul",
      }).format(new Date(value))
    : "아직 수집되지 않음";
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  return body;
}

export function NotionSourceList({
  deptId,
  role,
  demo,
}: {
  deptId: string;
  role: "lead" | "member";
  demo?: { sources: CollectedNotionSource[]; roots: CollectedNotionRoot[] };
}) {
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<CollectionPayload | null>(() =>
    demo
      ? {
          role,
          sources: demo.sources,
          roots: demo.roots,
          page: 1,
          page_size: 200,
          total: demo.sources.length,
          total_pages: 1,
        }
      : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [subtreeBySource, setSubtreeBySource] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/d/${encodeURIComponent(deptId)}/settings/notion?page=${page}`,
        { cache: "no-store", signal: AbortSignal.timeout(20_000) },
      );
      setPayload(await readJson<CollectionPayload>(response));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "자동 수집 문서를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [demo, deptId, page]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function mutate(
    id: string,
    body: Record<string, unknown>,
    success: string,
    demoUpdate: (current: CollectionPayload) => CollectionPayload,
  ) {
    setBusyId(id);
    setMessage("");
    try {
      if (demo) {
        setPayload((current) => (current ? demoUpdate(current) : current));
      } else {
        await readJson(
          await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/notion`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        await load();
      }
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "설정을 변경하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function reimport(source: CollectedNotionSource) {
    setBusyId(source.id);
    setMessage("");
    try {
      if (demo) {
        setPayload((current) => current ? {
          ...current,
          sources: current.sources.map((item) => item.id === source.id
            ? { ...item, active: true, last_error: null, last_synced_at: new Date().toISOString() }
            : item),
        } : current);
      } else {
        await readJson(
          await fetch(`/api/d/${encodeURIComponent(deptId)}/settings/notion`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source_id: source.id }),
          }),
        );
        await load();
      }
      setMessage("다시 가져오기를 시작했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "다시 가져오기를 시작하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const sources = payload?.sources ?? [];
  return (
    <details className="settings-panel panel" open>
      <summary className="cursor-pointer text-lg font-bold">
        자동 수집된 문서 {payload ? `${payload.total}개` : ""}
      </summary>
      <p className="m-0 text-sm text-[var(--muted)]">
        자동 발견된 Notion 문서를 200개씩 표시합니다. 제외한 문서는 다시 발견되어도 복구되지 않습니다.
      </p>
      {role === "lead" && payload?.roots.length ? (
        <div className="grid gap-3" aria-label="Notion 수집 범위별 카드 후보 설정">
          {payload.roots.map((root) => (
            <div className="rounded-xl border border-black/10 p-4" key={root.id}>
              <label className="flex items-start gap-3 text-sm font-bold">
                <input
                  checked={root.card_candidates}
                  disabled={busyId === root.id}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    void mutate(
                      root.id,
                      { action: "card_candidates", root_id: root.id, enabled },
                      enabled ? "이 수집 범위를 카드 후보로도 사용합니다." : "이 수집 범위는 검색 근거로만 사용합니다.",
                      (current) => ({
                        ...current,
                        roots: current.roots.map((item) => item.id === root.id ? { ...item, card_candidates: enabled } : item),
                        sources: current.sources.map((item) => item.root_id === root.id ? { ...item, ingest_mode: enabled ? "classify" : "reference" } : item),
                      }),
                    );
                  }}
                  type="checkbox"
                />
                <span>{root.top_title ?? "Notion 수집 범위"} · 카드 후보로도 사용</span>
              </label>
              {root.card_candidates ? (
                <p className="mb-0 mt-2 text-sm text-[var(--urgent)]" role="alert">
                  과거 문서에서 결정 카드가 만들어질 수 있습니다.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {loading ? <p role="status">자동 수집 문서를 불러오는 중…</p> : null}
      {!loading && sources.length === 0 ? (
        <p className="m-0 text-sm text-[var(--muted)]">자동 수집된 문서가 없습니다.</p>
      ) : null}
      <div className="grid gap-3">
        {sources.map((source) => {
          const state = sourceState(source);
          const title = source.title ?? "제목 없는 Notion 문서";
          const errorCode = source.last_error === "notion_excluded" ? null : source.last_error;
          const error = errorCode ? ERROR_GUIDANCE[errorCode] : null;
          return (
            <article
              aria-label={`${title} 자동 수집 문서`}
              className="grid gap-3 rounded-2xl border border-black/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={source.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="break-words">{title}</strong>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${state.className}`}>{state.label}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {source.visibility === "leads_only" ? "부서장만" : "부서 전체"}
                  </span>
                </div>
                <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                  마지막 수집: {formatKst(source.last_synced_at)}
                </p>
                {errorCode ? (
                  <p className="mb-0 mt-1 text-sm text-[var(--urgent)]">
                    {error ?? "가져오기에 실패했습니다."} · 오류 코드 {errorCode}
                  </p>
                ) : null}
              </div>
              {role === "lead" ? (
                <div className="grid gap-2 sm:min-w-44">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={subtreeBySource[source.id] === true}
                      disabled={!source.active || busyId === source.id}
                      onChange={(event) => setSubtreeBySource((current) => ({ ...current, [source.id]: event.target.checked }))}
                      type="checkbox"
                    />
                    하위 문서도 제외
                  </label>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      className="button button-small"
                      disabled={!source.active || busyId === source.id}
                      onClick={() => void mutate(
                        source.id,
                        { action: "exclude", source_id: source.id, subtree: subtreeBySource[source.id] === true },
                        subtreeBySource[source.id] ? "이 문서와 하위 문서를 제외했습니다." : "이 문서를 제외했습니다.",
                        (current) => ({
                          ...current,
                          sources: current.sources.map((item) => item.id === source.id || (subtreeBySource[source.id] && item.parent_external_id === source.external_id)
                            ? { ...item, active: false, last_error: "notion_excluded" }
                            : item),
                        }),
                      )}
                      type="button"
                    >
                      제외
                    </button>
                    <button
                      className="button button-small"
                      disabled={!source.active || source.visibility === "leads_only" || busyId === source.id}
                      onClick={() => void mutate(
                        source.id,
                        { action: "restrict", source_id: source.id },
                        "공개 범위를 부서장만으로 좁혔습니다.",
                        (current) => ({
                          ...current,
                          sources: current.sources.map((item) => item.id === source.id ? { ...item, visibility: "leads_only" } : item),
                        }),
                      )}
                      type="button"
                    >
                      부서장만으로
                    </button>
                    <button
                      className="button button-small"
                      disabled={!source.active || busyId === source.id}
                      onClick={() => void reimport(source)}
                      type="button"
                    >
                      다시 가져오기
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {payload && payload.total_pages > 1 ? (
        <nav aria-label="자동 수집 문서 페이지" className="flex items-center justify-between gap-3">
          <button className="button button-small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">이전 200개</button>
          <span className="text-sm">{page} / {payload.total_pages} 페이지</span>
          <button className="button button-small" disabled={page >= payload.total_pages} onClick={() => setPage((current) => current + 1)} type="button">다음 200개</button>
        </nav>
      ) : null}
      {message ? <p className="m-0 text-sm" role="status">{message}</p> : null}
      {!demo && message && !loading && !payload ? (
        <button className="button button-small w-fit" onClick={() => void load()} type="button">다시 시도</button>
      ) : null}
    </details>
  );
}
