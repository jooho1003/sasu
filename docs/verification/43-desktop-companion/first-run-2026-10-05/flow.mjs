// New-account first-run flow for the recorded gate check (runs as the fresh local user).
// Download → silent per-user install → first launch → real e-mail code login → department → first question → cited answer.
// Never prints the e-mail address in full or the login code.
import { appendFile, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const DIR = 'C:\\Users\\Public\\sasu-rec-20261005';
const EMAIL = process.argv[2];
const QUESTION = '영업팀에 새로 왔어요. 외주 견적이 기존보다 크게 오르면 바로 승인해도 되나요? 기준이 뭔지 알려주세요.';
const INSTALLER_URL = 'https://github.com/jooho1003/sasu-desktop-releases/releases/latest/download/sasu-desktop-setup-0.1.2.exe';
const INSTALLER_SHA256 = '0f868c18482ab3f274d3b5a7b3aa42420475f9acd2794b71b7b481eb1fab6deb';
const masked = EMAIL.replace(/^(.{3}).*@/, '$1***@');
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const summary = { user: process.env.USERNAME, startedAt: new Date(t0).toISOString(), steps: {} };

async function log(step, extra = {}) {
  const line = { at: new Date().toISOString(), t: Number(secs()), step, ...extra };
  summary.steps[step] = line.t;
  console.log(`[${secs().padStart(6)}s] ${step}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
  await appendFile(join(DIR, 'flow-log.jsonl'), JSON.stringify(line) + '\n');
}
const waitFile = async (path, timeoutMs) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { try { await access(path); return true; } catch { await new Promise(r => setTimeout(r, 500)); } }
  return false;
};

const { _electron: electron } = await import(pathToFileURL('D:\\바이브코딩\\sasu\\node_modules\\@playwright\\test\\index.mjs').href);
let app;
try {
  await log('start', { account: process.env.USERNAME, email: masked });

  // 1. Download the public installer.
  const res = await fetch(INSTALLER_URL);
  if (!res.ok) throw new Error(`download_${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(bytes).digest('hex');
  const installer = join(tmpdir(), 'sasu-desktop-setup-0.1.2.exe');
  await writeFile(installer, bytes);
  await log('downloaded', { mb: (bytes.length / 1e6).toFixed(1), sha256Match: sha === INSTALLER_SHA256 });
  if (sha !== INSTALLER_SHA256) throw new Error('installer_hash_mismatch');

  // 2. Per-user install (silent: no wizard clicks are automated).
  await log('install_started');
  const code = await new Promise((resolve, reject) => { const p = spawn(installer, ['/S'], { stdio: 'ignore' }); p.on('error', reject); p.on('exit', resolve); });
  // The NSIS stub can exit before its child finishes copying files; wait for the app executable.
  const candidates = ['sasu-desktop', '사수'].map(folder => join(process.env.LOCALAPPDATA, 'Programs', folder, '사수.exe'));
  let exe = null;
  for (let i = 0; i < 240 && !exe; i++) {
    for (const path of candidates) { try { await access(path); exe = path; break; } catch {} }
    if (!exe) await new Promise(r => setTimeout(r, 500));
  }
  if (!exe) throw new Error('installed_app_missing');
  await new Promise(r => setTimeout(r, 1500)); // let the installer finish writing shortcuts
  await log('installed', { exit: code, folder: exe.split('\\').slice(-2, -1)[0] });

  // 3. First launch with the account's default (empty) profile.
  app = await electron.launch({ executablePath: exe, timeout: 90000 });
  let panel, pet;
  for (let i = 0; i < 180 && !(panel && pet); i++) {
    panel = app.windows().find(w => w.url().includes('#panel'));
    pet = app.windows().find(w => w.url().includes('#pet'));
    if (!(panel && pet)) await new Promise(r => setTimeout(r, 250));
  }
  if (!panel || !pet) throw new Error('windows_missing');
  await log('app_started', { version: await app.evaluate(({ app }) => app.getVersion()) });
  // Keep the panel on screen for the recording (blur would hide it otherwise).
  await panel.evaluate(() => window.sasu.settings.set({ panelPinned: true })).catch(() => {});
  await pet.locator('canvas').click();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('#panel')); w?.show(); w?.focus(); });
  await panel.getByRole('heading', { name: '사수 시작하기' }).waitFor({ timeout: 60000 });
  await log('login_screen');

  // 4. Real e-mail code login.
  await panel.getByRole('textbox', { name: '이메일' }).pressSequentially(EMAIL, { delay: 45 });
  await panel.getByRole('button', { name: '코드 받기' }).click();
  await panel.getByRole('heading', { name: '코드 확인' }).waitFor({ timeout: 30000 });
  await log('code_requested', { email: masked });
  const codeFile = join(DIR, 'code.txt');
  if (!(await waitFile(codeFile, 300000))) throw new Error('code_not_provided');
  const otp = (await readFile(codeFile, 'utf8')).trim();
  await rm(codeFile, { force: true });
  if (!/^\d{6}$/.test(otp)) throw new Error('code_format');
  await log('code_received_from_mailbox');
  await panel.getByRole('textbox', { name: '6자리 코드' }).pressSequentially(otp, { delay: 120 });
  await panel.getByRole('button', { name: '로그인하기' }).click();

  // 5. Department (consented) → question screen.
  const deptHeading = panel.getByRole('heading', { name: '부서 고르기' });
  const askHeading = panel.getByRole('heading', { name: '무엇이 궁금한가요?' });
  await deptHeading.or(askHeading).first().waitFor({ timeout: 45000 });
  if (await deptHeading.isVisible().catch(() => false)) {
    await log('department_screen');
    await panel.getByRole('button', { name: /파일럿 부서/ }).first().click();
  }
  await askHeading.waitFor({ timeout: 60000 });
  await log('question_screen');

  // 6. First question → cited answer.
  await panel.getByRole('textbox', { name: '질문 내용' }).pressSequentially(QUESTION, { delay: 25 });
  await panel.getByRole('button', { name: '질문하기' }).click();
  await log('question_sent');
  const evidence = panel.getByRole('region', { name: '근거가 된 원문' });
  const refused = panel.getByText('근거가 부족해 답하지 못했습니다.');
  const failed = panel.getByText('답을 만들지 못했습니다', { exact: false });
  let outcome = 'timeout';
  for (let i = 0; i < 360 && outcome === 'timeout'; i++) {
    if (await evidence.isVisible().catch(() => false)) outcome = 'cited';
    else if (await refused.isVisible().catch(() => false)) outcome = 'refused';
    else if (await failed.isVisible().catch(() => false)) outcome = 'failed';
    else await new Promise(r => setTimeout(r, 500));
  }
  const citations = outcome === 'cited' ? await evidence.locator('article').count() : 0;
  await log('answer_shown', { outcome, citations });
  summary.outcome = outcome; summary.citations = citations;
  summary.installToAnswerSeconds = Number((summary.steps.answer_shown - summary.steps.install_started).toFixed(1));
  summary.totalSeconds = summary.steps.answer_shown;
  await panel.screenshot({ path: join(DIR, 'first-answer.png') });
  await new Promise(r => setTimeout(r, 10000)); // keep the answer on screen for the recording

  // 7. Clean up the test session on this account.
  await panel.getByRole('button', { name: '설정', exact: true }).click();
  await panel.getByRole('button', { name: '로그아웃하기', exact: true }).click();
  await panel.getByRole('heading', { name: '사수 시작하기' }).waitFor({ timeout: 30000 });
  await log('logged_out');
} catch (error) {
  summary.error = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
  await log('error', { message: summary.error });
} finally {
  if (app) await app.close().catch(() => {});
  summary.finishedAt = new Date().toISOString();
  await writeFile(join(DIR, 'flow-summary.json'), JSON.stringify(summary, null, 2));
  console.log('done', JSON.stringify({ outcome: summary.outcome, installToAnswerSeconds: summary.installToAnswerSeconds, error: summary.error ?? null }));
  await new Promise(r => setTimeout(r, 4000));
}
