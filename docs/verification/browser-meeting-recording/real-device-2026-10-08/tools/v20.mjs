// V20: 20.7-minute TTS meeting (30 terms) recorded through the REAL product recorder in one of three modes.
//   microphone : speakers -> real mic (마이크 mode)
//   tab        : Chrome tab playing the script, shared with tab audio (컴퓨터 소리 + 마이크)
//   system     : external process plays on speakers, entire screen shared with system audio (컴퓨터 소리 + 마이크)
// Saves -> server verification -> transcription (department glossary state as found), then downloads evidence.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { BASE, WORK, TRACK_PROBE, addLogin, browserPid, browserProcesses, launch, logger, pickerShare, recorderStatus, runDir, sleep } from "./common.mjs";
import { collect, openRecorder, play, playAsync, saveAndProcess, statusPoller, stopRecording, localInfo, tracksAfter } from "./flow.mjs";

const [mode = "microphone", browser = "chrome"] = process.argv.slice(2);
if (!["microphone", "tab", "system"].includes(mode)) throw new Error("mode");
const dir = runDir(`v20-${mode}-${browser}`);
const log = logger(dir);
const audio = (name) => path.join(WORK, "audio", name);
const profile = `${browser}-v20-${mode}`;
const TAB_PORT = 3098;

// Tab mode source: a plain local page that plays the script WAV (served from this harness only).
const server = mode === "tab" ? http.createServer((req, res) => {
  if (req.url === "/v20.wav") { res.writeHead(200, { "content-type": "audio/wav", "content-length": fs.statSync(audio("v20.wav")).size }); fs.createReadStream(audio("v20.wav")).pipe(res); return; }
  if (req.url === "/probe.wav") { res.writeHead(200, { "content-type": "audio/wav" }); fs.createReadStream(path.join(WORK, "tts-probe.wav")).pipe(res); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>SASU-TTS-TAB</title><h1>V20 tab source</h1><audio id=probe src=/probe.wav preload=auto></audio><audio id=main src=/v20.wav preload=auto controls></audio>");
}).listen(TAB_PORT, "127.0.0.1") : null;

const context = await launch(browser, profile, { fakeUi: mode === "microphone", args: ["--autoplay-policy=no-user-gesture-required"] });
await context.addInitScript(TRACK_PROBE);
const userId = await addLogin(context);
const page = context.pages()[0] ?? await context.newPage();
page.on("pageerror", (e) => log("pageerror", { message: e.message.slice(0, 300) }));
page.on("console", (m) => { if (m.type() === "error") log("console_error", { text: m.text().slice(0, 300) }); });
page.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && /\/recordings/.test(u)) log("api", { method: r.request().method(), path: new URL(u).pathname.replace(/[0-9a-f-]{36}/g, ":id"), status: r.status() }); });
const cdp = await context.newCDPSession(page);
if (mode !== "microphone") await cdp.send("Browser.setPermission", { permission: { name: "microphone" }, setting: "granted", origin: BASE });
const pid = () => browserPid(profile);
const share = mode === "tab"
  ? { view: "Chrome 탭", source: "SASU-TTS-TAB", sourceType: "DataItem", audio: true }
  : { view: "전체 화면", source: "화면 1", audio: true };
let tab = null;
const memory = [];
const sampleMemory = (label) => {
  const procs = browserProcesses(profile);
  const entry = { t: Date.now(), label, ws: procs.reduce((a, p) => a + p.ws, 0), priv: procs.reduce((a, p) => a + p.priv, 0), renderers: procs.filter((p) => p.type === "renderer").map((p) => p.priv) };
  memory.push(entry);
  log("memory", entry);
};

try {
  if (mode === "tab") {
    tab = await context.newPage();
    await tab.goto(`http://127.0.0.1:${TAB_PORT}/`);
    await tab.waitForFunction(() => document.querySelector("#main").readyState >= 3, null, { timeout: 30_000 });
    log("tab_source_ready", { duration: await tab.evaluate(() => document.querySelector("#main").duration) });
    await page.bringToFront();
  }
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent), userId, mode });
  await page.getByLabel("회의 제목").fill(`V20 ${mode} ${new Date().toISOString().slice(0, 16)}`);
  if (mode !== "microphone") {
    await page.getByRole("radio", { name: "컴퓨터 소리 + 마이크" }).check();
    await page.getByLabel("회의 출처").selectOption(mode === "tab" ? "meet" : "other");
  }
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();

  // 5-second input test with the real devices.
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  let probe;
  if (mode === "microphone") probe = playAsync([path.join(WORK, "tts-probe.wav")], path.join(dir, "play.jsonl"));
  else {
    await sleep(2500);
    log("picker_test", { r: await pickerShare(pid(), share, log) });
    if (mode === "tab") await tab.evaluate(() => document.querySelector("#probe").play());
    else probe = playAsync([path.join(WORK, "tts-probe.wav")], path.join(dir, "play.jsonl"));
  }
  const testMeters = [];
  for (let i = 0; i < 12; i++) { await sleep(400); testMeters.push((await recorderStatus(page)).meters); }
  await page.locator("audio").waitFor({ timeout: 30_000 });
  if (probe) await probe.done;
  log("input_test", { meters: testMeters, text: await page.locator("[aria-label='새 회의 녹음']").innerText().catch(() => null) });
  // Sharing a tab makes Chrome focus the captured tab; a user clicks 녹음 시작 on the recorder tab, so bring it back.
  log("focus_after_test", { recorderVisible: await page.evaluate(() => document.visibilityState) });
  await page.bringToFront();
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
  await page.screenshot({ path: path.join(dir, "prepared.png") });

  // Start: one click -> (picker) -> session -> key -> pre-check -> capture.
  const clicked = Date.now();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  if (mode !== "microphone") { await sleep(2500); log("picker_start", { r: await pickerShare(pid(), share, log) }); }
  await page.getByRole("button", { name: "녹음 종료" }).waitFor({ timeout: 60_000 });
  if (mode === "tab") { log("focus_after_start", { recorderVisible: await page.evaluate(() => document.visibilityState) }); await page.bringToFront(); }
  const t0 = Date.now();
  log("recording_started", { clicked, visible: t0 });
  await tracksAfter(page, log, "after_start");
  const poller = statusPoller(page, log, 5000);
  sampleMemory("start");
  const memTimer = setInterval(() => { try { sampleMemory("during"); } catch { /* ignore */ } }, 60_000);

  const playLog = path.join(dir, "play.jsonl");
  if (mode === "tab") {
    const start = Date.now();
    await tab.evaluate(() => { const a = document.querySelector("#main"); a.currentTime = 0; return a.play(); });
    fs.appendFileSync(playLog, JSON.stringify({ file: "v20.wav", start, via: "tab" }) + "\n");
    await tab.waitForFunction(() => document.querySelector("#main").ended, null, { timeout: 1_400_000, polling: 1000 });
    fs.appendFileSync(playLog, JSON.stringify({ file: "v20.wav", end: Date.now(), via: "tab" }) + "\n");
  } else {
    await play([audio("v20.wav")], playLog);
  }
  await sleep(2500);
  clearInterval(memTimer);
  sampleMemory("before_stop");
  await page.screenshot({ path: path.join(dir, "recording-end.png") });
  const tStop = await stopRecording(page, log);
  await sleep(1500);
  poller.stop();
  log("local_info", { lines: await localInfo(page) });
  await tracksAfter(page, log, "after_stop");
  await page.screenshot({ path: path.join(dir, "stopped.png") });
  log("timeline", { t0, tStop, activeMs: tStop - t0 });
  const { reviewId, status } = await saveAndProcess(page, log, { timeoutMs: 1_200_000 });
  if (reviewId) {
    const evidence = await collect(reviewId, dir);
    log("evidence", { reviewId, status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), sections: evidence.review?.sections?.length,
      capture: evidence.review?.capture_metadata ? { input: evidence.review.input_method, captured_samples: evidence.review.capture_metadata.captured_samples, clipping_ratio: evidence.review.capture_metadata.clipping_ratio, health: evidence.review.capture_metadata.health } : null });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: path.join(dir, "review.png"), fullPage: false });
  }
  fs.writeFileSync(path.join(dir, "memory.json"), JSON.stringify(memory, null, 1));
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  server?.close();
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
}
