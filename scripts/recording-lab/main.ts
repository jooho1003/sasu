import * as storage from "../../lib/recording/browser/storage";
import * as checkpointCrypto from "../../lib/recording/checkpoint-crypto";
import * as originalSegments from "../../lib/recording/original-segments";
import { startRecording } from "../../lib/recording/browser/capture";
import { captureInputs, stopInputs } from "../../lib/recording/browser/inputs";
import { pcmWav } from "../../lib/recording/pcm";
import { RecordingSession } from "../../lib/recording/session";

// Test harness only: this synthetic identity is never accepted by app/API routes.
Object.assign(window, { recordingLab: {
  ...storage, ...checkpointCrypto, ...originalSegments, RecordingSession,
  createStorageWorker: () => new Worker(new URL("../../lib/recording/browser/storage.worker.ts", import.meta.url), { type: "module" }),
} });
document.querySelector("#status")!.textContent = "검증 준비 완료";

const status = document.querySelector("#status")!;
const controls = document.querySelector("#controls")!;
const audio = document.querySelector<HTMLAudioElement>("#playback")!;
let recorder: Awaited<ReturnType<typeof startRecording>> | undefined;
let streams: MediaStream[] = [];
let synthesizer: AudioContext | undefined;
let playbackUrl: string | undefined;
let starting = false;
let testingInput = false;
const scope = () => ({ ownerUserId: "lab-synthetic-user", deptId: "lab-synthetic-dept", recordingId: sessionStorage.getItem("recording-lab-id") ?? "none" });
const labKey = () => checkpointCrypto.importRecordingKey(new Uint8Array(32).fill(42));
const button = (label: string, action: () => void | Promise<void>) => {
  const element = document.createElement("button");
  element.textContent = label;
  element.onclick = () => { void Promise.resolve().then(action).catch((error) => { status.textContent = error instanceof Error ? error.message : "검증 실패"; }); };
  controls.append(element, document.createTextNode(" "));
};
const testActualInputs = async (mode: "microphone" | "system_and_microphone") => {
  if (recorder || starting || testingInput) throw new Error("먼저 현재 작업을 종료하세요.");
  testingInput = true;
  let actualInputs: MediaStream[] = [];
  let context: AudioContext | undefined;
  try {
    status.textContent = "브라우저 입력 선택을 기다리는 중";
    actualInputs = await captureInputs(mode);
    context = new AudioContext();
    await context.resume();
    const sink = context.createGain();
    sink.gain.value = 0;
    sink.connect(context.destination);
    const analysers = actualInputs.map((stream) => {
      const analyser = context!.createAnalyser();
      analyser.fftSize = 256;
      context!.createMediaStreamSource(stream).connect(analyser).connect(sink);
      return analyser;
    });
    const peaks = analysers.map(() => 0);
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5000) {
      analysers.forEach((analyser, index) => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        peaks[index] = Math.max(peaks[index], rms);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    status.textContent = JSON.stringify({
      mode,
      durationMs: Math.round(performance.now() - startedAt),
      audioTracks: actualInputs.map((stream) => stream.getAudioTracks().length),
      videoFramesStored: 0,
      peakRms: peaks.map((value) => Number(value.toFixed(4))),
      signalDetected: peaks.map((value) => value > 0.0001),
      persisted: false,
      transmitted: false,
    }, null, 2);
  } finally {
    stopInputs(actualInputs);
    if (context && context.state !== "closed") await context.close();
    testingInput = false;
  }
};
const start = async () => {
  if (recorder || starting) throw new Error("먼저 현재 녹음을 종료하세요.");
  starting = true;
  try {
    audio.pause();
    audio.removeAttribute("src");
    if (playbackUrl) { URL.revokeObjectURL(playbackUrl); playbackUrl = undefined; }
      synthesizer = new AudioContext();
      await synthesizer.resume();
      streams = [440, 880].map((frequency) => {
        const oscillator = synthesizer!.createOscillator();
        oscillator.frequency.value = frequency;
        const gain = synthesizer!.createGain();
        gain.gain.value = 0.3;
        const destination = synthesizer!.createMediaStreamDestination();
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        return destination.stream;
      });
    Object.assign(window, { labTracks: streams.flatMap((stream) => stream.getTracks()) });
    sessionStorage.setItem("recording-lab-id", crypto.randomUUID());
    recorder = await startRecording(scope(), streams, await labKey(), (snapshot) => {
      status.textContent = JSON.stringify(snapshot, null, 2);
      if (["stopped", "interrupted"].includes(snapshot.state)) {
        recorder = undefined;
        if (synthesizer && synthesizer.state !== "closed") void synthesizer.close();
      }
    });
  } catch (error) {
    stopInputs(streams);
    if (synthesizer && synthesizer.state !== "closed") await synthesizer.close();
    throw error;
  } finally { starting = false; }
};

button("마이크 5초 시험", () => testActualInputs("microphone"));
button("공유 음성+마이크 5초 시험", () => testActualInputs("system_and_microphone"));
controls.append(document.createElement("hr"));
button("합성 입력 시작", start);
controls.append(document.createElement("hr"));
button("일시정지", () => { recorder?.pause(); });
button("재개", async () => { await recorder?.resume(); });
button("종료", async () => {
  const current = recorder;
  await current?.stop();
  Object.assign(window, { labProfile: current?.profile() ?? [], labHealth: current?.health() ?? null });
  recorder = undefined;
});
button("입력 종료 시험", () => {
  const track = streams[0]?.getAudioTracks()[0];
  track?.stop();
  // stop() itself does not dispatch ended; simulate the browser's device loss.
  track?.dispatchEvent(new Event("ended"));
});
button("마이크 분리 시험", () => {
  const track = streams[streams.length - 1]?.getAudioTracks()[0];
  track?.stop();
  track?.dispatchEvent(new Event("ended"));
});
button("마이크 다시 선택", () => {
  if (!recorder || !synthesizer) throw new Error("녹음 중이 아닙니다.");
  const oscillator = synthesizer.createOscillator();
  oscillator.frequency.value = 660;
  const gain = synthesizer.createGain();
  gain.gain.value = 0.2;
  const destination = synthesizer.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  void recorder.replaceMicrophone(destination.stream).then(() => {
    streams[streams.length - 1] = destination.stream;
    recorder?.resume();
  });
});
button("확인 구간 복구", async () => {
  if (recorder || starting) throw new Error("먼저 녹음을 종료하세요.");
  const store = await storage.openRecordingStore(await labKey());
  try {
    const recovery = await store.inspect(scope());
    status.textContent = JSON.stringify(recovery, null, 2);
    if (!recovery?.samples) return;
    const header = pcmWav(new Int16Array());
    const view = new DataView(header);
    view.setUint32(4, 36 + recovery.samples * 2, true);
    view.setUint32(40, recovery.samples * 2, true);
    const parts: BlobPart[] = [header];
    for await (const chunk of store.read(scope())) parts.push(pcmWav(chunk.pcm).slice(44));
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(new Blob(parts, { type: "audio/wav" }));
    audio.src = playbackUrl;
    const download = document.querySelector<HTMLAnchorElement>("#download")!;
    download.href = playbackUrl;
    download.hidden = false;
  } finally { store.close(); }
});
button("원본 구간 검사", async () => {
  if (recorder || starting || testingInput) throw new Error("먼저 현재 작업을 종료하세요.");
  const store = await storage.openRecordingStore(await labKey());
  try {
    const recovery = await store.inspect(scope());
    if (!recovery?.samples) throw new Error("검사할 확인 구간이 없습니다.");
    if (recovery.partial) throw new Error("일부 구간이 손상됐습니다. 부분 기록을 확인한 뒤 다시 준비해야 합니다.");
    const prepared = await originalSegments.prepareRecordingOriginalManifest(store.read(scope()), recovery.samples);
    status.textContent = JSON.stringify({
      stage: "원본 구간 검사 완료", ...originalSegments.recordingManifestTotals(prepared.manifest),
      ...prepared, interrupted: recovery.interrupted, transmitted: false,
    }, null, 2);
  } finally { store.close(); }
});
button("로컬 원본 폐기", async () => {
  if (recorder || starting) throw new Error("먼저 녹음을 종료하세요.");
  const store = await storage.openRecordingStore(await labKey());
  try { await store.remove(scope()); } finally { store.close(); }
  audio.pause();
  audio.removeAttribute("src");
  if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  document.querySelector<HTMLAnchorElement>("#download")!.hidden = true;
  status.textContent = "로컬 원본 폐기 완료";
});
const download = document.createElement("a");
download.id = "download";
download.download = "sasu-recording-test.wav";
download.hidden = true;
download.textContent = "검증 WAV 내려받기";
controls.append(download);
const meters = document.createElement("p");
controls.append(meters);
setInterval(() => { meters.textContent = recorder ? `입력별 RMS: ${recorder.levels().map((level) => level.toFixed(3)).join(" / ")}` : "입력 중지됨"; }, 200);
window.addEventListener("pagehide", () => { stopInputs(streams); void recorder?.interrupt("page_closed"); });
