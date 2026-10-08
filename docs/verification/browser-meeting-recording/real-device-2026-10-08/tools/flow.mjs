import fs from "node:fs";
import path from "node:path";
import { BASE, DEPT, WORK, play, playAsync, recorderStatus, service, sleep, trackStates, triggerJobs } from "./common.mjs";

export const RECORD_URL = `${BASE}/d/${DEPT}/reviews/record`;

export async function openRecorder(page) {
  const response = await page.goto(RECORD_URL);
  await page.getByLabel("회의 제목").waitFor({ timeout: 30_000 });
  return response?.status();
}

/** Title, consent, real 5-second input test (TTS plays on speakers meanwhile), heard-test checkbox. */
export async function prepare(page, log, dir, title, { mode = "microphone" } = {}) {
  await page.getByLabel("회의 제목").fill(title);
  if (mode !== "microphone") await page.getByRole("radio", { name: "컴퓨터 소리 + 마이크" }).check();
  await page.getByRole("checkbox", { name: /참석자 전원 녹음 동의/ }).check();
  const player = playAsync([path.join(WORK, "tts-probe.wav")], path.join(dir, "play.jsonl"));
  await page.getByRole("button", { name: "5초 테스트 녹음" }).click();
  const meters = [];
  for (let i = 0; i < 10; i++) { await sleep(400); meters.push(...(await recorderStatus(page)).meters); }
  await page.locator("audio").waitFor({ timeout: 20_000 });
  await player.done;
  const testAudio = await page.evaluate(async () => {
    const audio = document.querySelector("audio");
    await new Promise((resolve) => { if (audio.readyState >= 1) resolve(); else audio.onloadedmetadata = resolve; setTimeout(resolve, 3000); });
    return { src: audio.src.slice(0, 5), duration: audio.duration, error: audio.error?.code ?? null };
  });
  log("input_test", { maxMeter: Math.max(0, ...meters), testAudio });
  await page.getByRole("checkbox", { name: /테스트를 듣고/ }).check();
}

export async function startRecording(page, log) {
  const clicked = Date.now();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await page.getByRole("button", { name: "녹음 종료" }).waitFor({ timeout: 30_000 });
  const visible = Date.now();
  log("recording_started", { clicked, visible });
  return visible;
}

export function statusPoller(page, log, every = 1000) {
  let active = true;
  const samples = [];
  (async () => {
    while (active) {
      try {
        const s = await recorderStatus(page);
        const entry = { t: Date.now(), timer: s.timer, persisted: s.persisted, chip: s.chip, meters: s.meters, notices: s.notices };
        samples.push(entry);
        log("status", entry);
      } catch { /* page navigating */ }
      await sleep(every);
    }
  })();
  return { stop: () => { active = false; }, samples };
}

export async function pause(page, log) {
  await page.getByRole("button", { name: "녹음 잠시 멈추기" }).click();
  await page.getByRole("button", { name: "녹음 다시 시작" }).waitFor();
  const t = Date.now();
  log("paused", { t });
  return t;
}

export async function resume(page, log) {
  await page.getByRole("button", { name: "녹음 다시 시작" }).click();
  await page.getByRole("button", { name: "녹음 잠시 멈추기" }).waitFor();
  const t = Date.now();
  log("resumed", { t });
  return t;
}

export async function stopRecording(page, log) {
  await page.getByRole("button", { name: "녹음 종료" }).click();
  const t = Date.now();
  await page.getByRole("button", { name: "녹음 끝내기" }).click();
  await page.getByRole("button", { name: "음성 저장하고 받아쓰기" }).waitFor({ timeout: 30_000 });
  log("stopped", { clicked: t, ready: Date.now() });
  return t;
}

export async function localInfo(page) {
  return page.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent.trim()).filter((t) => t.startsWith("이 기기의 연속 확인 구간")));
}

/** Save → upload segments → finalize → server verification → transcription. Drives the local worker like the product E2E. */
export async function saveAndProcess(page, log, { timeoutMs = 600_000 } = {}) {
  const started = Date.now();
  await page.getByRole("button", { name: "음성 저장하고 받아쓰기" }).click();
  log("save_clicked");
  let reviewId = null;
  while (Date.now() - started < timeoutMs) {
    const m = /\/reviews\/([0-9a-f-]{36})$/.exec(page.url());
    if (m) { reviewId = m[1]; break; }
    const run = await triggerJobs();
    if (run.claimed) log("jobs_run", run);
    await sleep(1500);
  }
  log("review_redirect", { reviewId, ms: Date.now() - started });
  if (!reviewId) return { reviewId: null };
  const db = service();
  let row = null;
  while (Date.now() - started < timeoutMs) {
    const run = await triggerJobs();
    if (run.claimed) log("jobs_run", run);
    const current = await db.from("reviewed_materials").select("status,status_reason,sections").eq("id", reviewId).single();
    row = current.data;
    if (row && ["ready", "failed"].includes(row.status) && Array.isArray(row.sections)) break;
    await sleep(2000);
  }
  log("review_processed", { reviewId, status: row?.status, reason: row?.status_reason, sections: row?.sections?.length, ms: Date.now() - started });
  return { reviewId, status: row?.status };
}

/** Local QA evidence only (service role on the isolated local DB/Storage). */
export async function collect(reviewId, dir, { download = true } = {}) {
  const db = service();
  const review = (await db.from("reviewed_materials").select("id,kind,title,status,status_reason,duration,input_method,original_layout,capture_metadata,sections,file_size,fingerprint").eq("id", reviewId).single()).data;
  const recording = (await db.from("review_recordings").select("id,state,state_reason,input_method,started_at,expires_at,key_version").eq("id", reviewId).maybeSingle()).data;
  const segments = (await db.from("review_original_segments").select("segment_index,attempt,sample_count,bytes,sha256,object_path,status,error_code").eq("review_id", reviewId).order("segment_index")).data ?? [];
  const parts = (await db.from("review_parts").select("part_index,start_seconds,end_seconds,status,attempt,error_code,last_word_end_seconds").eq("review_id", reviewId).order("part_index")).data ?? [];
  const files = [];
  if (download) {
    fs.mkdirSync(path.join(dir, "segments"), { recursive: true });
    for (const segment of segments) {
      const file = await db.storage.from("review-materials").download(segment.object_path);
      if (file.error) { files.push({ index: segment.segment_index, error: file.error.message }); continue; }
      const bytes = Buffer.from(await file.data.arrayBuffer());
      const target = path.join(dir, "segments", `${String(segment.segment_index).padStart(2, "0")}.wav`);
      fs.writeFileSync(target, bytes);
      files.push({ index: segment.segment_index, bytes: bytes.length, path: target });
    }
  }
  const evidence = { review, recording, segments, parts, files };
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}

/** Product player: play from `from` seconds for `ms` and report position advance + errors. */
export async function playbackCheck(page, log, from, ms = 6000) {
  const range = page.getByRole("slider", { name: "녹음 시각" });
  await range.waitFor({ timeout: 30_000 });
  const responses = [];
  const onResponse = (r) => { if (r.url().includes("/original?action=play_original")) responses.push({ status: r.status(), segment: new URL(r.url()).searchParams.get("segment") }); };
  page.on("response", onResponse);
  await range.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));
  }, from);
  await sleep(1500);
  const playButton = page.getByRole("button", { name: /원본 듣기|듣기 잠시 멈추기/ });
  if ((await playButton.textContent())?.includes("원본 듣기")) await playButton.click();
  const startValue = Number(await range.inputValue());
  await sleep(ms);
  const endValue = Number(await range.inputValue());
  const errorText = await page.locator(".recording-player-error, [role=alert]").allTextContents().catch(() => []);
  const button = await page.getByRole("button", { name: /원본 듣기|듣기 잠시 멈추기|원본 불러오는 중/ }).textContent();
  if (button?.includes("듣기 잠시 멈추기")) await page.getByRole("button", { name: "듣기 잠시 멈추기" }).click();
  page.off("response", onResponse);
  const result = { from, startValue, endValue, advanced: endValue - startValue, responses, errorText };
  log("playback_check", result);
  return result;
}

export async function tracksAfter(page, log, label) {
  const states = await trackStates(page);
  log("tracks", { label, ...states, live: states.tracks.filter((t) => t.readyState === "live").length });
  return states;
}

export { play, playAsync };
