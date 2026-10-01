import { useEffect, useRef, useState } from "react";
import { audioPlan, encodeMonoWav, validateAudioMetadata } from "@sasu/review-audio";
import { message } from "../App";

type Kind = "audio" | "document";
const documents = /\.(txt|md|csv|json|pdf|docx)$/iu;
function sha256(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((hash) => Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join(""));
}

export function WorkReviewUpload({ deptId, onNotice }: { deptId: string; onNotice: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("document");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"dept" | "leads_only">("dept");
  const [synthetic, setSynthetic] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof window.sasu.members.list>>["members"]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  useEffect(() => window.sasu.upload.onReviewProgress((next) => setProgress(next.stage === "original" ? "원본 보관 중" : `구간 ${next.current}/${next.total} 보관 중`)), []);
  useEffect(() => { if (kind === "audio") void window.sasu.members.list().then((r) => setMembers(r.members)).catch((e) => onNotice(message(e))); }, [kind, onNotice]);
  const choose = (next: File | null): void => { setFile(next); setTitle(next?.name ?? ""); setParticipants([]); setProgress(""); setReviewId(null); };
  const upload = async (): Promise<void> => {
    if (!file || !consent || busy) return;
    let context: AudioContext | null = null;
    try {
      const max = kind === "audio" ? 50 : 20;
      if (!file.size || file.size > max * 1024 * 1024) throw new Error(`${kind === "audio" ? "음성" : "문서"}은 ${max}메가바이트 이하만 올릴 수 있습니다.`);
      if (kind === "document" && !documents.test(file.name)) throw new Error(".txt .md .csv .json .pdf .docx 파일만 올릴 수 있습니다.");
      if (kind === "audio" && !file.type.startsWith("audio/")) throw new Error("음성 파일만 선택해 주세요.");
      if (kind === "audio" && !synthetic && !participants.length) throw new Error("동의한 참여자를 한 명 이상 선택해 주세요.");
      setBusy(true); setProgress("파일을 확인하고 있습니다");
      const original = new Uint8Array(await file.arrayBuffer());
      let duration: number | null = null;
      let parts: { index: number; seconds: number; bytes: Uint8Array }[] = [];
      if (kind === "audio") {
        context = new AudioContext({ sampleRate: 16_000 });
        const decoded = await context.decodeAudioData(original.buffer.slice(0));
        if (!validateAudioMetadata(file.size, decoded.duration)) throw new Error("음성은 30분 이하만 올릴 수 있습니다.");
        duration = decoded.duration;
        const mono = new Float32Array(decoded.length);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) { const samples = decoded.getChannelData(channel); for (let index = 0; index < mono.length; index++) mono[index] += samples[index] / decoded.numberOfChannels; }
        const plan = audioPlan(decoded.duration);
        parts = plan.map((part) => { setProgress(`구간 ${part.index + 1}/${plan.length} 준비 중`); const start = Math.floor(part.start * decoded.sampleRate); const end = Math.min(mono.length, Math.ceil(part.end * decoded.sampleRate)); return { index: part.index, seconds: part.end - part.start, bytes: new Uint8Array(encodeMonoWav(mono.slice(start, end), decoded.sampleRate)) }; });
      }
      const id = crypto.randomUUID(); setReviewId(id);
      const result = await window.sasu.upload.review({ review: { id, kind, title: title.trim() || file.name, filename: file.name, size: file.size, fingerprint: await sha256(original.buffer), duration, visibility, participants: kind === "audio" ? participants : [], synthetic: kind === "audio" && synthetic, consent_confirmed: true }, contentType: file.type || "application/octet-stream", original, parts });
      setProgress("자료를 받아쓰기와 검토에 넣었습니다."); onNotice(`자료를 올렸습니다. 처리할 일 ${result.job_ids.length}건을 시작했습니다.`);
    } catch (cause) { onNotice(message(cause)); } finally { await context?.close(); setBusy(false); }
  };
  return <section className="workSection" aria-labelledby="review-upload-title"><h2 id="review-upload-title">올린 자료 확인</h2><p>파일을 확인한 뒤 부서 자료로 쓸 수 있게 준비합니다.</p><div className="workChoices"><button className={kind === "document" ? "active" : ""} onClick={() => { setKind("document"); choose(null); }}>문서 파일</button><button className={kind === "audio" ? "active" : ""} onClick={() => { setKind("audio"); choose(null); }}>음성 파일</button></div><label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] ?? null); }}><strong>{file?.name ?? "파일을 끌어 놓거나 선택하세요"}</strong><span>{kind === "audio" ? "음성 파일 · 50메가바이트 · 30분 이하" : ".txt .md .csv .json .pdf .docx · 20메가바이트 이하"}</span><input ref={input} aria-label="검토할 파일" type="file" accept={kind === "audio" ? "audio/*" : ".txt,.md,.csv,.json,.pdf,.docx"} onChange={(e) => choose(e.target.files?.[0] ?? null)} /></label><label>자료 제목<input aria-label="자료 제목" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label><label>볼 수 있는 사람<select value={visibility} onChange={(e) => setVisibility(e.target.value as "dept" | "leads_only")}><option value="dept">부서 전체</option><option value="leads_only">팀장만</option></select></label>{kind === "audio" ? <fieldset><legend>음성 참여자</legend><label><input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} />합성 음성입니다.</label>{!synthetic ? members.map((member) => <label key={member.user_id}><input type="checkbox" checked={participants.includes(member.user_id)} onChange={(e) => setParticipants((old) => e.target.checked ? [...old, member.user_id] : old.filter((id) => id !== member.user_id))} />{member.display_name}</label>) : null}</fieldset> : null}<label><input aria-label="참여자 동의 확인" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />참여자 동의를 확인했습니다.</label><button disabled={!file || !consent || busy} onClick={() => void upload()}>{busy ? "올리는 중" : "자료 올리기"}</button>{progress ? <p role="status">{progress}</p> : null}{reviewId ? <button className="linkButton" onClick={() => void window.sasu.app.openWeb(`/d/${deptId}/reviews/${reviewId}`)}>웹에서 이어서 하기</button> : null}</section>;
}
