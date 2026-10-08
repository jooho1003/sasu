// V04: real mic for the full 30-minute limit. Speech on the speakers (v20.wav looped), 29-minute warning,
// automatic stop at 30:00, then save -> 30 verified segments. Browser process memory sampled every minute.
import fs from "node:fs";
import path from "node:path";
import { WORK, TRACK_PROBE, addLogin, browserProcesses, launch, logger, recorderStatus, runDir, sleep } from "./common.mjs";
import { collect, openRecorder, playAsync, prepare, saveAndProcess, startRecording, localInfo, tracksAfter } from "./flow.mjs";

const browser = process.argv[2] ?? "chrome";
const dir = runDir(`v04-${browser}`);
const log = logger(dir);
const profile = `${browser}-v04-${process.argv.find((a) => a.startsWith("--tag="))?.slice(6) ?? "a"}`;
const context = await launch(browser, profile);
await context.addInitScript(TRACK_PROBE);
await addLogin(context);
const page = context.pages()[0] ?? await context.newPage();
page.on("pageerror", (e) => log("pageerror", { message: e.message.slice(0, 300) }));
page.on("console", (m) => { if (m.type() === "error") log("console_error", { text: m.text().slice(0, 300) }); });
const memory = [];
const sampleMemory = (label) => {
  const procs = browserProcesses(profile);
  const entry = { t: Date.now(), label, ws: procs.reduce((a, p) => a + p.ws, 0), priv: procs.reduce((a, p) => a + p.priv, 0),
    byType: Object.fromEntries(["browser", "renderer", "gpu-process", "utility"].map((type) => [type, procs.filter((p) => p.type === type).reduce((a, p) => a + p.priv, 0)])) };
  memory.push(entry);
  log("memory", entry);
};
const heap = async () => page.evaluate(() => performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null).catch(() => null);
let player = null;
try {
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent) });
  await prepare(page, log, dir, `V04 30분 한도 ${browser}`);
  const t0 = await startRecording(page, log);
  sampleMemory("start");
  const loop = path.join(WORK, "audio", "v20.wav");
  // --listen-only: overlap with the V20 tab/system runs; V04 then only listens (no own playback, no contamination).
  if (!process.argv.includes("--listen-only")) player = playAsync([loop, loop], path.join(dir, "play.jsonl"));
  log("playback", { own: !process.argv.includes("--listen-only") });
  let warnedAt = null; let stoppedAt = null; let lastMinute = -1;
  const samples = [];
  while (Date.now() - t0 < 33 * 60_000) {
    await sleep(2000);
    const s = await recorderStatus(page).catch(() => null);
    if (!s) continue;
    const elapsed = Date.now() - t0;
    const minute = Math.floor(elapsed / 60_000);
    if (minute !== lastMinute) { lastMinute = minute; sampleMemory(`m${minute}`); log("status", { elapsedMs: elapsed, heap: await heap(), ...s }); samples.push({ elapsed, timer: s.timer, persisted: s.persisted }); }
    const text = await page.locator("[aria-label='현재 녹음']").innerText().catch(() => "");
    if (!warnedAt && /29분이 지났습니다/.test(text + s.notices.join(" "))) { warnedAt = Date.now(); log("warning_seen", { elapsedMs: warnedAt - t0, timer: s.timer, notices: s.notices, text: text.slice(0, 400) }); await page.screenshot({ path: path.join(dir, "warning.png") }); }
    const recording = await page.getByRole("button", { name: "녹음 종료" }).isVisible().catch(() => false);
    if (!recording) { stoppedAt = Date.now(); log("auto_stopped", { elapsedMs: stoppedAt - t0, timer: s.timer, persisted: s.persisted, chip: s.chip, notices: s.notices, text: text.slice(0, 400) }); break; }
  }
  player?.child.kill();
  await sleep(2000);
  sampleMemory("after_stop");
  await page.screenshot({ path: path.join(dir, "auto-stopped.png") });
  const inspect = page.getByRole("button", { name: "확인 구간 보기" });
  if (await inspect.isVisible().catch(() => false)) { await inspect.click(); await sleep(2000); }
  log("local_info", { lines: await localInfo(page), panel: (await page.locator("[aria-label='현재 녹음']").innerText().catch(() => "")).slice(0, 500) });
  await tracksAfter(page, log, "after_auto_stop");
  const partial = page.getByRole("checkbox", { name: /빠진 구간 뒤의 소리는 포함되지 않으며/ });
  if (await partial.isVisible().catch(() => false)) { await partial.check(); log("partial_checkbox_checked"); }
  const { reviewId, status } = await saveAndProcess(page, log, { timeoutMs: 1_500_000 });
  if (reviewId) {
    const evidence = await collect(reviewId, dir);
    const total = evidence.segments.reduce((a, s) => a + s.sample_count, 0);
    log("evidence", { reviewId, status, segmentCount: evidence.segments.length, totalSamples: total, last: evidence.segments.at(-1)?.sample_count,
      allVerified: evidence.segments.every((s) => s.status === "verified"), bytes: evidence.segments.reduce((a, s) => a + s.bytes, 0),
      capture: evidence.review?.capture_metadata ? { captured: evidence.review.capture_metadata.captured_samples, retained: evidence.review.capture_metadata.retained_samples, interrupted: evidence.review.capture_metadata.interrupted, health: evidence.review.capture_metadata.health } : null,
      sections: evidence.review?.sections?.length, parts: evidence.parts.map((p) => [p.part_index, p.status]) });
  }
  fs.writeFileSync(path.join(dir, "memory.json"), JSON.stringify(memory, null, 1));
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  player?.child.kill();
  await context.close().catch(() => {});
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
}
