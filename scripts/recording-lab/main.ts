import * as storage from "../../lib/recording/browser/storage";
import { startRecording } from "../../lib/recording/browser/capture";
import { stopInputs } from "../../lib/recording/browser/inputs";
import { pcmWav } from "../../lib/recording/pcm";
import { RecordingSession } from "../../lib/recording/session";

// Test harness only: this synthetic identity is never accepted by app/API routes.
Object.assign(window, { recordingLab: { ...storage, RecordingSession } });
document.querySelector("#status")!.textContent = "검증 준비 완료";

const status = document.querySelector("#status")!;
const controls = document.querySelector("#controls")!;
const audio = document.querySelector<HTMLAudioElement>("#playback")!;
let recorder: Awaited<ReturnType<typeof startRecording>> | undefined;
let streams: MediaStream[] = [];
let synthesizer: AudioContext | undefined;
let playbackUrl: string | undefined;
let starting = false;
const scope = () => ({ ownerUserId: "lab-synthetic-user", deptId: "lab-synthetic-dept", recordingId: sessionStorage.getItem("recording-lab-id") ?? "none" });
const button = (label: string, action: () => void | Promise<void>) => {
  const element = document.createElement("button");
  element.textContent = label;
  element.onclick = () => { void Promise.resolve().then(action).catch((error) => { status.textContent = error instanceof Error ? error.message : "검증 실패"; }); };
  controls.append(element, document.createTextNode(" "));
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
    recorder = await startRecording(scope(), streams, (snapshot) => {
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

button("합성 입력 시작", start);
controls.append(document.createElement("hr"));
button("일시정지", () => { recorder?.pause(); });
button("재개", async () => { await recorder?.resume(); });
button("종료", async () => { await recorder?.stop(); recorder = undefined; });
button("입력 종료 시험", () => {
  const track = streams[0]?.getAudioTracks()[0];
  track?.stop();
  // stop() itself does not dispatch ended; simulate the browser's device loss.
  track?.dispatchEvent(new Event("ended"));
});
button("확인 구간 복구", async () => {
  if (recorder || starting) throw new Error("먼저 녹음을 종료하세요.");
  const store = await storage.openRecordingStore();
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
button("로컬 원본 폐기", async () => {
  if (recorder || starting) throw new Error("먼저 녹음을 종료하세요.");
  const store = await storage.openRecordingStore();
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
