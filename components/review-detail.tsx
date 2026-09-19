"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReviewedMaterial,
  ReviewPart,
  ReviewSection,
} from "@/lib/contracts";
import { audioPlan, encodeMonoWav } from "@/lib/adapters/review-audio";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Detail = ReviewedMaterial & { candidate_sections: ReviewSection[] | null };
type History = { revision: number; title: string; created_at: string };
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function ReviewDetail({ deptId, id }: { deptId: string; id: string }) {
  const router = useRouter();
  const endpoint = `/api/d/${deptId}/reviews/${id}`;
  const [review, setReview] = useState<Detail | null>(null);
  const [parts, setParts] = useState<ReviewPart[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<ReviewSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const loadSequence = useRef(0);
  const [editorRevision, setEditorRevision] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [originalExpiresAt, setOriginalExpiresAt] = useState<string | null>(null);
  const [originalExpired, setOriginalExpired] = useState(false);
  const [checked, setChecked] = useState(false);
  const [destructive, setDestructive] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const originalRef = useRef<string | null>(null);
  const processing =
    review !== null &&
    (["processing", "uploading"].includes(review.status) ||
      parts.some((part) => ["queued", "processing"].includes(part.status)));
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
    setChecked(false);
  };
  const load = useCallback(
    async (force = false) => {
      const sequence = ++loadSequence.current;
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      // A poll started before a completed action must not restore its old state.
      if (sequence !== loadSequence.current) return;
      if (!response.ok)
        throw new Error(body.error ?? "자료를 불러오지 못했습니다.");
      setReview(body.review);
      setParts(body.parts);
      setHistory(body.history);
      setDownloadAllowed(body.original_download_allowed === true);
      setOriginalExpiresAt(body.original_expires_at ?? null);
      setOriginalExpired(!!body.original_expires_at && new Date(body.original_expires_at).getTime() <= Date.now());
      if (body.review.original_deleted_at || (body.original_expires_at && new Date(body.original_expires_at).getTime() <= Date.now())) {
        if (originalRef.current) URL.revokeObjectURL(originalRef.current);
        originalRef.current = null;
        setOriginalUrl(null);
      }
      if (force || !dirtyRef.current) {
        setTitle(body.review.title);
        setSections(body.review.sections);
        setEditorRevision(body.review.revision);
        dirtyRef.current = false;
        setDirty(false);
        setChecked(false);
      }
    },
    [endpoint],
  );
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!processing) return;
    let disposed = false;
    // Schedule after completion: slow reads must not pile up or invalidate each other.
    let timer = setTimeout(poll, 3000);
    async function poll() {
      try {
        await load();
      } catch {
        if (!disposed)
          setError("처리 상태를 확인하지 못했습니다. 새로고침해 주세요.");
      } finally {
        if (!disposed) timer = setTimeout(poll, 3000);
      }
    }
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [processing, load]);
  useEffect(() => {
    if (!originalExpiresAt) return;
    // Clamp long deadlines to avoid the browser's signed 32-bit timeout overflow.
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = new Date(originalExpiresAt!).getTime() - Date.now();
      if (remaining > 0) { timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_000_000)); return; }
      setOriginalExpired(true);
      if (originalRef.current) URL.revokeObjectURL(originalRef.current);
      originalRef.current = null;
      setOriginalUrl(null);
    }
    timer = setTimeout(checkExpiry, 0);
    return () => clearTimeout(timer);
  }, [originalExpiresAt]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      if (originalRef.current) URL.revokeObjectURL(originalRef.current);
    };
  }, []);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (
        dirtyRef.current &&
        link &&
        !link.hasAttribute("download") &&
        !link.href.includes("?format=") &&
        !window.confirm(
          "저장하지 않은 수정이 있습니다. 저장하지 않고 이동할까요?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);
  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function command(action: string) {
    if (!review) return;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, revision: review.revision }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (action === "delete") {
      dirtyRef.current = false;
      router.push(`/d/${deptId}/reviews`);
      return;
    }
    if (action === "delete_original" && originalRef.current) {
      URL.revokeObjectURL(originalRef.current);
      originalRef.current = null;
      setOriginalUrl(null);
    }
    setChecked(false);
    setDestructive(null);
    // Original deletion/cancellation changes metadata, not the unsaved draft.
    // Keep editorRevision too, so a concurrent edit still produces a conflict.
    await load(action === "use_extraction");
    setMessage(
      action === "publish"
        ? "확인한 버전을 업무 자료로 확정했습니다. 요약과 검색 준비를 시작합니다."
        : action === "stop"
          ? "업무 활용을 중지했습니다. 이전 검색 근거는 제거됐습니다."
          : action === "delete_original"
            ? "원본 접근을 차단했습니다. 보관 파일 삭제를 처리합니다."
            : "변경사항을 반영했습니다.",
    );
  }
  async function save() {
    if (!review) return;
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: editorRevision,
        title,
        sections: sections.map((s) => ({ id: s.id, text: s.text })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    await load(true);
    setMessage("초안을 저장했습니다. 내용을 확인한 뒤 확정해 주세요.");
  }
  async function fetchOriginal(action: "play_original" | "download_original") {
    const response = await fetch(`${endpoint}/original?action=${action}`, { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json()).error ?? "원본을 불러오지 못했습니다.");
    return response.blob();
  }
  async function openOriginal() {
    if (!review) return;
    const file = await fetchOriginal(review.kind === "audio" ? "play_original" : "download_original");
    if (originalRef.current) URL.revokeObjectURL(originalRef.current);
    const url = URL.createObjectURL(file);
    originalRef.current = url;
    setOriginalUrl(url);
    return url;
  }
  async function retry() {
    if (!review) return;
    const storage =
      createBrowserSupabaseClient().storage.from("review-materials");
    if (review.kind === "audio") {
      const missing = parts.filter((p) => p.status === "waiting");
      if (missing.length) {
        const original = await fetchOriginal("play_original");
        const ctx = new AudioContext({ sampleRate: 16000 });
        try {
          const decoded = await ctx.decodeAudioData(
            await original.arrayBuffer(),
          );
          const mono = new Float32Array(decoded.length);
          for (let c = 0; c < decoded.numberOfChannels; c++) {
            const samples = decoded.getChannelData(c);
            for (let i = 0; i < mono.length; i++)
              mono[i] += samples[i] / decoded.numberOfChannels;
          }
          for (const part of audioPlan(decoded.duration).filter((p) =>
            missing.some((m) => m.part_index === p.index),
          )) {
            const bytes = encodeMonoWav(
              mono.slice(
                Math.floor(part.start * decoded.sampleRate),
                Math.min(mono.length, Math.ceil(part.end * decoded.sampleRate)),
              ),
              decoded.sampleRate,
            );
            const result = await storage.upload(
              `${deptId}/${id}/parts/${part.index}.wav`,
              new Blob([bytes], { type: "audio/wav" }),
              { contentType: "audio/wav" },
            );
            // INSERT-only immutable path: a prior upload may have completed before a disconnect.
            if (result.error && !["409", "Duplicate"].includes(String(result.error.statusCode)))
              throw new Error("구간 보관을 재개하지 못했습니다.");
          }
        } finally {
          await ctx.close();
        }
      }
    }
    for (const p of parts.filter(
      (p) => !["done", "processing", "queued"].includes(p.status),
    )) {
      const response = await fetch(`${endpoint}/parts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: p.part_index }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    }
    await load();
    setMessage("아직 끝나지 않은 구간의 처리를 다시 시작했습니다.");
  }
  async function reextract() {
    await command("reextract");
    for (const p of parts) {
      const response = await fetch(`${endpoint}/parts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: p.part_index }),
      });
      if (!response.ok) throw new Error("재추출을 시작하지 못했습니다.");
    }
    await load();
  }
  if (!review)
    return (
      <main className="workspace-page">
        <h1>자료 검토</h1>
        {error ? <p role="alert">{error}</p> : <p>자료를 불러오는 중입니다.</p>}
        <Link href={`/d/${deptId}/reviews`}>목록으로</Link>
      </main>
    );
  const done = parts.filter((p) => p.status === "done").length;
  const originalUnavailable = !!review.original_deleted_at || originalExpired;
  return (
    <main className="workspace-page review-workspace">
      <header className="page-heading">
        <div>
          <Link href={`/d/${deptId}/reviews`}>← 자료 목록</Link>
          <p className="eyebrow">
            {review.kind === "audio" ? "음성 전사" : "문서 읽기 결과"} · 버전{" "}
            {review.revision}
          </p>
          <h1>{review.title}</h1>
          <p>
            {review.published_source_id
              ? review.published_revision === review.revision
                ? "이 버전을 업무에 사용 중입니다."
                : `이전 확정본(버전 ${review.published_revision})을 사용 중입니다.`
              : "아직 업무 근거로 사용하지 않는 자료입니다."}
          </p>
        </div>
        <span className="badge badge-neutral">
          {dirty
            ? "저장하지 않은 수정"
            : processing
              ? "처리 중"
              : review.status === "ready"
                ? "검토 가능"
                : "확인 필요"}
        </span>
      </header>
      {error ? (
        <div className="panel" role="alert">
          <p>{error}</p>
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={() => void perform(() => load(!dirty))}
          >
            최신 상태 확인
          </button>
          <p>
            저장하지 않은 수정은 유지됩니다. 충돌이 있다면 내용을 별도로 복사한
            후 편집을 취소하고 다시 불러오세요.
          </p>
        </div>
      ) : null}
      {message ? (
        <p className="review-notice" role="status">
          {message}
        </p>
      ) : null}
      <section className="panel review-progress" aria-label="변환 진행">
        <div>
          <h2>{review.kind === "audio" ? "전체 음성 처리" : "문서 읽기"}</h2>
          <p>
            {done}/{parts.length} 구간 완료
            {review.duration ? ` · 전체 ${time(review.duration)}` : ""}
          </p>
          <progress value={done} max={parts.length || 1} />
        </div>
        <ul>
          {parts.map((p) => (
            <li key={p.id}>
              <span>
                {p.start_seconds === null
                  ? "문서 전문"
                  : `${time(p.start_seconds)}–${time(p.end_seconds ?? 0)}`}
              </span>
              <strong>
                {p.status === "done"
                  ? "완료"
                  : p.status === "processing"
                    ? "변환 중"
                    : p.status === "queued"
                      ? "대기"
                      : p.status === "failed"
                        ? "실패"
                        : p.status === "cancelled"
                          ? "중단"
                          : "업로드 확인 필요"}
              </strong>
              {p.error_code ? (
                <small>
                  {p.error_code === "timeout"
                    ? "처리 시간이 초과됐습니다."
                    : p.error_code === "empty_extraction"
                      ? "읽을 수 있는 텍스트가 없습니다. 스캔 PDF는 OCR이 필요할 수 있습니다."
                      : p.error_code === "file_unavailable"
                        ? "보관 파일을 찾지 못했습니다."
                        : "변환을 완료하지 못했습니다."}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="review-actions">
          {!originalUnavailable &&
          parts.some((p) =>
            ["failed", "cancelled", "waiting"].includes(p.status),
          ) ? (
            <button
              disabled={busy}
              className="button button-secondary"
              type="button"
              onClick={() => void perform(retry)}
            >
              실패·미처리 구간 재시도
            </button>
          ) : null}
          {processing ? (
            <button
              disabled={busy}
              className="button button-ghost"
              type="button"
              onClick={() => void perform(() => command("cancel"))}
            >
              처리 중단
            </button>
          ) : null}
        </div>
        {review.kind === "audio" ? (
          <p className="field-help">
            구간 경계는 1초 겹쳐 변환합니다. 경계의 반복 문장과 잘린 단어를
            원본으로 확인해 주세요. 표시 시각은 구간 범위이며 문장별 발언 시각은
            아닙니다.
          </p>
        ) : (
          <p className="field-help">
            표·다단 문서의 순서와 누락을 원본으로 확인해 주세요. OCR과 추출기가
            제공하지 않은 위치 정보는 생성하지 않습니다.
          </p>
        )}
      </section>
      <section className="panel" aria-label="보관 원본">
        <div className="review-list-heading">
          <h2>보관된 원본</h2>
          {!originalUnavailable && (review.kind === "audio" || downloadAllowed) ? (
            <button
              type="button"
              disabled={busy}
              className="button button-secondary"
              onClick={() =>
                void perform(async () => {
                  await openOriginal();
                })
              }
            >
              원본 {review.kind === "audio" ? "듣기" : "열기"}
            </button>
          ) : (
            <span>{originalUnavailable ? "원본 삭제됨 또는 보존 기한 만료" : "조직에서 원본 내려받기를 허용하지 않았습니다"}</span>
          )}
        </div>
        {originalUrl ? (
          review.kind === "audio" ? (
            <audio ref={audio} controls controlsList={downloadAllowed ? undefined : "nodownload"} src={originalUrl} preload="metadata" />
          ) : (
            <a
              className="button button-secondary"
              href={originalUrl}
              download={review.filename}
            >
              원본 파일 다운로드
            </a>
          )
        ) : (
          <p>원본은 동의한 부서장만 열 수 있으며 접근 허가가 기록됩니다.</p>
        )}
        {originalExpiresAt ? <p className="field-help">원본 보존 기한: {new Date(originalExpiresAt).toLocaleDateString("ko-KR")} · 기한 후 전사는 남고 원본 재생·재추출은 중단됩니다.</p> : null}
      </section>
      {review.candidate_sections ? (
        <section className="panel review-notice" aria-label="재추출 검토">
          <h2>새 추출 결과가 도착했습니다</h2>
          <p>
            기존 교정 내용은 유지되어 있습니다. 아래 전문과 비교한 뒤 교체
            여부를 결정하세요.
          </p>
          <details>
            <summary>새 추출문 전체 보기</summary>
            <pre className="review-original-text">
              {review.candidate_sections.map((s) => s.text).join("\n\n")}
            </pre>
          </details>
          <div className="review-actions">
            <button
              className="button button-secondary"
              disabled={busy || dirty}
              onClick={() => void perform(() => command("use_extraction"))}
            >
              새 추출문으로 교체
            </button>
            <button
              className="button button-ghost"
              disabled={busy || dirty}
              onClick={() => void perform(() => command("discard_extraction"))}
            >
              현재 교정 유지
            </button>
          </div>
        </section>
      ) : null}
      <section className="panel review-editor" aria-label="추출문 편집">
        <div className="review-list-heading">
          <h2>전문 검토·편집</h2>
          <input
            aria-label="본문 검색"
            placeholder="본문에서 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label>
          제목
          <input
            aria-label="검토 제목"
            value={title}
            maxLength={120}
            disabled={processing || busy}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
          />
        </label>
        {sections.map((s, index) =>
          query && !s.text.includes(query) ? null : (
            <article className="review-section" key={s.id}>
              <div className="review-list-heading">
                <strong>구간 {index + 1}</strong>
                <span className="badge badge-neutral">
                  {s.origin === "user"
                    ? "사용자 추가"
                    : s.edited || s.text !== s.original_text
                      ? "수정됨"
                      : s.origin === "transcribed"
                        ? "음성 전사"
                        : "추출문"}
                </span>
                <span>{s.location ?? "위치 정보 없음"}</span>
                {s.start_seconds !== null ? (
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={busy || originalUnavailable}
                    onClick={() =>
                      void perform(async () => {
                        if (!originalRef.current) await openOriginal();
                        setTimeout(() => {
                          if (audio.current) {
                            audio.current.currentTime = s.start_seconds!;
                            void audio.current
                              .play()
                              .catch(() =>
                                setMessage("재생 버튼을 눌러 주세요."),
                              );
                          }
                        }, 100);
                      })
                    }
                  >
                    {time(s.start_seconds)}부터 듣기
                  </button>
                ) : null}
              </div>
              <textarea
                aria-label={`구간 ${index + 1} 텍스트`}
                value={s.text}
                rows={Math.min(14, Math.max(4, Math.ceil(s.text.length / 70)))}
                maxLength={20000}
                disabled={processing || busy}
                onChange={(e) => {
                  setSections((old) =>
                    old.map((v) =>
                      v.id === s.id ? { ...v, text: e.target.value } : v,
                    ),
                  );
                  markDirty();
                }}
              />
              {s.origin !== "user" ? (
                <details>
                  <summary>최초 변환문과 비교</summary>
                  <pre className="review-original-text">{s.original_text}</pre>
                </details>
              ) : null}
              <button
                className="button button-ghost"
                type="button"
                disabled={busy || processing}
                onClick={() => {
                  setSections((old) => old.filter((v) => v.id !== s.id));
                  markDirty();
                }}
              >
                구간 {index + 1} 삭제
              </button>
            </article>
          ),
        )}
        {!sections.length ? (
          <p className="empty-state">변환이 완료되면 읽힌 전문이 표시됩니다.</p>
        ) : null}
        <div className="review-actions">
          <button
            className="button button-secondary"
            disabled={busy || processing}
            type="button"
            onClick={() => {
              setSections((old) => [
                ...old,
                {
                  id: crypto.randomUUID(),
                  text: "",
                  original_text: "",
                  origin: "user",
                  edited: false,
                  location: null,
                  start_seconds: null,
                  end_seconds: null,
                },
              ]);
              setQuery("");
              markDirty();
            }}
          >
            텍스트 추가
          </button>
          <button
            className="button button-primary"
            disabled={busy || processing || !dirty}
            type="button"
            onClick={() => void perform(save)}
          >
            초안 저장
          </button>
          <button
            className="button button-ghost"
            disabled={busy || !dirty}
            type="button"
            onClick={() =>
              void perform(async () => {
                await load(true);
                setError("");
              })
            }
          >
            편집 취소
          </button>
        </div>
      </section>
      <section className="panel" aria-label="자료 확정">
        <h2>확인한 버전만 업무에 사용</h2>
        <label className="review-consent">
          <input
            type="checkbox"
            checked={checked}
            disabled={dirty || processing}
            onChange={(e) => setChecked(e.target.checked)}
          />
          전문과 누락·오류를 확인했습니다. 이 버전을{" "}
          {review.visibility === "dept" ? "부서" : "부서장 전용"} 업무 근거로
          확정합니다.
        </label>
        <div className="review-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={
              busy ||
              dirty ||
              !checked ||
              review.status !== "ready" ||
              done !== parts.length
            }
            onClick={() => void perform(() => command("publish"))}
          >
            확인 후 확정
          </button>
          {review.published_source_id ? (
            <>
              <button
                className="button button-secondary"
                disabled={busy || dirty}
                type="button"
                onClick={() => void perform(() => command("stop"))}
              >
                업무 활용 중지
              </button>
              <Link href={`/d/${deptId}/documents`}>확정 자료 요약 보기</Link>
            </>
          ) : null}
        </div>
        <p className="field-help">
          직접 추가한 문장은 원래 발언과 구분합니다. 이전 원장에 기록된 결정과
          인용은 정정·삭제 후에도 보존됩니다.
        </p>
      </section>
      <section className="panel" aria-label="수정 이력 및 관리">
        <h2>이력·내보내기·삭제</h2>
        <p>
          현재 버전 {review.revision} ·{" "}
          {dirty
            ? "다운로드에는 마지막 저장본이 포함됩니다."
            : "저장된 내용을 내려받습니다."}
        </p>
        <div className="review-actions">
          <a
            className="button button-secondary"
            href={`${endpoint}?format=txt`}
          >
            TXT 다운로드
          </a>
          <a className="button button-secondary" href={`${endpoint}?format=md`}>
            MD 다운로드
          </a>
          <button
            className="button button-ghost"
            disabled={
              busy || dirty || processing || originalUnavailable
            }
            type="button"
            onClick={() => void perform(reextract)}
          >
            원본 다시 읽기
          </button>
        </div>
        <details>
          <summary>저장 이력 {history.length}개</summary>
          <ul>
            {history.map((h) => (
              <li key={h.revision}>
                버전 {h.revision} ·{" "}
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Seoul",
                }).format(new Date(h.created_at))}{" "}
                · {h.title}
              </li>
            ))}
          </ul>
        </details>
        <div className="review-actions">
          {!review.original_deleted_at ? (
            <button
              className="button button-ghost"
              type="button"
              disabled={busy}
              onClick={() => setDestructive("delete_original")}
            >
              원본 파일만 삭제
            </button>
          ) : null}
          <button
            className="button button-ghost"
            type="button"
            disabled={busy}
            onClick={() => setDestructive("delete")}
          >
            자료 전체 삭제
          </button>
        </div>
        {destructive ? (
          <div className="review-confirm" role="alert">
            <p>
              {destructive === "delete"
                ? "원본·전사·수정 이력과 검색 근거를 삭제합니다. 원장의 기존 인용은 남습니다."
                : "보관 원본과 변환용 파일을 삭제합니다. 저장한 전사는 남고 다시 듣기·재추출은 할 수 없습니다."}
            </p>
            <button
              className="button button-primary"
              disabled={busy}
              type="button"
              onClick={() => void perform(() => command(destructive))}
            >
              삭제 실행
            </button>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => setDestructive(null)}
            >
              취소
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
