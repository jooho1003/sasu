// V05: at ~3:00 refresh the page (scenario "refresh") or kill the browser process tree ("kill"), then reconnect,
// recover from IndexedDB with a re-issued key, save, and compare confirmed samples with what was on screen.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BASE, DEPT, WORK, TRACK_PROBE, addLogin, browserProcesses, launch, logger, recorderStatus, runDir, sleep } from "./common.mjs";
import { collect, openRecorder, playAsync, prepare, saveAndProcess, startRecording, statusPoller, localInfo, tracksAfter } from "./flow.mjs";

const [scenario = "refresh", browser = "chrome", atSeconds = "180"] = process.argv.slice(2);
const dir = runDir(`v05-${scenario}-${browser}`);
const log = logger(dir);
const profile = `${browser}-v05-${scenario}`;
const audio = (name) => path.join(WORK, "audio", name);
let context = await launch(browser, profile);
await context.addInitScript(TRACK_PROBE);
await addLogin(context);
let page = context.pages()[0] ?? await context.newPage();
const watch = (p) => {
  p.on("pageerror", (e) => log("pageerror", { message: e.message.slice(0, 300) }));
  p.on("dialog", async (d) => { log("dialog", { type: d.type(), message: d.message() }); await d.accept().catch(() => {}); });
  p.on("response", (r) => { const u = r.url(); if (/\/recordings(\/[0-9a-f-]+)?(\/key|\/save|\/finalize|\/discard)?(\?.*)?$/.test(u) && u.includes("/api/")) log("api", { method: r.request().method(), path: new URL(u).pathname.replace(/[0-9a-f-]{36}/g, ":id"), status: r.status() }); if (r.status() >= 400 && /\/save$/.test(new URL(u).pathname)) fs.writeFileSync(path.join(dir, "save-request-" + Date.now() + ".json"), r.request().postData() ?? ""); if (r.status() >= 400 && u.includes("/api/")) r.text().then((body) => log("api_error_body", { path: new URL(u).pathname.replace(/[0-9a-f-]{36}/g, ":id"), status: r.status(), body: body.slice(0, 600) })).catch(() => {}); });
};
watch(page);
let player;
try {
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent) });
  await prepare(page, log, dir, `V05 ${scenario} ${browser}`);
  const t0 = await startRecording(page, log);
  const poller = statusPoller(page, log, 1000);
  player = playAsync([audio("v20.wav")], path.join(dir, "play.jsonl"));
  while (Date.now() - t0 < Number(atSeconds) * 1000) await sleep(200);
  poller.stop();
  const last = await recorderStatus(page);
  const estimate = await page.evaluate(async () => { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; });
  log("before_interrupt", { last, estimate, sinceStartMs: Date.now() - t0 });
  const tInterrupt = Date.now();
  if (scenario === "refresh") {
    await page.reload({ waitUntil: "load" });
    log("reloaded", { ms: Date.now() - tInterrupt });
  } else {
    const procs = browserProcesses(profile);
    const root = procs.find((p) => p.type === "browser");
    log("kill", { browserPid: root?.pid, processes: procs.length });
    execFileSync("taskkill", ["/F", "/T", "/PID", String(root.pid)], { stdio: "ignore" });
    await context.close().catch(() => {});
    await sleep(2000);
    log("killed", { remaining: browserProcesses(profile).length });
    context = await launch(browser, profile);
    await context.addInitScript(TRACK_PROBE);
    await addLogin(context);
    page = context.pages()[0] ?? await context.newPage();
    watch(page);
    await openRecorder(page);
    log("relaunched", { ms: Date.now() - tInterrupt });
  }
  player.child.kill();
  await page.getByLabel("회의 제목").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "확인하고 저장" }).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const listText = await page.locator("[aria-label='복구할 녹음']").innerText();
  log("recovery_list", { text: listText });
  await page.screenshot({ path: path.join(dir, "recovery-list.png") });
  await page.getByRole("button", { name: "확인하고 저장" }).first().click();
  await page.getByText(/이 기기의 연속 확인 구간|이 기기의 확인 구간이 없습니다/).first().waitFor({ timeout: 30_000 });
  const panel = await page.locator("[aria-label='현재 녹음']").innerText();
  log("recovered_panel", { text: panel, local: await localInfo(page) });
  await page.screenshot({ path: path.join(dir, "recovered.png") });
  const partial = page.getByRole("checkbox", { name: /빠진 구간 뒤의 소리는 포함되지 않으며/ });
  if (await partial.isVisible().catch(() => false)) { await partial.check(); log("partial_checkbox_checked"); }
  await tracksAfter(page, log, "after_recovery");
  const { reviewId, status } = await saveAndProcess(page, log);
  if (reviewId) {
    const evidence = await collect(reviewId, dir);
    log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata, recording: evidence.recording });
  }
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  player?.child.kill();
  await context.close().catch(() => {});
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
}
