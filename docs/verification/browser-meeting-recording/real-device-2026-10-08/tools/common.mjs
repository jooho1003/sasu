import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const ROOT = "D:\\바이브코딩\\sasu";
export const WORK = path.join(ROOT, ".vercel", "real-device-20261005");
export const BASE = "http://localhost:3011";
export const PROFILE_ROOT = path.join("C:\\Users\\이주호\\AppData\\Local", "sasu-rd-profiles");
export const DEPT = "22222222-2222-4222-8222-222222222222";
export const env = JSON.parse(fs.readFileSync(path.join(WORK, "env.json"), "utf8"));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const service = () => createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });

export function runDir(name) {
  const dir = path.join(WORK, "runs", `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function logger(dir) {
  const file = path.join(dir, "events.jsonl");
  return (event, data = {}) => {
    const line = JSON.stringify({ t: Date.now(), iso: new Date().toISOString(), event, ...data });
    fs.appendFileSync(file, line + "\n");
    console.log(line);
  };
}

export async function sessionCookies() {
  const auth = createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  let login;
  for (let i = 0; i < 5; i++) {
    login = await auth.auth.signInWithPassword({ email: env.email, password: env.password });
    if (!login.error) break;
    await fetch(`${env.url}/rest/v1/`, { headers: { apikey: env.anon } }).catch(() => {});
    await sleep(1000);
  }
  if (login.error) throw new Error("local_login_failed:" + login.error.code);
  const cookies = [];
  const ssr = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [],
    setAll: (next) => { cookies.splice(0, cookies.length, ...next.map(({ name, value }) => ({ name, value }))); },
  } });
  const adopted = await ssr.auth.setSession({ access_token: login.data.session.access_token, refresh_token: login.data.session.refresh_token });
  if (adopted.error) throw new Error("ssr_session_failed");
  return { cookies, userId: login.data.user.id };
}

/** Real devices only. fakeUi auto-accepts the permission prompt; it does not fake the device. */
export async function launch(browser, profile, { fakeUi = true, args = [] } = {}) {
  // 2026-10-08: profiles live on the system SSD (C:) like a normal Chrome profile. D: is an HDD; with concurrent disk
  // load the recorder's IndexedDB commits stalled >4 s there and the product (correctly) auto-stopped the recording.
  const userDataDir = path.join(process.env.RD_PROFILE_ROOT ?? PROFILE_ROOT, profile);
  fs.mkdirSync(userDataDir, { recursive: true });
  return chromium.launchPersistentContext(userDataDir, {
    channel: browser === "edge" ? "msedge" : "chrome",
    headless: false,
    viewport: { width: 1280, height: 860 },
    locale: "ko-KR",
    args: [...(fakeUi === true ? ["--use-fake-ui-for-media-stream"] : typeof fakeUi === "string" ? [`--use-fake-ui-for-media-stream=${fakeUi}`] : []), ...args],
  });
}

export async function addLogin(context) {
  const { cookies, userId } = await sessionCookies();
  await context.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
  return userId;
}

/** Test probe: wraps the REAL getUserMedia/getDisplayMedia to keep references to returned tracks. */
export const TRACK_PROBE = () => {
  const w = window;
  w.__tracks = [];
  w.__mediaErrors = [];
  const md = navigator.mediaDevices;
  if (!md) return;
  const gum = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => {
    try {
      const s = await gum(c);
      for (const t of s.getTracks()) w.__tracks.push({ via: "getUserMedia", track: t, at: Date.now() });
      return s;
    } catch (e) { w.__mediaErrors.push({ via: "getUserMedia", name: e.name, message: e.message, at: Date.now() }); throw e; }
  };
  if (md.getDisplayMedia) {
    const gdm = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = async (c) => {
      try {
        const s = await gdm(c);
        for (const t of s.getTracks()) w.__tracks.push({ via: "getDisplayMedia", track: t, at: Date.now() });
        return s;
      } catch (e) { w.__mediaErrors.push({ via: "getDisplayMedia", name: e.name, message: e.message, at: Date.now() }); throw e; }
    };
  }
};

export async function trackStates(page) {
  return page.evaluate(() => ({
    tracks: (window.__tracks || []).map((x) => {
      const s = x.track.getSettings();
      return { via: x.via, kind: x.track.kind, label: x.track.label, readyState: x.track.readyState, muted: x.track.muted,
        settings: { echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl,
          sampleRate: s.sampleRate, channelCount: s.channelCount, displaySurface: s.displaySurface } };
    }),
    errors: window.__mediaErrors || [],
  }));
}

function spawnPlayer(files, logFile) {
  return spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(WORK, "play.ps1"), "-Log", logFile, "-Files", files.join(",")], { stdio: "ignore", windowsHide: true });
}
/** Plays WAVs on the default output device in a separate process (not the browser, so Chrome AEC has no reference). */
export const playbackDisabled = () => fs.existsSync(path.join(WORK, "NO_PLAYBACK"));
export function play(files, logFile) {
  if (playbackDisabled()) { fs.appendFileSync(logFile, JSON.stringify({ skipped: files.map((f) => path.basename(f)), t: Date.now() }) + "\n"); return Promise.resolve(0); }
  return new Promise((resolve) => spawnPlayer(files, logFile).on("exit", (code) => resolve(code)));
}
export function playAsync(files, logFile) {
  if (playbackDisabled()) { fs.appendFileSync(logFile, JSON.stringify({ skipped: files.map((f) => path.basename(f)), t: Date.now() }) + "\n"); return { child: { kill() {} }, done: Promise.resolve(0) }; }
  const child = spawnPlayer(files, logFile);
  const done = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, done };
}

export async function recorderStatus(page) {
  return page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    return {
      timer: text(".recorder-timer"),
      persisted: text(".recorder-persisted"),
      chip: text(".recorder-stage-chip"),
      live: text(".recorder-live-status"),
      notices: [...document.querySelectorAll(".recorder-notice")].map((n) => n.textContent.trim()),
      buttons: [...document.querySelectorAll("button")].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim() + (b.disabled ? "(disabled)" : "")),
      meters: [...document.querySelectorAll("meter")].map((m) => Number(m.value)),
      title: document.title,
    };
  });
}

export async function triggerJobs() {
  const res = await fetch(`${BASE}/api/jobs/run`, { method: "POST", headers: { "x-jobs-secret": env.jobsSecret } });
  return res.status === 200 ? res.json() : { status: res.status };
}

export function browserProcesses(profile) {
  const marker = `sasu-rd-profiles\\${profile}`.toLowerCase();
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,CommandLine | ConvertTo-Json -Compress"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const list = JSON.parse(out || "[]");
  return (Array.isArray(list) ? list : [list]).filter((p) => { const c = (p.CommandLine || "").toLowerCase(); return c.includes(marker + "\"") || c.includes(marker + " ") || c.endsWith(marker); }).map((p) => ({
    pid: p.ProcessId, ppid: p.ParentProcessId, ws: Number(p.WorkingSetSize), priv: Number(p.PrivatePageCount),
    type: /--type=([a-z-]+)/.exec(p.CommandLine)?.[1] ?? "browser",
    sub: /--utility-sub-type=([\w.]+)/.exec(p.CommandLine)?.[1] ?? null,
  }));
}

import { execFile } from "node:child_process";
export const uia = (pid, ...args) => new Promise((resolve) => execFile("powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(WORK, "uia.ps1"), "-ProcessId", String(pid), ...args],
  { encoding: "utf8", timeout: 60_000 }, (e, out, err) => resolve(((out || "") + (err || "")).trim())));
export function browserPid(profile) {
  return browserProcesses(profile).find((p) => p.type === "browser")?.pid;
}
/** Operates the REAL share picker like a user: view tab, source, audio toggle, then 공유 (or 취소). */
export async function pickerShare(pid, { view, source, sourceType = "Button", audio = true, cancel = false }, log = () => {}) {
  for (let i = 0; i < 20; i++) { const r = await uia(pid, "-Action", "dump"); if (!r.startsWith("scope_not_found")) break; await sleep(500); }
  if (cancel) { const r = await uia(pid, "-Action", "invoke", "-Name", "취소", "-Type", "Button"); log("picker_cancel", { r }); return r; }
  log("picker_view", { r: await uia(pid, "-Action", "select", "-Name", view, "-Type", "TabItem") });
  await sleep(1200);
  let sourceResult = "";
  for (let i = 0; i < 8; i++) {
    sourceResult = await uia(pid, "-Action", sourceType === "DataItem" ? "select" : "invoke", "-Like", `*${source}*`, "-Type", sourceType);
    if (!sourceResult.startsWith("not_found")) break;
    if (i === 3) log("picker_items", { items: JSON.parse((await uia(pid, "-Action", "dump")) || "[]").filter((x) => ["DataItem", "ListItem", "Button"].includes(x.type)).map((x) => `${x.type}|${x.name}`) });
    await sleep(700);
  }
  log("picker_source", { r: sourceResult });
  await sleep(800);
  const toggleName = view === "Chrome 탭" ? "탭 오디오와 함께 공유" : "시스템 오디오와 함께 공유";
  const state = await uia(pid, "-Action", "state", "-Name", toggleName, "-Type", "Button");
  const on = /state:On/.test(state);
  if (on !== audio) log("picker_audio_toggle", { r: await uia(pid, "-Action", "toggle", "-Name", toggleName, "-Type", "Button") });
  log("picker_audio_state", { before: state, after: await uia(pid, "-Action", "state", "-Name", toggleName, "-Type", "Button") });
  const tree = JSON.parse((await uia(pid, "-Action", "dump")) || "[]");
  const share = tree.find((x) => x.type === "Button" && x.enabled && (x.name === "공유" || x.name === "오디오와 함께 공유"));
  log("picker_tree", { buttons: tree.filter((x) => x.type === "Button").map((x) => `${x.name}|${x.enabled ? "on" : "off"}`) });
  if (!share) return "share_button_not_found";
  const r = await uia(pid, "-Action", "invoke", "-Name", share.name, "-Type", "Button");
  log("picker_share", { name: share.name, r });
  return r;
}
