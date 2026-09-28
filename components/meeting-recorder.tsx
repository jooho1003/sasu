"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingSaveResult, RecordingSegmentState, ReviewRecordingStart } from "@/lib/contracts";
import { captureInputs, captureMicrophone, stopInputs } from "@/lib/recording/browser/inputs";
import { startRecording } from "@/lib/recording/browser/capture";
import {
  cleanupLocalRecordings, openRecordingStore, probeRecordingStore, removeLocalRecording,
  type RecordingScope,
} from "@/lib/recording/browser/storage";
import { prepareRecordingOriginalManifest, streamRecordingOriginals } from "@/lib/recording/original-segments";
import { RECORDING_RATE } from "@/lib/recording/pcm";
import { encodeRecordingLevels, quantizeRecordingLevel } from "@/lib/recording/levels";
import type { RecordingSnapshot } from "@/lib/recording/session";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Session = {
  id: string; title: string; input_method: ReviewRecordingStart["input_method"];
  visibility: ReviewRecordingStart["visibility"]; meeting_provider: ReviewRecordingStart["meeting_provider"];
  state: "active" | "saving" | "completed" | "discarded" | "expired";
  expires_at: string; started_at: string; state_reason: string | null;
};
type LocalInfo = Awaited<ReturnType<Awaited<ReturnType<typeof openRecordingStore>>["inspect"]>>;
type Member = { user_id: string; display_name: string; consented_at: string };
type CaptureControl = Awaited<ReturnType<typeof startRecording>>;

async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "요청을 완료하지 못했습니다.");
  return data as T;
}

function time(samples: number) {
  const seconds = Math.floor(samples / RECORDING_RATE);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function importRecordingKey(encoded: string) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
  if (raw.length !== 32) throw new Error("녹음 키를 확인하지 못했습니다.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function MeetingRecorder({ deptId, userId, initialContinuesId = null }: {
  deptId: string; userId: string; initialContinuesId?: string | null;
}) {
  const router = useRouter();
  const base = `/api/d/${deptId}`;
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [continuesId, setContinuesId] = useState(initialContinuesId ?? "");
  const [selected, setSelected] = useState<Session | null>(null);
  const [local, setLocal] = useState<LocalInfo>(null);
  const [segments, setSegments] = useState<RecordingSegmentState[]>([]);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<ReviewRecordingStart["input_method"]>("microphone");
  const [provider, setProvider] = useState<ReviewRecordingStart["meeting_provider"]>("in_person");
  const [visibility, setVisibility] = useState<ReviewRecordingStart["visibility"]>("leads_only");
  const [participants, setParticipants] = useState<string[]>([userId]);
  const [consent, setConsent] = useState(false);
  const [testAudio, setTestAudio] = useState<string | null>(null);
  const [testLevels, setTestLevels] = useState<number[]>([]);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);
  const [inputNotice, setInputNotice] = useState("");
  const [microphoneDisconnected, setMicrophoneDisconnected] = useState(false);
  const [wakeNotice, setWakeNotice] = useState("");
  const [heardTest, setHeardTest] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [snapshot, setSnapshot] = useState<RecordingSnapshot | null>(null);
  const [captureActive, setCaptureActive] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const keyRef = useRef<CryptoKey | null>(null);
  const controlRef = useRef<CaptureControl | null>(null);
  const loadingRef = useRef(false);
  const testAudioRef = useRef<string | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputCleanupRef = useRef<(() => void) | null>(null);
  const profileStoreRef = useRef<Awaited<ReturnType<typeof openRecordingStore>> | null>(null);
  const profileWriteRef = useRef<Promise<void>>(Promise.resolve());
  const profileFlushRef = useRef<Promise<void> | null>(null);
  const microphoneReselectsRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockPendingRef = useRef(false);
  const scope = useCallback((id: string): RecordingScope => ({ ownerUserId: userId, deptId, recordingId: id }), [userId, deptId]);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [list, recentList, review] = await Promise.all([
        api<{ recordings: Session[] }>(`${base}/recordings`),
        api<{ recordings: Session[] }>(`${base}/recordings?recent=1`),
        api<{ members: Member[] }>(`${base}/reviews`),
      ]);
      setSessions(list.recordings ?? []);
      setRecent(recentList.recordings ?? []);
      setContinuesId((current) => current && !(recentList.recordings ?? []).some((recording) => recording.id === current) ? "" : current);
      setMembers(review.members ?? []);
    } finally { loadingRef.current = false; }
  }, [base]);

  useEffect(() => {
    let active = true;
    void cleanupLocalRecordings(userId).then(() => refresh()).catch(() => {
      if (active) setError("로컬 녹음 목록을 확인하지 못했습니다. 브라우저 저장소를 확인해 주세요.");
    });
    return () => { active = false; };
  }, [refresh, userId]);
  useEffect(() => {
    const onPageHide = () => { void controlRef.current?.interrupt("page_left"); };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      const control = controlRef.current;
      controlRef.current = null;
      if (control) void control.interrupt("page_left");
      if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
      if (meterTimerRef.current) clearInterval(meterTimerRef.current);
      profileStoreRef.current?.close();
      profileStoreRef.current = null;
      inputCleanupRef.current?.();
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock) void wakeLock.release().catch(() => {});
    };
  }, []);

  const requestWakeLock = useCallback(async (control: CaptureControl) => {
    if (wakeLockPendingRef.current || wakeLockRef.current || document.visibilityState !== "visible") return;
    if (!navigator.wakeLock) {
      setWakeNotice("화면 꺼짐 방지를 지원하지 않습니다. 기기가 잠기지 않게 확인해 주세요.");
      return;
    }
    wakeLockPendingRef.current = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (controlRef.current !== control) { await lock.release().catch(() => {}); return; }
      wakeLockRef.current = lock;
      setWakeNotice("");
      lock.addEventListener("release", () => {
        if (wakeLockRef.current === lock) {
          wakeLockRef.current = null;
          if (controlRef.current === control) setWakeNotice("화면 꺼짐 방지가 해제됐습니다. 녹음 상태를 확인해 주세요.");
        }
      }, { once: true });
    } catch {
      if (controlRef.current === control) setWakeNotice("화면 꺼짐 방지를 켜지 못했습니다. 기기가 잠기지 않게 확인해 주세요.");
    } finally { wakeLockPendingRef.current = false; }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && controlRef.current)
        void requestWakeLock(controlRef.current);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requestWakeLock]);

  function cleanupCapture() {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    inputCleanupRef.current?.();
    inputCleanupRef.current = null;
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (wakeLock) void wakeLock.release().catch(() => {});
    setLiveLevels([]);
  }

  async function flushProfile(id: string, control: CaptureControl, sampleCount: number) {
    if (profileFlushRef.current) return profileFlushRef.current;
    const store = profileStoreRef.current;
    if (!store) return;
    profileFlushRef.current = (async () => {
      try {
        await profileWriteRef.current;
        const health = control.health();
        await store.recordProfile(scope(id), control.profile().slice(0, Math.floor(sampleCount / RECORDING_RATE))
          .map((vector) => vector.map(quantizeRecordingLevel)), { ...health,
            microphone_reselects: microphoneReselectsRef.current });
      } finally {
        store.close();
        if (profileStoreRef.current === store) profileStoreRef.current = null;
      }
    })();
    return profileFlushRef.current;
  }

  const inspect = useCallback(async (id: string, key: CryptoKey) => {
    const store = await openRecordingStore(key);
    try {
      const info = await store.inspect(scope(id));
      setLocal(info);
      return info;
    }
    finally { store.close(); }
  }, [scope]);

  async function run(task: () => Promise<unknown>) {
    setBusy(true); setError(""); setMessage("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "녹음 작업을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function keyFor(id: string) {
    const result = await api<{ key: string }>(`${base}/recordings/${id}/key`, {});
    return importRecordingKey(result.key);
  }

  async function testInput() {
    if (!consent || !navigator.mediaDevices || !globalThis.MediaRecorder)
      throw new Error("참석자 동의와 브라우저 녹음 지원을 확인해 주세요.");
    // This five-second test stays in memory. Tracks stop before the user hears it.
    const inputs = await captureInputs(mode);
    let context: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let recorder: MediaRecorder | null = null;
    let meterTimer: ReturnType<typeof setInterval> | undefined;
    try {
      context = new AudioContext();
      await context.resume();
      destination = context.createMediaStreamDestination();
      const mix = context.createGain();
      mix.gain.value = 1 / inputs.length;
      mix.connect(destination);
      const analysers = inputs.map((input) => {
        const analyser = context!.createAnalyser();
        analyser.fftSize = 256;
        context!.createMediaStreamSource(input).connect(analyser).connect(mix);
        return analyser;
      });
      meterTimer = setInterval(() => setTestLevels(analysers.map((analyser) => {
        const values = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(values);
        return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
      })), 100);
      const chunks: Blob[] = [];
      const activeRecorder = new MediaRecorder(destination.stream);
      recorder = activeRecorder;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { if (activeRecorder.state !== "inactive") activeRecorder.stop(); }, 5000);
        activeRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        activeRecorder.onerror = () => { clearTimeout(timer); reject(new Error("입력 테스트를 완료하지 못했습니다.")); };
        activeRecorder.onstop = () => { clearTimeout(timer); resolve(); };
        activeRecorder.start();
      });
      const blob = new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" });
      if (!blob.size) throw new Error("소리가 담기지 않았습니다. 입력 장치를 다시 선택해 주세요.");
      if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
      const url = URL.createObjectURL(blob);
      testAudioRef.current = url;
      setTestAudio(url);
      setHeardTest(false);
      setMessage("5초 테스트를 들어 보고, 두 입력이 들리는지 확인해 주세요.");
    } finally {
      clearInterval(meterTimer);
      setTestLevels([]);
      if (recorder?.state === "recording") recorder.stop();
      destination?.stream.getTracks().forEach((track) => track.stop());
      stopInputs(inputs);
      await context?.close().catch(() => {});
    }
  }

  async function prepare() {
    if (!consent || !heardTest || !title.trim() || !globalThis.isSecureContext || !navigator.mediaDevices || !globalThis.AudioWorkletNode || !navigator.locks)
      throw new Error("동의·제목·보안 연결·녹음 지원 환경을 확인해 주세요.");
    const id = crypto.randomUUID();
    const input: ReviewRecordingStart = {
      id, title: title.trim(), input_method: mode, visibility, participants,
      consent_confirmed: true, meeting_provider: provider,
      continues_recording_id: continuesId || null,
    };
    const session = await api<Session>(`${base}/recordings`, input);
    try {
      const key = await keyFor(id);
      await probeRecordingStore(scope(id), key);
      keyRef.current = key;
      if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
      testAudioRef.current = null;
      setTestAudio(null);
      setSelected({ ...session, ...input, state: "active", started_at: new Date().toISOString(), state_reason: null });
      setLocal(null); setPrepared(true);
      setMessage("준비됐습니다. 다음 버튼에서 브라우저의 입력 장치를 선택하세요.");
      await refresh();
    } catch (cause) {
      await api(`${base}/recordings/${id}/discard`, {}).catch(() => {});
      throw cause;
    }
  }

  async function recover(session: Session) {
    setSelected(session); setPrepared(false); setSnapshot(null); setCaptureActive(false); setPartialAccepted(false); setSegments([]);
    try {
      const key = await keyFor(session.id);
      keyRef.current = key;
      const info = await inspect(session.id, key);
      if (!info) setMessage("이 기기의 확인 구간이 없습니다. 다른 기기에서 녹음했다면 그 기기에서 열거나 이 세션을 폐기해 주세요.");
      if (session.state === "saving") {
        const data = await api<{ segments: RecordingSegmentState[] }>(`${base}/reviews/${session.id}`);
        setSegments(data.segments ?? []);
      }
    } catch (cause) {
      keyRef.current = null;
      if (cause instanceof Error && cause.message === "recording_unavailable") await removeLocalRecording(scope(session.id));
      throw cause;
    }
  }

  async function begin() {
    if (!selected || !keyRef.current || !prepared || selected.state !== "active") return;
    // getDisplayMedia needs a fresh user gesture after the server/key/storage preparation.
    const inputs = await captureInputs(selected.input_method);
    try {
      // Source selection may take minutes; recheck consent and the org switch before writing any sample.
      const freshKey = await keyFor(selected.id);
      keyRef.current = freshKey;
      let latestSnapshot: RecordingSnapshot = { state: "recording", samples: 0, persistedSamples: 0, reason: null, warning: false };
      const control = await startRecording(scope(selected.id), inputs, freshKey, (next) => {
        latestSnapshot = next;
        setSnapshot(next);
        if (next.state === "interrupted" || next.state === "stopped") {
          const activeControl = controlRef.current;
          if (activeControl) void flushProfile(selected.id, activeControl, next.samples).catch(() =>
            setInputNotice("녹음 품질 정보를 보관하지 못했습니다. 확인 저장된 음성은 유지됩니다."));
          controlRef.current = null;
          setCaptureActive(false);
          cleanupCapture();
        }
      }, () => {
        setMicrophoneDisconnected(true);
        setInputNotice("마이크 연결이 끊겨 녹음을 일시정지했습니다. 마이크를 다시 선택해 주세요.");
      });
      controlRef.current = control;
      profileStoreRef.current = await openRecordingStore(freshKey);
      profileFlushRef.current = null;
      profileWriteRef.current = Promise.resolve();
      microphoneReselectsRef.current = 0;
      setCaptureActive(true);
      setMicrophoneDisconnected(false);
      setPrepared(false);
      setInputNotice("");
      const onDeviceChange = () => setInputNotice("입력 장치가 바뀌었습니다. 소리가 계속 들어오는지 확인해 주세요.");
      const onMute = () => setInputNotice("입력 소리가 잠시 끊겼습니다. 공유와 마이크 상태를 확인해 주세요.");
      const onUnmute = () => setInputNotice("입력 소리가 다시 연결됐습니다.");
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
      for (const input of inputs) for (const track of input.getAudioTracks()) {
        track.addEventListener("mute", onMute);
        track.addEventListener("unmute", onUnmute);
      }
      inputCleanupRef.current = () => {
        navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
        for (const input of inputs) for (const track of input.getAudioTracks()) {
          track.removeEventListener("mute", onMute);
          track.removeEventListener("unmute", onUnmute);
        }
      };
      let lastProfileSecond = 0;
      meterTimerRef.current = setInterval(() => {
        const levels = control.levels();
        setLiveLevels(levels);
        const vectors = control.profile();
        const seconds = Math.min(Math.floor(latestSnapshot.samples / RECORDING_RATE), vectors.length);
        if (seconds <= lastProfileSecond || !profileStoreRef.current) return;
        lastProfileSecond = seconds;
        const store = profileStoreRef.current;
        const bytes = vectors.slice(0, seconds).map((vector) => vector.map(quantizeRecordingLevel));
        const health = { ...control.health(), microphone_reselects: microphoneReselectsRef.current };
        profileWriteRef.current = profileWriteRef.current.then(() => store.recordProfile(scope(selected.id), bytes, health));
        void profileWriteRef.current.catch(() => { void control.interrupt("profile_storage_failed"); });
      }, 250);
      await requestWakeLock(control);
      setMessage("녹음 중입니다. 확인 저장된 길이를 보면서 진행해 주세요.");
    } catch (cause) {
      if (controlRef.current) await controlRef.current.interrupt("recording_setup_failed");
      stopInputs(inputs);
      throw cause;
    }
  }

  async function reselectMicrophone() {
    if (!selected || !controlRef.current) return;
    await keyFor(selected.id);
    const microphone = await captureMicrophone(selected.input_method);
    try {
      await controlRef.current.replaceMicrophone(microphone);
      microphoneReselectsRef.current++;
      setMicrophoneDisconnected(false);
      setInputNotice("마이크를 다시 연결했습니다. 입력 미터를 확인한 뒤 녹음을 재개해 주세요.");
    } catch (cause) { stopInputs([microphone]); throw cause; }
  }

  async function stop() {
    if (!selected || !controlRef.current) return;
    const control = controlRef.current;
    await control.stop();
    await flushProfile(selected.id, control, snapshot?.samples ?? 0).catch(() =>
      setInputNotice("녹음 품질 정보를 보관하지 못했습니다. 확인 저장된 음성은 유지됩니다."));
    controlRef.current = null;
    setCaptureActive(false);
    cleanupCapture();
    if (keyRef.current) await inspect(selected.id, keyRef.current);
    setMessage("녹음을 마쳤습니다. 이 기기의 확인 구간을 서버에 저장할 수 있습니다.");
  }

  async function upload() {
    if (!selected || !keyRef.current) return;
    const store = await openRecordingStore(keyRef.current);
    try {
      const info = await store.inspect(scope(selected.id));
      if (!info || info.samples < 1) throw new Error("저장할 확인 구간이 없습니다.");
      if (info.partial && !partialAccepted) throw new Error("끊긴 구간을 확인하고 부분 기록 저장에 동의해 주세요.");
      const { manifest } = await prepareRecordingOriginalManifest(store.read(scope(selected.id)), info.samples);
      const levels = encodeRecordingLevels(info.levelVectors);
      const saved = await api<RecordingSaveResult>(`${base}/recordings/${selected.id}/save`, {
        manifest, capture: { paused: info.paused, interrupted: info.interrupted || info.partial,
          captured_samples: Math.max(info.expectedSamples, info.samples), levels,
          clipping_ratio: info.captureHealth.clipping_ratio,
          health: {
            checkpoint_delays: info.captureHealth.checkpoint_delays,
            max_pending_samples: info.captureHealth.max_pending_samples,
            backlog_stops: info.captureHealth.backlog_stops,
            max_sample_wall_gap_ms: info.captureHealth.max_sample_wall_gap_ms,
            microphone_reselects: info.captureHealth.microphone_reselects,
          } },
      });
      setSelected({ ...selected, state: saved.state });
      setSegments(saved.segments);
      if (saved.state === "completed") { await store.remove(scope(selected.id)); router.push(`/d/${deptId}/reviews/${selected.id}`); return; }
      const storage = createBrowserSupabaseClient().storage.from("review-materials");
      for await (const file of streamRecordingOriginals(store.read(scope(selected.id)))) {
        const target = saved.segments.find((segment) => segment.index === file.descriptor.index);
        if (!target || target.status === "verified" || target.status === "verifying") continue;
        setMessage(`원본 구간 저장 중 · ${file.descriptor.index + 1}/${manifest.segments.length}`);
        const result = await storage.upload(target.path, new Blob([file.wav], { type: "audio/wav" }), {
          contentType: "audio/wav", upsert: false,
        });
        if (result.error && !["409", "Duplicate"].includes(String(result.error.statusCode)))
          throw new Error(`${file.descriptor.index + 1}번째 구간을 보관하지 못했습니다. 다시 저장하면 이어서 올립니다.`);
      }
      const finalized = await api<RecordingSaveResult>(`${base}/recordings/${selected.id}/finalize`, {});
      setSegments(finalized.segments);
      setMessage("원본 검증 중입니다. 모든 구간이 확인되면 검토 화면으로 이동합니다.");
    } finally { store.close(); }
  }

  async function discard(session: Session) {
    if (!window.confirm(`‘${session.title}’ 녹음과 이 기기의 확인 구간을 폐기할까요?`)) return;
    await api(`${base}/recordings/${session.id}/discard`, {});
    await removeLocalRecording(scope(session.id));
    if (selected?.id === session.id) { keyRef.current = null; controlRef.current = null; cleanupCapture(); setCaptureActive(false); setSelected(null); setLocal(null); }
    await refresh();
  }

  const selectedId = selected?.id;
  const selectedState = selected?.state;
  useEffect(() => {
    if (!selectedId || selectedState !== "saving") return;
    let active = true;
    const id = selectedId;
    const timer = setInterval(() => {
      void api<{ recording: Session }>(`${base}/recordings/${id}`).then(async ({ recording }) => {
        if (!active) return;
        setSelected(recording);
        if (recording.state === "completed") {
          await removeLocalRecording(scope(id));
          router.push(`/d/${deptId}/reviews/${id}`);
        } else if (recording.state === "saving") {
          const detail = await api<{ segments: RecordingSegmentState[] }>(`${base}/reviews/${id}`);
          if (active) setSegments(detail.segments ?? []);
        }
      }).catch(() => { if (active) setError("원본 확인 상태를 읽지 못했습니다. 다시 확인해 주세요."); });
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedId, selectedState, base, deptId, router, scope]);

  const capturing = captureActive && snapshot && ["recording", "paused", "stopping"].includes(snapshot.state);
  return <main className="workspace-page review-workspace meeting-recorder">
    <header className="page-heading"><div><Link href={`/d/${deptId}/reviews`}>← 올린 자료 확인</Link><p className="eyebrow">회의 녹음</p><h1>소리를 확인하고 녹음하세요</h1><p>녹음은 먼저 이 기기에 암호화해 저장합니다. 저장 요청 전에는 음성을 서버에 보내지 않습니다.</p></div></header>
    {error && <p className="review-notice" role="alert">{error}</p>}
    {message && <p className="review-notice" role="status">{message}</p>}
    {!selected && <section className="panel" aria-label="새 회의 녹음">
      <h2>새 녹음</h2>
      <label>회의 제목 <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
      <fieldset><legend>녹음 방식</legend><label><input type="radio" checked={mode === "microphone"} onChange={() => { setMode("microphone"); setHeardTest(false); }} /> 마이크</label><label><input type="radio" checked={mode === "system_and_microphone"} onChange={() => { setMode("system_and_microphone"); setHeardTest(false); }} /> 컴퓨터 소리 + 마이크</label></fieldset>
      <label>회의 출처 <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="in_person">대면 회의</option><option value="meet">Google Meet</option><option value="zoom">Zoom</option><option value="other">기타</option></select></label>
      <label>이어서 녹음 <select value={continuesId} onChange={(event) => setContinuesId(event.target.value)}><option value="">새 회의 기록</option>{recent.map((recording) => <option key={recording.id} value={recording.id}>{recording.title} · {new Date(recording.started_at).toLocaleString("ko-KR")}</option>)}</select></label>
      <label>확정 후 볼 수 있는 사람 <select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="leads_only">팀장만</option><option value="dept">부서 멤버</option></select></label>
      <fieldset><legend>동의한 참석자</legend>{members.map((member) => <label key={member.user_id}><input type="checkbox" checked={participants.includes(member.user_id)} disabled={member.user_id === userId} onChange={(event) => setParticipants((current) => event.target.checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))} /> {member.display_name}{member.user_id === userId ? " (녹음자)" : ""}</label>)}</fieldset>
      <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> 참석자 전원 녹음 동의를 확인했고, 이 기기의 임시 보관과 비공개 원본 보관을 확인했습니다.</label>
      <p className="field-help">30분까지 녹음할 수 있습니다. 온라인 회의는 공유 창에서 오디오 공유를 선택하세요. 시스템 소리는 알림 등 다른 앱 소리도 담길 수 있습니다.</p>
      <button type="button" className="button button-secondary" disabled={busy || !consent} onClick={() => void run(testInput)}>5초 테스트 녹음</button>
      {testLevels.map((level, index) => <p key={index}>{mode === "microphone" ? "마이크" : index === 0 ? "컴퓨터 소리" : "마이크"} 입력 <meter min={0} max={0.3} value={Math.min(0.3, level)} /> {level < 0.002 ? "소리 확인 필요" : "입력 감지"}</p>)}
      {testAudio && <><p>입력 테스트 재생</p><audio controls src={testAudio} preload="metadata" /><label><input type="checkbox" checked={heardTest} onChange={(event) => setHeardTest(event.target.checked)} /> 테스트를 듣고 필요한 입력이 모두 들리는지 확인했습니다.</label></>}
      <button type="button" className="button button-primary" disabled={busy || !consent || !heardTest || !title.trim()} onClick={() => void run(prepare)}>녹음 준비</button>
    </section>}
    {selected && <section className="panel" aria-label="현재 녹음">
      <h2>{selected.title}</h2><p>서버 상태: {selected.state === "active" ? "녹음 준비·로컬 보관" : selected.state === "saving" ? "서버 저장·검증 중" : selected.state}</p>
      {snapshot && <p role="status">{snapshot.state === "recording" ? "녹음 중" : snapshot.state === "paused" ? "잠시 멈춤" : snapshot.state === "interrupted" ? "중단됨" : "녹음 종료"} · 녹음 {time(snapshot.samples)} / 30:00 · 이 기기에 확인 저장 {time(snapshot.persistedSamples)}{snapshot.warning ? " · 29분 경고" : ""}</p>}
      {liveLevels.map((level, index) => <p key={index}>{selected.input_method === "microphone" ? "마이크" : index === 0 ? "컴퓨터 소리" : "마이크"} 입력 <meter min={0} max={0.3} value={Math.min(0.3, level)} /> {level < 0.002 ? "소리 확인 필요" : "입력 감지"}</p>)}
      {inputNotice && <p role="status">{inputNotice}</p>}
      {microphoneDisconnected && capturing && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(reselectMicrophone)}>마이크 다시 선택</button>}
      {wakeNotice && <p role="status">{wakeNotice}</p>}
      {snapshot?.reason && <p role="alert">녹음 중단 사유: {snapshot.reason}. 확인 저장된 구간만 복구합니다.</p>}
      {prepared && <button className="button button-primary" type="button" disabled={busy} onClick={() => void run(begin)}>입력 장치 선택하고 녹음 시작</button>}
      {capturing && <><button className="button button-secondary" type="button" disabled={busy || microphoneDisconnected} onClick={() => { if (snapshot.state === "paused") controlRef.current?.resume(); else controlRef.current?.pause(); }}>{snapshot.state === "paused" ? "녹음 다시 시작" : "녹음 잠시 멈추기"}</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void run(stop)}>녹음 종료</button></>}
      {(snapshot?.state === "interrupted" || snapshot?.state === "stopped") && !local && <button className="button button-secondary" type="button" disabled={busy} onClick={() => keyRef.current && void run(() => inspect(selected.id, keyRef.current!))}>확인 구간 보기</button>}
      {local && <><p>이 기기의 연속 확인 구간: {time(local.samples)}{local.partial ? ` · 원래 기록 ${time(local.expectedSamples)} 중 일부만 남았습니다.` : ""}{local.interrupted ? " · 중단된 녹음" : ""}</p>{local.partial && <label><input type="checkbox" checked={partialAccepted} onChange={(event) => setPartialAccepted(event.target.checked)} /> 빠진 구간 뒤의 소리는 포함되지 않으며, 표시된 확인 구간만 저장합니다.</label>}<button className="button button-primary" type="button" disabled={busy || !!capturing || local.samples < 1 || (local.partial && !partialAccepted)} onClick={() => void run(upload)}>음성 저장하고 받아쓰기</button></>}
      {selected.state === "saving" && <><p>원본 확인: {segments.filter((segment) => segment.status === "verified").length}/{segments.length} 구간</p>{segments.some((segment) => segment.status === "failed" || segment.status === "awaiting_upload") && <button type="button" className="button button-secondary" disabled={busy || !local} onClick={() => void run(upload)}>남은 구간 다시 올리기</button>}</>}
      {!capturing && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(() => discard(selected))}>녹음 폐기</button>}
    </section>}
    <section className="panel" aria-label="복구할 녹음"><h2>이어서 저장할 녹음</h2><button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(refresh)}>목록 다시 확인</button>{sessions.length === 0 ? <p>진행 중인 녹음이 없습니다.</p> : <ul>{sessions.map((session) => <li key={session.id}><strong>{session.title}</strong> · {session.state === "active" ? "이 기기의 기록 확인 필요" : "서버 검증 중"} · 만료 {new Date(session.expires_at).toLocaleString("ko-KR")} <button type="button" disabled={busy || !!capturing} onClick={() => void run(() => recover(session))}>녹음 이어서 확인</button> <button type="button" disabled={busy || !!capturing} onClick={() => void run(() => discard(session))}>녹음 폐기</button></li>)}</ul>}</section>
  </main>;
}
