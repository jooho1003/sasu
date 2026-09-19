"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  audioPlan,
  encodeMonoWav,
  validateAudioMetadata,
} from "@/lib/adapters/review-audio";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ReviewedMaterial } from "@/lib/contracts";

type Member = { user_id: string; display_name: string; consented_at: string };
export function ReviewedMaterials({
  deptId,
  role,
}: {
  deptId: string;
  role: "lead" | "member";
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewedMaterial[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [kind, setKind] = useState<"audio" | "document">("audio");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [synthetic, setSynthetic] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const participantReady = kind === "document" || synthetic || participants.length > 0;
  const uploadReady = Boolean(file) && participantReady && consent;
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/d/${deptId}/reviews`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.reviews);
      setMembers(data.members);
    } catch {
      setError("자료 목록을 불러오지 못했습니다.");
    }
  }, [deptId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  async function upload() {
    if (!file || !consent) return;
    setBusy(true);
    setError("");
    setMessage("파일을 확인하고 있습니다.");
    let context: AudioContext | null = null;
    let reviewId: string | null = null;
    try {
      if (
        file.size > (kind === "audio" ? 50 : 20) * 1024 * 1024 ||
        file.size === 0
      )
        throw new Error(
          kind === "audio"
            ? "음성은 50메가바이트 이하이어야 합니다."
            : "문서는 20메가바이트 이하이어야 합니다.",
        );
      if (
        kind === "document" &&
        !/\.(txt|md|markdown|csv|json|pdf|docx)$/i.test(file.name)
      )
        throw new Error("지원하는 문서 형식을 선택해 주세요.");
      if (kind === "audio" && !synthetic && !participants.length)
        throw new Error("녹음에 참여한 동의 완료 멤버를 선택해 주세요.");
      const bytes = await file.arrayBuffer();
      let decoded: AudioBuffer | null = null;
      if (kind === "audio") {
        context = new AudioContext({ sampleRate: 16000 });
        try {
          decoded = await context.decodeAudioData(bytes.slice(0));
        } catch {
          throw new Error(
            "음성을 읽을 수 없습니다. 손상 여부를 확인하거나 .wav, .mp3, M4A 파일로 변환해 주세요.",
          );
        }
        if (!validateAudioMetadata(file.size, decoded.duration))
          throw new Error(
            "지원 길이는 30분까지입니다. 파일을 나누어 올려 주세요.",
          );
      }
      const fingerprint = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      reviewId = crypto.randomUUID();
      const created = await fetch(`/api/d/${deptId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: reviewId,
          kind,
          title: title.trim() || file.name,
          filename: file.name,
          size: file.size,
          fingerprint,
          duration: decoded?.duration ?? null,
          visibility,
          participants: kind === "audio" ? participants : [],
          synthetic: kind === "audio" && synthetic,
          consent_confirmed: true,
        }),
      });
      const body = await created.json();
      if (!created.ok) throw new Error(body.error);
      const storage =
        createBrowserSupabaseClient().storage.from("review-materials");
      const root = `${deptId}/${reviewId}`;
      setMessage("원본을 비공개로 보관하고 있습니다.");
      const original = await storage.upload(`${root}/original`, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (original.error)
        throw new Error(
          "원본 업로드에 실패했습니다. 네트워크와 저장소 설정을 확인해 주세요.",
        );
      if (decoded) {
        const plan = audioPlan(decoded.duration);
        const mono = new Float32Array(decoded.length);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const samples = decoded.getChannelData(channel);
          for (let i = 0; i < mono.length; i++)
            mono[i] += samples[i] / decoded.numberOfChannels;
        }
        for (const part of plan) {
          setMessage(`음성 구간 보관 중 · ${part.index + 1}/${plan.length}`);
          const wav = encodeMonoWav(
            mono.slice(
              Math.floor(part.start * decoded.sampleRate),
              Math.min(mono.length, Math.ceil(part.end * decoded.sampleRate)),
            ),
            decoded.sampleRate,
          );
          const result = await storage.upload(
            `${root}/parts/${part.index}.wav`,
            new Blob([wav], { type: "audio/wav" }),
            { contentType: "audio/wav", upsert: false },
          );
          if (result.error)
            throw new Error(
              `${part.index + 1}번째 구간 업로드에 실패했습니다. 검토 화면에서 다시 이어갈 수 있습니다.`,
            );
        }
        for (const part of plan) {
          const queued = await fetch(
            `/api/d/${deptId}/reviews/${reviewId}/parts`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ index: part.index }),
            },
          );
          if (!queued.ok)
            throw new Error(
              "변환 작업을 시작하지 못했습니다. 검토 화면에서 재시도해 주세요.",
            );
        }
      } else {
        const queued = await fetch(
          `/api/d/${deptId}/reviews/${reviewId}/parts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ index: 0 }),
          },
        );
        if (!queued.ok) throw new Error("문서 읽기를 시작하지 못했습니다.");
      }
      router.push(`/d/${deptId}/reviews/${reviewId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 올리지 못했습니다.");
      setMessage(
        reviewId
          ? `목록에서 자료를 다시 열어 재시도하거나 삭제할 수 있습니다.`
          : "",
      );
      await load();
    } finally {
      await context?.close();
      setBusy(false);
    }
  }
  if (role !== "lead")
    return (
      <main className="workspace-page">
        <h1>자료 검토</h1>
        <p>
          자료의 원본·초안 검토는 팀장이 진행합니다. 확정된 자료는 문서와
          묻기에서 확인할 수 있습니다.
        </p>
        <Link href={`/d/${deptId}/documents`}>확정된 문서 보기</Link>
      </main>
    );
  return (
    <main className="workspace-page review-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">음성 · 자료 검토</p>
          <h1>읽고 듣고, 확인한 뒤 활용하세요</h1>
          <p>
            원본과 변환 결과를 확인하고, 직접 고친 내용을 부서의 업무 자료로
            확정합니다.
          </p>
        </div>
        <Link
          className="button button-secondary"
          href={`/d/${deptId}/documents`}
        >
          확정 자료 요약
        </Link>
      </header>
      <section className="panel review-upload" aria-label="자료 업로드">
        <div className="review-tabs" role="group" aria-label="자료 종류">
          <button
            type="button"
            aria-pressed={kind === "audio"}
            onClick={() => {
              setKind("audio");
              setFile(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            disabled={busy}
          >
            음성 파일
          </button>
          <button
            type="button"
            aria-pressed={kind === "document"}
            onClick={() => {
              setKind("document");
              setFile(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            disabled={busy}
          >
            문서 파일
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <fieldset disabled={busy}>
            <label className="file-dropzone">
              <strong>
                {file?.name ??
                  (kind === "audio"
                    ? "글로 바꿀 음성을 선택하세요"
                    : "내용을 확인할 문서를 선택하세요")}
              </strong>
              <span>
                {kind === "audio"
                  ? ".mp3 · .wav · M4A · .webm 등 / 50메가바이트 · 30분 이하"
                  : ".txt 파일 · .md 파일 · .csv 파일 · .json 파일 · .pdf 파일 · .docx 파일 / 20메가바이트 이하"}
              </span>
              <input
                ref={fileInput}
                aria-label="검토할 파일"
                type="file"
                accept={
                  kind === "audio"
                    ? "audio/*,.webm,.m4a"
                    : ".txt,.md,.markdown,.csv,.json,.pdf,.docx"
                }
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                  setTitle(next?.name ?? "");
                }}
                required
              />
            </label>
            <div className="review-form-grid">
              <label>
                자료 제목
                <input
                  aria-label="자료 제목"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </label>
              <label>
                확정 후 볼 수 있는 사람
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as "dept" | "leads_only")
                  }
                >
                  <option value="dept">우리 부서</option>
                  <option value="leads_only">팀장만</option>
                </select>
              </label>
            </div>
            {kind === "audio" ? (
              <div className="review-consent">
                <label>
                  <input
                    type="checkbox"
                    checked={synthetic}
                    onChange={(e) => setSynthetic(e.target.checked)}
                  />
                  합성 음성(TTS)입니다. 기계가 읽은 소리이며 진짜 사람의 발언이 아닙니다. {/* // wording-ok: 사용자 확정 §0-6의 합성 음성(TTS) 표기를 유지합니다. */}
                </label>
                {!synthetic ? (
                  <fieldset>
                    <legend>
                      녹음 참여자 · 동의 완료 멤버만 선택할 수 있습니다
                    </legend>
                    {members.map((m) => (
                      <label key={m.user_id}>
                        <input
                          type="checkbox"
                          checked={participants.includes(m.user_id)}
                          onChange={(e) =>
                            setParticipants((old) =>
                              e.target.checked
                                ? [...old, m.user_id]
                                : old.filter((id) => id !== m.user_id),
                            )
                          }
                        />
                        {m.display_name}
                      </label>
                    ))}
                    {!members.length ? (
                      <p>먼저 멤버 동의를 완료해 주세요.</p>
                    ) : null}
                  </fieldset>
                ) : null}
              </div>
            ) : null}
            <label className="review-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              {kind === "audio" && !synthetic
                ? "녹음의 모든 참여자가 선택 목록에 있고, 원본 보관과 받아쓴 글 활용에 동의했음을 확인했습니다."
                : "이 자료를 보관하고 업무에 활용할 권한이 있음을 확인했습니다."}
            </label>
            <p className="field-help">
              원본은 비공개로 보관됩니다. 직접 삭제할 때까지 다시 열 수 있으며,
              확인·확정 전에는 검색과 업무 평가에 사용되지 않습니다.
            </p>
            <ul className="upload-readiness" aria-label="업로드 준비 상태">
              <li data-ready={Boolean(file)}>{file ? "✓" : "1"} 파일 선택</li>
              <li data-ready={participantReady}>{participantReady ? "✓" : "2"} {kind === "audio" ? "참여자 선택" : "자료 종류 확인"}</li>
              <li data-ready={consent}>{consent ? "✓" : "3"} 권한·동의 확인</li>
            </ul>
            <button
              className="button button-primary"
              type="submit"
              disabled={!uploadReady || busy}
            >
              {busy
                ? "업로드 중…"
                : kind === "audio"
                  ? "전체 음성 받아쓰기 시작"
                  : "문서 읽기 시작"}
            </button>
          </fieldset>
        </form>
        {message ? <p role="status">{message}</p> : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
      </section>
      <section className="panel" aria-label="자료 검토 목록">
        <div className="review-list-heading">
          <h2>내 부서 자료</h2>
          <input
            aria-label="자료 검색"
            placeholder="제목으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void load()}
          >
            새로고침
          </button>
        </div>
        {!rows.length ? (
          <p className="empty-state">
            파일을 올리면 처리 상태와 검토 기록이 여기에 표시됩니다.
          </p>
        ) : (
          <ul className="review-list">
            {rows
              .filter((r) => r.title.includes(query))
              .map((r) => (
                <li key={r.id}>
                  <Link href={`/d/${deptId}/reviews/${r.id}`}>
                    <span className="badge badge-neutral">
                      {r.kind === "audio" ? "음성" : "문서"}
                    </span>
                    <strong>{r.title}</strong>
                    <span>
                      {r.status === "ready"
                        ? r.published_revision === r.revision
                          ? "확정 완료"
                          : "검토 대기"
                        : r.status === "processing"
                          ? "변환 중"
                          : r.status === "failed"
                            ? "처리 실패"
                            : r.status === "cancelled"
                              ? "중단됨"
                              : "업로드 대기"}
                    </span>
                    <small>
                      버전 {r.revision} ·{" "}
                      {new Intl.DateTimeFormat("ko-KR", {
                        dateStyle: "medium",
                        timeZone: "Asia/Seoul",
                      }).format(new Date(r.updated_at))}
                    </small>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>
    </main>
  );
}
