// V06: storage failures and two tabs on real mic input.
//   quota-precheck : origin quota below the 64 MB pre-check -> start must be refused, no capture
//   quota-mid      : quota shrinks to (usage + 256 KB) during recording -> IDB writes fail -> visible stop, confirmed prefix kept
//   idb-clear      : site IndexedDB cleared during recording (write failure) -> visible stop, no silent continuation
//   two-tabs       : second tab tries to start while the first records -> refused, first keeps recording, one recording saved
import fs from "node:fs";
import path from "node:path";
import { BASE, DEPT, WORK, TRACK_PROBE, addLogin, launch, logger, recorderStatus, runDir, sleep } from "./common.mjs";
import { collect, openRecorder, pause, play, playAsync, prepare, saveAndProcess, startRecording, statusPoller, stopRecording, localInfo, tracksAfter } from "./flow.mjs";

const [scenario = "quota-precheck", browser = "chrome"] = process.argv.slice(2);
const dir = runDir(`v06-${scenario}-${browser}`);
const log = logger(dir);
const audio = (name) => path.join(WORK, "audio", name);
const context = await launch(browser, `${browser}-v06-${scenario}`);
await context.addInitScript(TRACK_PROBE);
await addLogin(context);
const page = context.pages()[0] ?? await context.newPage();
const watch = (p, label) => {
  p.on("pageerror", (e) => log("pageerror", { label, message: e.message.slice(0, 300) }));
  p.on("dialog", async (d) => { log("dialog", { label, type: d.type(), message: d.message() }); await d.accept().catch(() => {}); });
  p.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && /\/recordings/.test(u)) log("api", { label, method: r.request().method(), path: new URL(u).pathname.replace(/[0-9a-f-]{36}/g, ":id"), status: r.status() }); });
};
watch(page, "tab1");
const cdp = await context.newCDPSession(page);
const estimate = (p = page) => p.evaluate(async () => { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; });
const alerts = (p = page) => p.locator("[role=alert]").allTextContents();
const sessions = () => page.evaluate(async (dept) => (await (await fetch(`/api/d/${dept}/recordings`, { cache: "no-store" })).json()).recordings?.map((r) => ({ id: r.id, state: r.state, title: r.title })) ?? [], DEPT);
let player;
try {
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent) });
  log("sessions_before", { sessions: await sessions(), estimate: await estimate() });
  if (scenario === "quota-precheck") {
    await prepare(page, log, dir, "V06 저장 공간 부족 사전 검사");
    await cdp.send("Storage.overrideQuotaForOrigin", { origin: BASE, quotaSize: 32 * 1024 * 1024 });
    log("quota_overridden", { estimate: await estimate() });
    await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await sleep(4000);
    log("start_result", { alerts: await alerts(), status: await recorderStatus(page) });
    await tracksAfter(page, log, "after_refused_start");
    await page.screenshot({ path: path.join(dir, "quota-precheck.png") });
    await cdp.send("Storage.overrideQuotaForOrigin", { origin: BASE });
  } else if (scenario === "quota-mid" || scenario === "idb-clear") {
    await prepare(page, log, dir, `V06 ${scenario}`);
    const t0 = await startRecording(page, log);
    const poller = statusPoller(page, log, 1000);
    player = playAsync([audio("v20.wav")], path.join(dir, "play.jsonl"));
    await sleep(20_000);
    const before = { status: await recorderStatus(page), estimate: await estimate() };
    log("before_failure", before);
    const tFail = Date.now();
    if (scenario === "quota-mid") {
      await cdp.send("Storage.overrideQuotaForOrigin", { origin: BASE, quotaSize: before.estimate.usage + 256 * 1024 });
      log("quota_shrunk", { estimate: await estimate() });
    } else {
      await cdp.send("Storage.clearDataForOrigin", { origin: BASE, storageTypes: "indexeddb" });
      log("indexeddb_cleared");
    }
    let stoppedAt = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const s = await recorderStatus(page);
      if (s.chip && s.chip !== "녹음 중") { stoppedAt = Date.now(); log("stopped_by_failure", { afterMs: stoppedAt - tFail, status: s }); break; }
    }
    if (!stoppedAt) log("still_recording_after_failure", { status: await recorderStatus(page), sinceFailMs: Date.now() - tFail });
    poller.stop();
    player.child.kill();
    await sleep(1500);
    await page.screenshot({ path: path.join(dir, "after-failure.png") });
    await tracksAfter(page, log, "after_failure");
    if (scenario === "quota-mid") await cdp.send("Storage.overrideQuotaForOrigin", { origin: BASE });
    const inspect = page.getByRole("button", { name: "확인 구간 보기" });
    if (await inspect.isVisible().catch(() => false)) { await inspect.click(); await sleep(2000); }
    log("after_failure_panel", { text: await page.locator("[aria-label='현재 녹음']").innerText().catch(() => null), local: await localInfo(page), alerts: await alerts() });
    await page.screenshot({ path: path.join(dir, "after-failure-panel.png") });
    const save = page.getByRole("button", { name: "음성 저장하고 받아쓰기" });
    const partial = page.getByRole("checkbox", { name: /빠진 구간 뒤의 소리는 포함되지 않으며/ });
    if (await partial.isVisible().catch(() => false)) await partial.check();
    if (await save.isVisible().catch(() => false) && await save.isEnabled().catch(() => false)) {
      const { reviewId, status } = await saveAndProcess(page, log);
      if (reviewId) {
        const evidence = await collect(reviewId, dir, { download: true });
        log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata });
      }
    } else {
      log("save_unavailable", { visible: await save.isVisible().catch(() => false) });
      const discard = page.getByRole("button", { name: "녹음 폐기" }).first();
      if (await discard.isVisible().catch(() => false)) { await discard.click(); await sleep(2000); log("discarded"); }
    }
  } else if (scenario === "freeze") {
    // Substitute for OS sleep (not run unattended): freeze the recording page for 20 s via the page lifecycle API.
    await prepare(page, log, dir, "V06 페이지 동결(절전 대체)");
    const t0 = await startRecording(page, log);
    const poller = statusPoller(page, log, 1000);
    player = playAsync([audio("v20.wav")], path.join(dir, "play.jsonl"));
    await sleep(20_000);
    const before = await recorderStatus(page);
    log("before_freeze", { status: before, sinceStartMs: Date.now() - t0 });
    const tFreeze = Date.now();
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    log("frozen");
    await sleep(20_000);
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    log("resumed_lifecycle", { frozenMs: Date.now() - tFreeze });
    const after = [];
    for (let i = 0; i < 10; i++) { await sleep(1000); after.push(await recorderStatus(page)); }
    log("after_freeze", { first: after[0], last: after.at(-1), timers: after.map((s) => s.timer), persisted: after.map((s) => s.persisted), chips: after.map((s) => s.chip), alerts: await alerts() });
    await page.screenshot({ path: path.join(dir, "after-freeze.png") });
    if (await page.getByRole("button", { name: "녹음 종료" }).isVisible().catch(() => false)) {
      await sleep(10_000);
      await stopRecording(page, log);
    }
    poller.stop();
    player.child.kill();
    await sleep(1500);
    const inspect = page.getByRole("button", { name: "확인 구간 보기" });
    if (await inspect.isVisible().catch(() => false)) { await inspect.click(); await sleep(2000); }
    log("local_info", { lines: await localInfo(page), panel: await page.locator("[aria-label='현재 녹음']").innerText().catch(() => null) });
    const partial = page.getByRole("checkbox", { name: /빠진 구간 뒤의 소리는 포함되지 않으며/ });
    if (await partial.isVisible().catch(() => false)) await partial.check();
    const { reviewId, status } = await saveAndProcess(page, log);
    if (reviewId) {
      const evidence = await collect(reviewId, dir);
      log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata, sections: evidence.review?.sections?.length });
    }
  } else if (scenario === "two-tabs") {
    await prepare(page, log, dir, "V06 두 탭 첫 번째");
    const t0 = await startRecording(page, log);
    const poller = statusPoller(page, log, 1000);
    player = playAsync([audio("v20.wav")], path.join(dir, "play.jsonl"));
    await sleep(10_000);
    const tab2 = await context.newPage();
    watch(tab2, "tab2");
    await openRecorder(tab2);
    await sleep(1500);
    log("tab2_list", { text: await tab2.locator("[aria-label='복구할 녹음']").innerText() });
    await prepare(tab2, log, dir, "V06 두 탭 두 번째");
    const tab1Before = await recorderStatus(page);
    await tab2.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await sleep(5000);
    log("tab2_start_result", { alerts: await alerts(tab2), status: await recorderStatus(tab2), tab1Before: tab1Before.persisted, tab1After: (await recorderStatus(page)).persisted });
    await tab2.screenshot({ path: path.join(dir, "tab2.png") });
    await tracksAfter(tab2, log, "tab2_after_refusal");
    log("sessions_during", { sessions: await sessions() });
    await tab2.close();
    await page.bringToFront();
    await sleep(10_000);
    await stopRecording(page, log);
    poller.stop();
    player.child.kill();
    await sleep(1500);
    log("local_info", { lines: await localInfo(page) });
    const { reviewId, status } = await saveAndProcess(page, log);
    if (reviewId) {
      const evidence = await collect(reviewId, dir);
      log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata });
    }
  }
  log("sessions_after", { sessions: await sessions() });
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  player?.child.kill();
  await cdp.send("Storage.overrideQuotaForOrigin", { origin: BASE }).catch(() => {});
  await context.close().catch(() => {});
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
}
