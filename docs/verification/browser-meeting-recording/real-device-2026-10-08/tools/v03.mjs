// V03: permission denial, real share-picker cancel / share without audio / stop sharing mid-recording,
// mic device removal during recording (Disable-PnpDevice via the elevated session-0 watcher).
import fs from "node:fs";
import path from "node:path";
import { BASE, DEPT, WORK, TRACK_PROBE, addLogin, browserPid, launch, logger, pickerShare, recorderStatus, runDir, sleep, uia } from "./common.mjs";
import { collect, openRecorder, play, playAsync, prepare, resume, saveAndProcess, startRecording, statusPoller, stopRecording, localInfo, tracksAfter } from "./flow.mjs";

const [scenario = "deny", browser = "chrome"] = process.argv.slice(2);
const dir = runDir(`v03-${scenario}-${browser}`);
const log = logger(dir);
const audio = (name) => path.join(WORK, "audio", name);
const fakeUi = scenario === "unplug";
const profile = `${browser}-v03-${scenario}`;
const context = await launch(browser, profile, { fakeUi });
await context.addInitScript(TRACK_PROBE);
await addLogin(context);
const page = context.pages()[0] ?? await context.newPage();
page.on("pageerror", (e) => log("pageerror", { message: e.message.slice(0, 300) }));
page.on("dialog", async (d) => { log("dialog", { type: d.type(), message: d.message() }); await d.accept().catch(() => {}); });
const cdp = await context.newCDPSession(page);
const setMic = (setting) => cdp.send("Browser.setPermission", { permission: { name: "microphone" }, setting, origin: BASE });
const sessions = () => page.evaluate(async (dept) => (await (await fetch(`/api/d/${dept}/recordings`, { cache: "no-store" })).json()).recordings?.map((r) => ({ id: r.id, state: r.state, title: r.title })) ?? [], DEPT);
const alerts = () => page.locator("[role=alert]").allTextContents();
const pid = () => browserPid(profile);
const CTL = path.join(WORK, "pnp-control");

async function systemTest(title, share) {
  await page.getByLabel("회의 제목").fill(title);
  await page.getByRole("radio", { name: "컴퓨터 소리 + 마이크" }).check();
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  await sleep(2500);
  const player = playAsync([audio("tts-probe.wav")], path.join(dir, "play.jsonl"));
  const r = await pickerShare(pid(), share, log);
  await sleep(6500);
  await player.done;
  return r;
}

try {
  log("open", { status: await openRecorder(page), ua: await page.evaluate(() => navigator.userAgent), scenario });
  log("sessions_before", { sessions: await sessions() });
  if (scenario === "deny") {
    await setMic("denied");
    await page.getByLabel("회의 제목").fill("V03 권한 거절");
    await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
    await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
    await sleep(3000);
    log("test_denied", { alerts: await alerts(), status: await recorderStatus(page), audioElements: await page.locator("audio").count() });
    await tracksAfter(page, log, "after_test_denied");
    await page.screenshot({ path: path.join(dir, "deny-test.png") });
    await setMic("granted");
    await page.reload();
    await page.getByLabel("회의 제목").waitFor();
    await prepare(page, log, dir, "V03 시작 직전 권한 철회");
    await setMic("denied");
    await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await sleep(3000);
    log("start_denied", { alerts: await alerts(), status: await recorderStatus(page) });
    await tracksAfter(page, log, "after_start_denied");
    await page.screenshot({ path: path.join(dir, "deny-start.png") });
    await setMic("granted");
  } else if (scenario === "cancel") {
    await setMic("granted");
    await page.getByLabel("회의 제목").fill("V03 공유 취소");
    await page.getByRole("radio", { name: "컴퓨터 소리 + 마이크" }).check();
    await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
    await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
    await sleep(2500);
    await pickerShare(pid(), { cancel: true }, log);
    await sleep(2500);
    log("test_cancel_result", { alerts: await alerts(), status: await recorderStatus(page), audioElements: await page.locator("audio").count() });
    await tracksAfter(page, log, "after_test_cancel");
    await page.screenshot({ path: path.join(dir, "cancel-test.png") });
    // Start path: successful screen+system-audio test, then cancel the picker at 녹음 시작.
    await page.reload();
    await page.getByLabel("회의 제목").waitFor();
    await systemTest("V03 시작 시 공유 취소", { view: "전체 화면", source: "화면 1", audio: true });
    log("system_test_ok", { audio: await page.locator("audio").count(), status: await recorderStatus(page) });
    await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
    await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await sleep(2500);
    await pickerShare(pid(), { cancel: true }, log);
    await sleep(3000);
    log("start_cancel_result", { alerts: await alerts(), status: await recorderStatus(page) });
    await tracksAfter(page, log, "after_start_cancel");
    await page.screenshot({ path: path.join(dir, "cancel-start.png") });
  } else if (scenario === "noaudio") {
    await setMic("granted");
    const tab = await context.newPage();
    await tab.setContent("<title>SASU-TTS-TAB</title><p>V03 tab source</p>");
    await page.bringToFront();
    for (const share of (process.env.RD_ONLY_TAB ? [] : [{ view: "전체 화면", source: "화면 1", audio: false }]).concat([{ view: "Chrome 탭", source: "SASU-TTS-TAB", sourceType: "DataItem", audio: false }])) {
      await page.reload();
      await page.getByLabel("회의 제목").waitFor();
      await systemTest(`V03 오디오 없는 공유 ${share.view}`, share);
      log("noaudio_result", { view: share.view, alerts: await alerts(), status: await recorderStatus(page), audioElements: await page.locator("audio").count() });
      await tracksAfter(page, log, `after_noaudio_${share.view}`);
      await page.screenshot({ path: path.join(dir, `noaudio-${share.view.replace(/\s/g, "_")}.png`) });
    }
  } else if (scenario === "share-stop") {
    await setMic("granted");
    await systemTest("V03 녹음 중 공유 중지", { view: "전체 화면", source: "화면 1", audio: true });
    await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
    await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await sleep(2500);
    await pickerShare(pid(), { view: "전체 화면", source: "화면 1", audio: true }, log);
    await page.getByRole("button", { name: "녹음 종료" }).waitFor({ timeout: 30_000 });
    const t0 = Date.now();
    log("recording_started", { visible: t0 });
    const poller = statusPoller(page, log, 1000);
    await play([audio("v03-U1.wav")], path.join(dir, "play.jsonl"));
    const bar = await uia(pid(), "-Action", "dump", "-Scope", "*");
    fs.writeFileSync(path.join(dir, "sharing-ui.json"), bar);
    const stopName = (JSON.parse(bar || "[]").find((x) => x.type === "Button" && /공유 중지/.test(x.name)) ?? {}).name;
    log("stop_sharing", { name: stopName, r: stopName ? await uia(pid(), "-Action", "invoke", "-Name", stopName, "-Type", "Button", "-Scope", "*") : "not_found" });
    await sleep(4000);
    poller.stop();
    log("after_stop_sharing", { alerts: await alerts(), status: await recorderStatus(page) });
    await page.screenshot({ path: path.join(dir, "share-stopped.png") });
    await tracksAfter(page, log, "after_stop_sharing");
    const inspect = page.getByRole("button", { name: "확인 구간 보기" });
    if (await inspect.isVisible().catch(() => false)) { await inspect.click(); await sleep(2000); }
    log("local_info", { lines: await localInfo(page) });
    const { reviewId, status } = await saveAndProcess(page, log);
    if (reviewId) {
      const evidence = await collect(reviewId, dir);
      log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata, sections: evidence.review?.sections?.map((s) => s.text) });
    }
  } else if (scenario === "unplug") {
    await prepare(page, log, dir, `V03 장치 분리 ${browser}`);
    await startRecording(page, log);
    const poller = statusPoller(page, log, 1000);
    const playLog = path.join(dir, "play.jsonl");
    await play([audio("v03-U1.wav")], playLog);
    log("before_disable", { status: await recorderStatus(page) });
    fs.writeFileSync(path.join(CTL, "request-disable"), String(Date.now()));
    for (let i = 0; i < 60 && !fs.existsSync(path.join(CTL, "disabled")); i++) await sleep(250);
    const disabledAt = Date.now();
    log("device_disabled_marker", { exists: fs.existsSync(path.join(CTL, "disabled")) });
    const during = [];
    for (let i = 0; i < 8; i++) { await sleep(1000); during.push(await recorderStatus(page)); }
    log("during_disconnect", { first: during[0], last: during.at(-1), timers: during.map((s) => s.timer), persisted: during.map((s) => s.persisted) });
    await tracksAfter(page, log, "after_disable");
    log("devices_after_disable", { devices: await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput").map((d) => d.label)) });
    await page.screenshot({ path: path.join(dir, "unplugged.png") });
    const reselect = page.getByRole("button", { name: "마이크 다시 선택" });
    log("reselect_visible", { visible: await reselect.isVisible().catch(() => false) });
    if (await reselect.isVisible().catch(() => false)) {
      await reselect.click();
      await sleep(2500);
      log("reselect_while_missing", { alerts: await alerts(), status: await recorderStatus(page) });
      await page.screenshot({ path: path.join(dir, "reselect-missing.png") });
    }
    fs.writeFileSync(path.join(CTL, "request-enable"), String(Date.now()));
    for (let i = 0; i < 60 && !fs.existsSync(path.join(CTL, "enabled")); i++) await sleep(250);
    let devices = [];
    for (let i = 0; i < 40; i++) {
      devices = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput").map((d) => d.label));
      if (devices.length) break;
      await sleep(500);
    }
    log("devices_after_enable", { devices, ms: Date.now() - disabledAt });
    await sleep(2000);
    if (await reselect.isVisible().catch(() => false)) await reselect.click();
    await sleep(2500);
    log("after_reselect", { alerts: await alerts(), status: await recorderStatus(page) });
    await page.screenshot({ path: path.join(dir, "reselected.png") });
    if (await page.getByRole("button", { name: "녹음 다시 시작" }).isVisible().catch(() => false)) await resume(page, log);
    await play([audio("v03-U2.wav")], playLog);
    await sleep(1000);
    await stopRecording(page, log);
    await sleep(1500);
    poller.stop();
    log("local_info", { lines: await localInfo(page) });
    await tracksAfter(page, log, "after_stop");
    const { reviewId, status } = await saveAndProcess(page, log);
    if (reviewId) {
      const evidence = await collect(reviewId, dir);
      log("evidence", { status, segments: evidence.segments.map((s) => [s.segment_index, s.sample_count, s.status]), capture: evidence.review?.capture_metadata, sections: evidence.review?.sections?.map((s) => s.text) });
    }
  }
  log("sessions_after", { sessions: await sessions() });
} catch (error) {
  log("error", { message: String(error?.message ?? error).slice(0, 800) });
  await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  fs.writeFileSync(path.join(dir, "done.txt"), String(process.exitCode ?? 0));
  if (scenario === "unplug") fs.writeFileSync(path.join(CTL, "done.txt"), "1");
}
