"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RecordingSaveResult, RecordingSegmentState, ReviewRecordingStart } from "@/lib/contracts";
import { captureInputs, captureMicrophone, stopInputs } from "@/lib/recording/browser/inputs";
import { startRecording } from "@/lib/recording/browser/capture";
import {
  cleanupLocalRecordings, openRecordingStore, probeRecordingStore, removeLocalRecording,
  type RecordingScope,
} from "@/lib/recording/browser/storage";
import { prepareRecordingOriginalManifest, streamRecordingOriginals } from "@/lib/recording/original-segments";
import { RECORDING_RATE } from "@/lib/recording/pcm";
import { formatExpiry, missingStartConditions, missingTestConditions, recorderErrorText, recorderStage, recorderTabTitle, sessionStateLabel, signalDetected, stopReasonNotice } from "@/lib/recording/recorder-copy";
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
type RecorderPanel = "form" | "session" | "list";
const subscribeBrowserReady = () => () => {};
const browserReadySnapshot = () => true;
const serverReadySnapshot = () => false;

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

function rememberLevels(history: number[][], levels: number[]) {
  levels.forEach((level, index) => {
    const recent = history[index] ?? [];
    recent.push(level);
    if (recent.length > 15) recent.shift();
    history[index] = recent;
  });
  history.length = levels.length;
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
  const [testDetected, setTestDetected] = useState<boolean[]>([]);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);
  const [liveDetected, setLiveDetected] = useState<boolean[]>([]);
  const [inputNotice, setInputNotice] = useState("");
  const [microphoneDisconnected, setMicrophoneDisconnected] = useState(false);
  const [wakeNotice, setWakeNotice] = useState("");
  const [heardTest, setHeardTest] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [snapshot, setSnapshot] = useState<RecordingSnapshot | null>(null);
  const [captureActive, setCaptureActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errorPanel, setErrorPanel] = useState<RecorderPanel>("form");
  const [message, setMessage] = useState("");
  const [navigationNotice, setNavigationNotice] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const browserReady = useSyncExternalStore(subscribeBrowserReady, browserReadySnapshot, serverReadySnapshot);
  const interruptionTitleRef = useRef(false);
  const interruptionReasonRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const baseTitleRef = useRef<string | null>(null);
  const dismissedInterruptionRef = useRef<string | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const controlRef = useRef<CaptureControl | null>(null);
  const loadingRef = useRef(false);
  const testAudioRef = useRef<string | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const testLevelHistoryRef = useRef<number[][]>([]);
  const liveLevelHistoryRef = useRef<number[][]>([]);
  const inputCleanupRef = useRef<(() => void) | null>(null);
  const profileStoreRef = useRef<Awaited<ReturnType<typeof openRecordingStore>> | null>(null);
  const profileWriteRef = useRef<Promise<void>>(Promise.resolve());
  const profileFlushRef = useRef<Promise<void> | null>(null);
  const microphoneReselectsRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockPendingRef = useRef(false);
  const scope = useCallback((id: string): RecordingScope => ({ ownerUserId: userId, deptId, recordingId: id }), [userId, deptId]);

  useEffect(() => {
    baseTitleRef.current = document.title;
    return () => { if (baseTitleRef.current !== null) document.title = baseTitleRef.current; };
  }, []);

  useEffect(() => { if (error !== null) errorRef.current?.focus(); }, [error, errorPanel]);

  useEffect(() => {
    if (!confirmStop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setConfirmStop(false); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmStop]);

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
    setLiveDetected([]);
    liveLevelHistoryRef.current = [];
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

  async function run(panel: RecorderPanel, task: () => Promise<unknown>) {
    setBusy(true); setError(null); setErrorPanel(panel); setMessage("");
    try { await task(); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  function selectMode(next: ReviewRecordingStart["input_method"]) {
    if (mode === next || busy || starting) return;
    setMode(next);
    setHeardTest(false);
    if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
    testAudioRef.current = null;
    setTestAudio(null);
    setTestLevels([]);
    setTestDetected([]);
    testLevelHistoryRef.current = [];
    setMessage("");
  }

  async function keyFor(id: string) {
    const result = await api<{ key: string }>(`${base}/recordings/${id}/key`, {});
    return importRecordingKey(result.key);
  }

  async function testInput() {
    if (!consent || !navigator.mediaDevices || !globalThis.MediaRecorder)
      throw new Error("참석자 동의와 브라우저 녹음 지원을 확인해 주세요.");
    // This five-second test stays in memory. Tracks stop before the user hears it.
    testLevelHistoryRef.current = [];
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
      meterTimer = setInterval(() => {
        const levels = analysers.map((analyser) => {
          const values = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(values);
          return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
        });
        rememberLevels(testLevelHistoryRef.current, levels);
        setTestLevels(levels);
        setTestDetected(testLevelHistoryRef.current.map((recent) => signalDetected(recent)));
      }, 100);
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
      setMessage(mode === "microphone" ? "5초 테스트를 들어 보고, 내 목소리가 들리는지 확인해 주세요." : "5초 테스트를 들어 보고, 컴퓨터 소리와 내 목소리가 모두 들리는지 확인해 주세요.");
    } finally {
      clearInterval(meterTimer);
      setTestLevels([]);
      setTestDetected([]);
      testLevelHistoryRef.current = [];
      if (recorder?.state === "recording") recorder.stop();
      destination?.stream.getTracks().forEach((track) => track.stop());
      stopInputs(inputs);
      await context?.close().catch(() => {});
    }
  }

  async function recover(session: Session) {
    dismissedInterruptionRef.current = null;
    setSelected(session); setSnapshot(null); setCaptureActive(false); setPartialAccepted(false); setSegments([]);
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

  async function start() {
    dismissedInterruptionRef.current = null;
    const missing = missingStartConditions({
      consent, heardTest, title,
      supported: !!(navigator.mediaDevices && globalThis.AudioWorkletNode && navigator.locks),
      secure: globalThis.isSecureContext,
    });
    if (missing.length) throw new Error(missing[0]);
    setStarting(true);
    let inputs: MediaStream[] = [];
    let sessionId: string | null = null;
    let sessionCreated = false;
    let control: CaptureControl | null = null;
    try {
      // Capture permission must be requested while the click's user gesture is active.
      inputs = await captureInputs(mode);
      const id = crypto.randomUUID();
      sessionId = id;
      const input: ReviewRecordingStart = {
        id, title: title.trim(), input_method: mode, visibility, participants,
        consent_confirmed: true, meeting_provider: provider,
        continues_recording_id: continuesId || null,
      };
      const session = await api<Session>(`${base}/recordings`, input);
      sessionCreated = true;
      const key = await keyFor(id);
      await probeRecordingStore(scope(id), key);
      let latestSnapshot: RecordingSnapshot = { state: "recording", samples: 0, persistedSamples: 0, reason: null, warning: false };
      const activeControl = await startRecording(scope(id), inputs, key, (next) => {
        latestSnapshot = next;
        setSnapshot(next);
        if (next.state === "interrupted" || next.state === "stopped") {
          const activeControl = controlRef.current;
          if (activeControl) void flushProfile(id, activeControl, next.samples).catch(() =>
            setInputNotice("녹음 품질 정보를 보관하지 못했습니다. 확인 저장된 음성은 유지됩니다."));
          controlRef.current = null;
          setCaptureActive(false);
          cleanupCapture();
        }
      }, () => {
        setMicrophoneDisconnected(true);
        setInputNotice("마이크 연결이 끊겨 녹음을 일시정지했습니다. 마이크를 다시 선택해 주세요.");
      });
      control = activeControl;
      controlRef.current = activeControl;
      profileStoreRef.current = await openRecordingStore(key);
      profileFlushRef.current = null;
      profileWriteRef.current = Promise.resolve();
      microphoneReselectsRef.current = 0;
      keyRef.current = key;
      if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
      testAudioRef.current = null;
      setTestAudio(null);
      setSelected({ ...session, ...input, state: "active", started_at: new Date().toISOString(), state_reason: null });
      setLocal(null);
      setCaptureActive(true);
      liveLevelHistoryRef.current = [];
      setMicrophoneDisconnected(false);
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
        const levels = activeControl.levels();
        rememberLevels(liveLevelHistoryRef.current, levels);
        setLiveLevels(levels);
        setLiveDetected(liveLevelHistoryRef.current.map((recent) => signalDetected(recent)));
        const vectors = activeControl.profile();
        const seconds = Math.min(Math.floor(latestSnapshot.samples / RECORDING_RATE), vectors.length);
        if (seconds <= lastProfileSecond || !profileStoreRef.current) return;
        lastProfileSecond = seconds;
        const store = profileStoreRef.current;
        const bytes = vectors.slice(0, seconds).map((vector) => vector.map(quantizeRecordingLevel));
        const health = { ...activeControl.health(), microphone_reselects: microphoneReselectsRef.current };
        profileWriteRef.current = profileWriteRef.current.then(() => store.recordProfile(scope(id), bytes, health));
        void profileWriteRef.current.catch(() => { void activeControl.interrupt("profile_storage_failed"); });
      }, 100);
      await requestWakeLock(activeControl);
      setMessage("녹음 중입니다. 확인 저장된 길이를 보면서 진행해 주세요.");
      void refresh().catch(() => setInputNotice("녹음 목록을 새로 읽지 못했습니다. 녹음은 계속됩니다."));
    } catch (cause) {
      if (control) await control.interrupt("recording_setup_failed").catch(() => {});
      stopInputs(inputs);
      cleanupCapture();
      await profileWriteRef.current.catch(() => {});
      profileStoreRef.current?.close();
      profileStoreRef.current = null;
      controlRef.current = null;
      keyRef.current = null;
      setCaptureActive(false);
      setSnapshot(null);
      setSelected(null);
      if (sessionCreated && sessionId) {
        await api(`${base}/recordings/${sessionId}/discard`, {}).catch(() => {});
        await removeLocalRecording(scope(sessionId)).catch(() => {});
      }
      throw cause;
    } finally {
      setStarting(false);
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

  function showNewRecordingForm() {
    if (controlRef.current) return;
    keyRef.current = null;
    setSelected(null);
    setLocal(null);
    setSegments([]);
    setSnapshot(null);
    setCaptureActive(false);
    setPartialAccepted(false);
    setConfirmStop(false);
    setInputNotice("");
    setWakeNotice("");
    setError(null);
    setMessage("");
    setTitle("");
    setContinuesId("");
    setConsent(false);
    setHeardTest(false);
    if (testAudioRef.current) URL.revokeObjectURL(testAudioRef.current);
    testAudioRef.current = null;
    setTestAudio(null);
    setTestLevels([]);
    setTestDetected([]);
    testLevelHistoryRef.current = [];
    void refresh().catch(() => { setErrorPanel("list"); setError("녹음 목록을 새로 읽지 못했습니다. 다시 확인해 주세요."); });
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
      }).catch(() => { if (active) { setErrorPanel("session"); setError("원본 확인 상태를 읽지 못했습니다. 다시 확인해 주세요."); } });
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedId, selectedState, base, deptId, router, scope]);

  const capturing = captureActive && snapshot && ["recording", "paused", "stopping"].includes(snapshot.state);
  const stage = recorderStage({ selected: !!selected, starting, snapshotState: snapshot?.state ?? null, sessionState: selected?.state ?? null });
  const currentStep = stage === "setup" ? 1 : stage === "starting" || stage === "recording" || stage === "paused" ? 2 : 3;
  const testSupported = browserReady && !!(navigator.mediaDevices && globalThis.MediaRecorder);
  const startSupported = browserReady && !!(navigator.mediaDevices && globalThis.AudioWorkletNode && navigator.locks);
  const secure = browserReady && window.isSecureContext;
  const testBlockers = browserReady ? [...missingTestConditions({ consent, supported: testSupported }), ...(busy || starting ? ["현재 작업이 끝날 때까지 기다려 주세요."] : [])] : ["브라우저 기능을 확인하고 있습니다."];
  const startBlockers = browserReady ? [...missingStartConditions({ consent, heardTest, title, supported: startSupported, secure }), ...(busy || starting ? ["현재 작업이 끝날 때까지 기다려 주세요."] : [])] : ["브라우저 기능을 확인하고 있습니다."];
  const otherSessions = sessions.filter((session) => session.id !== selected?.id);
  const recordedSeconds = Math.floor((snapshot?.samples ?? 0) / RECORDING_RATE);
  const storageDelay = Math.max(0, Math.floor(((snapshot?.samples ?? 0) - (snapshot?.persistedSamples ?? 0)) / RECORDING_RATE));
  const storageDelayed = !!capturing && storageDelay >= 3;
  const stopNotice = snapshot?.reason ? stopReasonNotice(snapshot.reason) : null;

  useEffect(() => {
    if (!capturing) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || link.getAttribute("target")) return;
      if (new URL(link.href, location.href).origin !== location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setNavigationNotice(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
      setNavigationNotice(false);
    };
  }, [capturing]);

  useEffect(() => {
    const baseTitle = baseTitleRef.current;
    if (baseTitle === null) return;
    if (snapshot?.reason && snapshot.reason !== "duration_limit" && snapshot.state === "interrupted" && dismissedInterruptionRef.current !== snapshot.reason) {
      document.title = recorderTabTitle("interrupted", recordedSeconds, baseTitle);
      interruptionTitleRef.current = true;
      interruptionReasonRef.current = snapshot.reason;
    } else if (stage === "recording" || stage === "paused") {
      document.title = recorderTabTitle(stage, recordedSeconds, baseTitle);
      interruptionTitleRef.current = false;
    } else if (!interruptionTitleRef.current || dismissedInterruptionRef.current === snapshot?.reason) {
      document.title = baseTitle;
    }
  }, [stage, recordedSeconds, snapshot?.reason, snapshot?.state]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && interruptionTitleRef.current) {
        dismissedInterruptionRef.current = interruptionReasonRef.current;
        if (baseTitleRef.current !== null) document.title = baseTitleRef.current;
        interruptionTitleRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const statusAnnouncement = starting ? "녹음 준비 중" : snapshot?.state === "recording" ? "녹음 중" : snapshot?.state === "paused" ? "녹음을 잠시 멈췄습니다" : snapshot?.state === "interrupted" ? "녹음이 중단됐습니다" : snapshot?.state === "stopped" ? "녹음을 마쳤습니다" : "";
  return <main className="workspace-page review-workspace meeting-recorder">
    <header className="page-heading"><div><Link href={`/d/${deptId}/reviews`}>← 올린 자료 확인</Link><p className="eyebrow">회의 녹음</p><h1>소리를 확인하고 녹음하세요</h1><p>녹음은 먼저 이 기기에 암호화해 저장합니다. 저장 요청 전에는 음성을 서버에 보내지 않습니다.</p></div></header>
    <ol className="recorder-steps" aria-label="녹음 단계">
      <li aria-current={currentStep === 1 ? "step" : undefined}><span>1</span> 입력 확인</li>
      <li aria-current={currentStep === 2 ? "step" : undefined}><span>2</span> 녹음</li>
      <li aria-current={currentStep === 3 ? "step" : undefined}><span>3</span> 저장</li>
    </ol>
    {navigationNotice && <p className="recorder-notice is-warning"><strong>주의</strong> 녹음 중에는 다른 화면으로 이동하지 않습니다. 녹음을 끝낸 뒤 이동해 주세요.</p>}
    {message && <p className="recorder-notice">{message}</p>}
    <p className="recorder-live-status" role="status">{statusAnnouncement}{storageDelayed ? " · 이 기기 저장이 늦어지고 있습니다" : ""}</p>
    {!selected && <section className="panel" aria-label="새 회의 녹음">
      <h2>새 녹음</h2>
      {error !== null && errorPanel === "form" && <p className="recorder-notice is-error" role="alert" tabIndex={-1} ref={errorRef}><strong>오류</strong> {recorderErrorText(error)}</p>}
      {starting && <p className="recorder-stage-chip">녹음 준비 중</p>}
      <label>회의 제목 <input value={title} maxLength={120} disabled={starting} onChange={(event) => setTitle(event.target.value)} /></label>
      <fieldset disabled={starting || busy}><legend>녹음 방식</legend><label><input type="radio" name="recording-mode" checked={mode === "microphone"} onChange={() => selectMode("microphone")} /> 마이크</label><label><input type="radio" name="recording-mode" checked={mode === "system_and_microphone"} onChange={() => selectMode("system_and_microphone")} /> 컴퓨터 소리 + 마이크</label></fieldset>
      <label>회의 출처 <select value={provider} disabled={starting} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="in_person">대면 회의</option><option value="meet">Google Meet</option><option value="zoom">Zoom</option><option value="other">기타</option></select></label>
      <label>이어서 녹음 <select value={continuesId} disabled={starting} onChange={(event) => setContinuesId(event.target.value)}><option value="">새 회의 기록</option>{recent.map((recording) => <option key={recording.id} value={recording.id}>{recording.title} · {new Date(recording.started_at).toLocaleString("ko-KR")}</option>)}</select></label>
      <label>확정 후 볼 수 있는 사람 <select value={visibility} disabled={starting} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="leads_only">팀장만</option><option value="dept">부서 멤버</option></select></label>
      <fieldset disabled={starting}><legend>동의한 참석자</legend>{members.map((member) => <label key={member.user_id}><input type="checkbox" checked={participants.includes(member.user_id)} disabled={member.user_id === userId} onChange={(event) => setParticipants((current) => event.target.checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))} /> {member.display_name}{member.user_id === userId ? " (녹음자)" : ""}</label>)}</fieldset>
      <label><input type="checkbox" checked={consent} disabled={starting} onChange={(event) => setConsent(event.target.checked)} /> 참석자 전원 녹음 동의를 확인했고, 이 기기의 임시 보관과 비공개 원본 보관을 확인했습니다.</label>
      <p className="field-help">30분까지 녹음할 수 있습니다. 온라인 회의는 공유 창에서 오디오 공유를 선택하세요. 시스템 소리는 알림 등 다른 앱 소리도 담길 수 있습니다.</p>
      <button type="button" className="button button-secondary" disabled={testBlockers.length > 0} aria-describedby={testBlockers.length ? "recorder-test-blockers" : undefined} onClick={() => void run("form", testInput)}>5초 테스트 녹음</button>
      {testBlockers.length > 0 && <ul id="recorder-test-blockers" className="recorder-blockers">{testBlockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      {testLevels.map((level, index) => { const inputName = mode === "microphone" || index === 1 ? "마이크" : "컴퓨터 소리"; return <p key={index}>{inputName} 입력 <meter aria-label={`${inputName} 입력 크기`} min={0} max={0.3} value={Math.min(0.3, level)} /> {testDetected[index] ? "입력 감지" : "소리 확인 필요"}</p>; })}
      {testAudio && <><p>입력 테스트 재생</p><audio controls src={testAudio} preload="metadata" /><label><input type="checkbox" checked={heardTest} disabled={starting} onChange={(event) => setHeardTest(event.target.checked)} /> 테스트를 듣고 필요한 입력이 모두 들리는지 확인했습니다.</label></>}
      <button type="button" className="button button-primary" disabled={startBlockers.length > 0} aria-describedby={startBlockers.length ? "recorder-start-blockers" : undefined} onClick={() => void run("form", start)}>녹음 시작</button>
      {startBlockers.length > 0 && <ul id="recorder-start-blockers" className="recorder-blockers">{startBlockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    </section>}
    {selected && <section className="panel" aria-label="현재 녹음">
      <h2>{selected.title}</h2><p>서버 상태: {sessionStateLabel(selected.state)}</p>
      {error !== null && errorPanel === "session" && <p className="recorder-notice is-error" role="alert" tabIndex={-1} ref={errorRef}><strong>오류</strong> {recorderErrorText(error)}</p>}
      {snapshot && <div className="recorder-progress">
        <div className="recorder-stage-row"><span className="recorder-stage-chip">{snapshot.state === "recording" || snapshot.state === "stopping" ? "녹음 중" : snapshot.state === "paused" ? "잠시 멈춤" : snapshot.state === "interrupted" ? "녹음 중단" : "녹음 종료"}</span>{snapshot.warning && <span className="recorder-notice is-warning"><strong>주의</strong> 29분이 지났습니다. 곧 녹음이 끝납니다.</span>}</div>
        <p className="recorder-timer" role="timer" aria-live="off">{time(snapshot.samples)} <span>/ 30:00</span></p>
        <p className="recorder-persisted">이 기기에 저장됨 {time(snapshot.persistedSamples)}</p>
        {storageDelayed && <p className="recorder-notice is-warning"><strong>주의</strong> 이 기기 저장이 {storageDelay}초 늦어지고 있습니다.</p>}
      </div>}
      {liveLevels.map((level, index) => { const inputName = selected.input_method === "microphone" || index === 1 ? "마이크" : "컴퓨터 소리"; return <p key={index}>{inputName} 입력 <meter aria-label={`${inputName} 입력 크기`} min={0} max={0.3} value={Math.min(0.3, level)} /> {liveDetected[index] ? "입력 감지" : "소리 확인 필요"}</p>; })}
      {inputNotice && <p className="recorder-notice is-warning"><strong>주의</strong> {inputNotice}</p>}
      {microphoneDisconnected && capturing && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run("session", reselectMicrophone)}>마이크 다시 선택</button>}
      {wakeNotice && <p className="recorder-notice is-warning"><strong>주의</strong> {wakeNotice}</p>}
      {stopNotice && <p className={`recorder-notice${stopNotice.tone === "warning" ? " is-warning" : ""}`} role={stopNotice.tone === "warning" ? "alert" : "status"}><strong>{stopNotice.tone === "warning" ? "주의" : "안내"}</strong> {stopNotice.text}</p>}
      {capturing && <div className="recorder-controls"><button className="button button-primary" type="button" disabled={busy || microphoneDisconnected} onClick={() => { setConfirmStop(false); if (snapshot.state === "paused") controlRef.current?.resume(); else controlRef.current?.pause(); }}>{snapshot.state === "paused" ? "녹음 다시 시작" : "녹음 잠시 멈추기"}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirmStop(true)}>녹음 종료</button></div>}
      {capturing && confirmStop && <div className="recorder-stop-confirm" role="group" aria-label="녹음 종료 확인"><p>녹음을 끝낼까요? 끝내면 이 녹음은 이어서 할 수 없고 저장만 할 수 있습니다.</p><div className="recorder-controls"><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setConfirmStop(false); void run("session", stop); }}>녹음 끝내기</button><button className="button button-primary" type="button" disabled={busy} onClick={() => setConfirmStop(false)}>계속 녹음</button></div></div>}
      {(snapshot?.state === "interrupted" || snapshot?.state === "stopped") && !local && <button className="button button-secondary" type="button" disabled={busy} onClick={() => keyRef.current && void run("session", () => inspect(selected.id, keyRef.current!))}>확인 구간 보기</button>}
      {local && <><p>이 기기의 연속 확인 구간: {time(local.samples)}{local.partial ? ` · 원래 기록 ${time(local.expectedSamples)} 중 일부만 남았습니다.` : ""}{local.interrupted ? " · 중단된 녹음" : ""}</p>{local.partial && <label><input type="checkbox" checked={partialAccepted} onChange={(event) => setPartialAccepted(event.target.checked)} /> 빠진 구간 뒤의 소리는 포함되지 않으며, 표시된 확인 구간만 저장합니다.</label>}<button className="button button-primary" type="button" disabled={busy || !!capturing || local.samples < 1 || (local.partial && !partialAccepted)} onClick={() => void run("session", upload)}>음성 저장하고 받아쓰기</button></>}
      {selected.state === "saving" && <><p>원본 확인: {segments.filter((segment) => segment.status === "verified").length}/{segments.length} 구간</p>{segments.some((segment) => segment.status === "failed" || segment.status === "awaiting_upload") && <button type="button" className="button button-secondary" disabled={busy || !local} onClick={() => void run("session", upload)}>남은 구간 다시 올리기</button>}</>}
      {!capturing && !starting && <button type="button" className="button button-secondary" disabled={busy} onClick={showNewRecordingForm}>새 녹음 화면으로</button>}
      {!capturing && <div className="recorder-danger-zone"><p>이 기기의 녹음과 서버 세션을 모두 지웁니다.</p><button type="button" className="button button-secondary recorder-danger-button" disabled={busy} onClick={() => void run("session", () => discard(selected))}>녹음 폐기</button></div>}
    </section>}
    <section className="panel" aria-label="복구할 녹음">
      <h2>이어서 저장할 녹음</h2>
      {capturing ? <p>녹음이 끝나면 다시 보여 줍니다.</p> : <>
        {error !== null && errorPanel === "list" && <p className="recorder-notice is-error" role="alert" tabIndex={-1} ref={errorRef}><strong>오류</strong> {recorderErrorText(error)}</p>}
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run("list", refresh)}>목록 다시 확인</button>
        {otherSessions.length === 0 ? <p>진행 중인 녹음이 없습니다.</p> : <ul className="recorder-recovery-list">{otherSessions.map((session) => <li key={session.id}>
          <p><strong>{session.title}</strong> · {sessionStateLabel(session.state)} · {formatExpiry(session.expires_at, new Date())}</p>
          <div className="recorder-list-actions"><button type="button" className="button button-secondary recorder-small-button" disabled={busy} onClick={() => void run("list", () => recover(session))}>확인하고 저장</button><button type="button" className="button button-secondary recorder-small-button recorder-danger-button" disabled={busy} onClick={() => void run("list", () => discard(session))}>녹음 폐기</button></div>
        </li>)}</ul>}
      </>}
    </section>
  </main>;
}
