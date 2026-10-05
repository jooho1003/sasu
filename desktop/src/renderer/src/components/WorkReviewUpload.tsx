// Design Ref: desktop-upload-recovery §5 — only the current view owns preparation and follow-up actions.
import { useEffect, useRef, useState } from "react";
import { audioPlan, encodeMonoWav, validateAudioMetadata } from "@sasu/review-audio";
import { message } from "../../../shared/messages";

type Kind = "audio" | "document";
const documents = /\.(txt|md|csv|json|pdf|docx)$/iu;
function sha256(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((hash) => Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join(""));
}

export function WorkReviewUpload({ deptId, onNotice, onSeen }: {
  deptId: string;
  onNotice: (text: string) => void;
  onSeen: (id: string, stillCurrent?: () => boolean) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("document");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [synthetic, setSynthetic] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof window.sasu.members.list>>["members"]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [progress, setProgress] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const active = useRef(true);
  const generation = useRef(0);
  const uploadLocked = useRef(false);
  const openLocked = useRef(false);
  const accepted = useRef<string | null>(null);
  const currentKind = useRef<Kind>("document");
  const membersGeneration = useRef(0);
  const membersRequest = useRef<number | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current += 1; };
  }, []);

  const loadMembers = async (): Promise<void> => {
    if (!active.current || currentKind.current !== "audio" || membersRequest.current !== null || uploadLocked.current || openLocked.current) return;
    const version = membersGeneration.current;
    membersRequest.current = version;
    // StrictMode replay can share this pending read; kind changes retire its version.
    const current = (): boolean => active.current && currentKind.current === "audio" && version === membersGeneration.current;
    setMembersLoading(true); setMembersError("");
    try {
      const next = await window.sasu.members.list();
      if (!current()) return;
      setMembers(next.members);
      setParticipants((old) => old.filter((id) => next.members.some((member) => member.user_id === id)));
    } catch (cause) {
      if (!current()) return;
      setMembers([]); setMembersError(message(cause));
    } finally {
      if (current()) { membersRequest.current = null; setMembersLoading(false); }
    }
  };
  useEffect(() => { if (kind === "audio") void loadMembers(); }, [kind]);

  const edit = (change: () => void): void => {
    if (uploadLocked.current || openLocked.current) return;
    accepted.current = null; setReviewId(null); setProgress("");
    change();
  };
  const choose = (next: File | null): void => edit(() => {
    setFile(next); setTitle(next?.name ?? ""); setParticipants([]);
  });
  const changeKind = (next: Kind): void => {
    if (uploadLocked.current || openLocked.current || next === currentKind.current) return;
    currentKind.current = next; membersGeneration.current += 1; membersRequest.current = null;
    setMembers([]); setMembersError(""); setMembersLoading(next === "audio");
    edit(() => { setKind(next); setFile(null); setTitle(""); setParticipants([]); if (input.current) input.current.value = ""; });
  };

  const upload = async (): Promise<void> => {
    if (!active.current || !file || !consent || uploadLocked.current || openLocked.current || accepted.current) return;
    uploadLocked.current = true;
    const version = generation.current;
    const current = (): boolean => active.current && version === generation.current;
    setBusy(true); setReviewId(null); onNotice("");
    let context: AudioContext | null = null;
    try {
      const max = kind === "audio" ? 50 : 20;
      if (!file.size || file.size > max * 1024 * 1024) throw new Error(`${kind === "audio" ? "음성" : "문서"}은 ${max}메가바이트 이하만 올릴 수 있습니다.`);
      if (kind === "document" && !documents.test(file.name)) throw new Error(".txt .md .csv .json .pdf .docx 파일만 올릴 수 있습니다.");
      if (kind === "audio" && !file.type.startsWith("audio/")) throw new Error("음성 파일만 선택해 주세요.");
      if (kind === "audio" && !synthetic && (membersLoading || membersError || !participants.length || participants.some((id) => !members.some((member) => member.user_id === id)))) throw new Error("동의한 참여자를 한 명 이상 선택해 주세요.");
      setProgress("파일을 확인하고 있습니다.");
      const bytes = await file.arrayBuffer();
      if (!current()) return;
      const original = new Uint8Array(bytes);
      let duration: number | null = null;
      let parts: { index: number; seconds: number; bytes: Uint8Array }[] = [];
      if (kind === "audio") {
        context = new AudioContext({ sampleRate: 16_000 });
        const decoded = await context.decodeAudioData(original.buffer.slice(0));
        if (!current()) return;
        if (!validateAudioMetadata(file.size, decoded.duration)) throw new Error("음성은 30분 이하만 올릴 수 있습니다.");
        duration = decoded.duration;
        const mono = new Float32Array(decoded.length);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const samples = decoded.getChannelData(channel);
          for (let index = 0; index < mono.length; index++) mono[index] += samples[index] / decoded.numberOfChannels;
        }
        parts = audioPlan(decoded.duration).map((part) => {
          const start = Math.floor(part.start * decoded.sampleRate), end = Math.min(mono.length, Math.ceil(part.end * decoded.sampleRate));
          return { index: part.index, seconds: part.end - part.start, bytes: new Uint8Array(encodeMonoWav(mono.slice(start, end), decoded.sampleRate)) };
        });
      }
      const fingerprint = await sha256(original.buffer);
      if (!current()) return;
      // Plan SC1/SC2: the result link belongs to an accepted upload, never its preparation UUID.
      const id = crypto.randomUUID();
      setProgress("자료를 올리는 중입니다.");
      const result = await window.sasu.upload.review({
        review: { id, kind, title: title.trim() || file.name, filename: file.name, size: file.size, fingerprint, duration, visibility, participants: kind === "audio" ? participants : [], synthetic: kind === "audio" && synthetic, consent_confirmed: true },
        contentType: file.type || "application/octet-stream", original, parts,
      });
      if (!current()) return;
      accepted.current = result.id; setReviewId(result.id);
      setProgress("자료를 받아쓰기와 검토에 넣었습니다.");
      onNotice(`자료를 올렸습니다. 처리할 일 ${result.job_ids.length}건을 시작했습니다.`);
    } catch (cause) {
      if (current()) { setProgress(""); onNotice(message(cause)); }
    } finally {
      // Untagged global progress events cannot identify this upload; local stages are authoritative.
      try { await context?.close(); } catch { /* Resource cleanup must not strand the form lock. */ }
      if (current()) { uploadLocked.current = false; setBusy(false); }
    }
  };
  const open = async (): Promise<void> => {
    if (!active.current || !reviewId || uploadLocked.current || openLocked.current) return;
    openLocked.current = true;
    const version = generation.current;
    const current = (): boolean => active.current && version === generation.current;
    setOpening(true); onNotice("");
    try {
      await window.sasu.app.openWeb(`/d/${encodeURIComponent(deptId)}/reviews/${encodeURIComponent(reviewId)}`);
      if (!current()) return;
      await onSeen(reviewId, current);
      if (!current()) return;
    } catch (cause) {
      if (current()) onNotice(message(cause));
    } finally {
      if (current()) { openLocked.current = false; setOpening(false); }
    }
  };
  const frozen = busy || opening;
  const validParticipants = synthetic || (!membersLoading && !membersError && participants.length > 0 && participants.every((id) => members.some((member) => member.user_id === id)));
  return (
    <section className="workSection" aria-labelledby="review-upload-title">
      <h2 id="review-upload-title">올린 자료 확인</h2>
      <p>파일을 확인한 뒤 부서 자료로 쓸 수 있게 준비합니다.</p>
      <div className="workChoices">
        <button disabled={frozen} className={kind === "document" ? "active" : ""} onClick={() => changeKind("document")}>문서 파일</button>
        <button disabled={frozen} className={kind === "audio" ? "active" : ""} onClick={() => changeKind("audio")}>음성 파일</button>
      </div>
      <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0] ?? null); }}>
        <strong>{file?.name ?? "파일을 끌어 놓거나 선택하세요"}</strong>
        <span>{kind === "audio" ? "음성 파일 · 50메가바이트 · 30분 이하" : ".txt .md .csv .json .pdf .docx · 20메가바이트 이하"}</span>
        <input ref={input} aria-label="검토할 파일" type="file" disabled={frozen} accept={kind === "audio" ? "audio/*" : ".txt,.md,.csv,.json,.pdf,.docx"} onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      </label>
      <label>자료 제목<input aria-label="자료 제목" value={title} maxLength={120} disabled={frozen} onChange={(event) => edit(() => setTitle(event.target.value))} /></label>
      <label>볼 수 있는 사람<select value={visibility} disabled={frozen} onChange={(event) => edit(() => setVisibility(event.target.value as "dept" | "leads_only"))}><option value="dept">부서 전체</option><option value="leads_only">팀장만</option></select></label>
      {kind === "audio" ? <fieldset disabled={frozen}>
        <legend>음성 참여자</legend>
        <label><input type="checkbox" checked={synthetic} onChange={(event) => edit(() => setSynthetic(event.target.checked))} />합성 음성입니다.</label>
        <button disabled={frozen || membersLoading} onClick={() => void loadMembers()}>참여자 다시 불러오기</button>
        {membersLoading ? <p role="status">참여자를 불러오는 중입니다.</p> : membersError ? <p role="alert">{membersError}</p> : !members.length ? <p>동의한 참여자가 없습니다.</p> : null}
        {!synthetic && !membersLoading && !membersError ? members.map((member) => <label key={member.user_id}><input type="checkbox" checked={participants.includes(member.user_id)} onChange={(event) => edit(() => setParticipants((old) => event.target.checked ? [...old, member.user_id] : old.filter((id) => id !== member.user_id)))} />{member.display_name}</label>) : null}
      </fieldset> : null}
      <label><input aria-label="참여자 동의 확인" type="checkbox" checked={consent} disabled={frozen} onChange={(event) => edit(() => setConsent(event.target.checked))} />참여자 동의를 확인했습니다.</label>
      <button disabled={!file || !consent || frozen || !!reviewId || (kind === "audio" && !validParticipants)} onClick={() => void upload()}>{busy ? "올리는 중" : "자료 올리기"}</button>
      {progress ? <p role="status">{progress}</p> : null}
      {opening ? <p role="status">웹에서 자료를 여는 중입니다.</p> : null}
      {reviewId ? <button className="linkButton" disabled={frozen} onClick={() => void open()}>웹에서 이어서 하기</button> : null}
    </section>
  );
}
