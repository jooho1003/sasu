// V01: real mic, ~2 min speech -> 10 s pause (pause-only sentence played) -> resume -> speech -> stop -> save -> transcribe.
import fs from "node:fs";
import path from "node:path";
import { WORK, TRACK_PROBE, addLogin, launch, logger, runDir, sleep } from "./common.mjs";
import { collect, openRecorder, pause, play, playAsync, playbackCheck, prepare, resume, saveAndProcess, startRecording, statusPoller, stopRecording, localInfo, tracksAfter } from "./flow.mjs";

const browser = process.argv[2] ?? "chrome";
const dir = runDir(`v01-${browser}`);
const log = logger(dir);
const audio = (name) => path.join(WORK, "audio", name);
const context = await launch(browser, `${browser}-main`);
await context.addInitScript(TRACK_PROBE);
const userId = await addLogin(context);
const page = context.pages()[0] ?? await context.newPage();
page.on("pageerror", (e) => log("pageerror", { message: e.message.slice(0, 300) }));
page.on("console", (m) => { if (m.type() === "error") log("console_error", { text: m.text().slice(0, 300) }); });
try {
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent), userId });
  await prepare(page, log, dir, `V01 실기기 ${browser} ${new Date().toISOString().slice(11, 19)}`);
  const t0 = await startRecording(page, log);
  const poller = statusPoller(page, log, 1000);
  const playLog = path.join(dir, "play.jsonl");
  await play([audio("v01-A.wav")], playLog);
  const tPause = await pause(page, log);
  await play([audio("v01-P.wav")], playLog);
  const remaining = tPause + 10_000 - Date.now();
  if (remaining > 0) await sleep(remaining);
  const tResume = await resume(page, log);
  await play([audio("v01-B.wav")], playLog);
  await sleep(1500);
  const tStop = await stopRecording(page, log);
  await sleep(1500);
  poller.stop();
  log("local_info", { lines: await localInfo(page) });
  await tracksAfter(page, log, "after_stop");
  await page.screenshot({ path: path.join(dir, "stopped.png") });
  log("timeline", { t0, tPause, tResume, tStop, activeMs: (tPause - t0) + (tStop - tResume), pausedMs: tResume - tPause });
  const { reviewId, status } = await saveAndProcess(page, log);
  if (reviewId) {
    const evidence = await collect(reviewId, dir);
    log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), sections: evidence.review?.sections?.length,
      capture: evidence.review?.capture_metadata ? { paused: evidence.review.capture_metadata.paused, interrupted: evidence.review.capture_metadata.interrupted, captured_samples: evidence.review.capture_metadata.captured_samples, health: evidence.review.capture_metadata.health } : null });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: path.join(dir, "review.png"), fullPage: false });
    const pausedJoin = Math.max(0, Math.floor((tPause - t0) / 1000) - 3);
    await playbackCheck(page, log, Math.max(0, pausedJoin - 2), 8000);
    await playbackCheck(page, log, 57, 6000);
  }
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
}
