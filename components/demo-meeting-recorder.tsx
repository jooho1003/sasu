"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DemoSource = "microphone" | "computer";

const MAX_SECONDS = 60;

export function DemoMeetingRecorder() {
  const [source, setSource] = useState<DemoSource>("microphone");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioType, setAudioType] = useState("audio/webm");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cutoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (cutoffRef.current) clearTimeout(cutoffRef.current);
    cutoffRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const discard = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setAudioUrl(null);
    setSeconds(0);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [release]);

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    release();
    setRecording(false);
  };

  const start = async () => {
    if (pendingRef.current || recorderRef.current) return;
    pendingRef.current = true;
    setStarting(true);
    discard();
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError("이 브라우저에서는 녹음을 사용할 수 없습니다. 아래 합성 회의로 계속 체험할 수 있습니다.");
      pendingRef.current = false;
      setStarting(false);
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = source === "computer"
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (!stream.getAudioTracks().length) throw new Error("no_audio_track");
      streamRef.current = stream;
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), type ? { mimeType: type } : undefined);
      const chunks: BlobPart[] = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        release();
        if (!mountedRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
        if (blob.size) {
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setAudioUrl(url);
          setAudioType(blob.type);
        }
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.onerror = () => {
        release();
        setRecording(false);
        setError("녹음이 중단되었습니다. 아래 합성 회의로 계속 체험할 수 있습니다.");
      };
      stream.getTracks().forEach((track) => track.addEventListener("ended", stop, { once: true }));
      recorder.start(1000);
      startedRef.current = Date.now();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedRef.current) / 1000));
        setSeconds(elapsed);
      }, 250);
      cutoffRef.current = setTimeout(() => { setSeconds(MAX_SECONDS); stop(); }, MAX_SECONDS * 1000);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      release();
      setRecording(false);
      setError("마이크·화면 소리를 사용할 수 없습니다. 권한을 확인하거나 아래 합성 회의로 계속 체험하세요.");
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  };

  return (
    <section className="panel demo-meeting-recorder" aria-labelledby="demo-recording-heading">
      <div className="demo-review-intro">
        <div>
          <p className="eyebrow">녹음 체험 · 최대 60초</p>
          <h2 id="demo-recording-heading">직접 녹음하고 바로 들어보기</h2>
          <p>녹음은 이 탭의 메모리에만 남습니다. 서버 전송·자동 받아쓰기는 실행하지 않으며 새로고침하면 사라집니다.</p>
        </div>
        <span className="badge badge-neutral">브라우저에서만 사용</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label>녹음할 소리
          <select value={source} disabled={recording} onChange={(event) => { discard(); setSource(event.target.value as DemoSource); }}>
            <option value="microphone">마이크</option>
            <option value="computer">화면·컴퓨터 소리</option>
          </select>
        </label>
        <span role="timer" aria-label="녹음 시간">{seconds} / {MAX_SECONDS}초</span>
        {recording
          ? <button className="button button-secondary" type="button" onClick={stop}>녹음 끝내기</button>
          : <button className="button button-primary" type="button" disabled={starting} onClick={start}>{starting ? "권한 확인 중" : "녹음 시작"}</button>}
      </div>
      {audioUrl ? <div className="demo-recorded-audio">
        <p>방금 녹음한 소리 · 받아쓰지 않음</p>
        <audio controls src={audioUrl} aria-label="방금 녹음한 소리 재생" />
        <a className="button button-secondary button-small" href={audioUrl} download={audioType.includes("mp4") ? "내-녹음.m4a" : "내-녹음.webm"}>내 녹음 내려받기</a>
        <button className="button button-secondary button-small" type="button" onClick={discard}>녹음 지우기</button>
      </div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
