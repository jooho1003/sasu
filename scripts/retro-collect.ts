import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, readdir, stat, copyFile, unlink, rmdir, mkdtemp } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { RetroActivity } from "../lib/contracts";
import { localDate, parseRetroBundle } from "../lib/retro/bundle";
import { collectGit } from "../lib/retro/collect/git";
import { collectClaude } from "../lib/retro/collect/claude";
import { collectCodex } from "../lib/retro/collect/codex";
import { collectMemory } from "../lib/retro/collect/memory";
import { collectDocs } from "../lib/retro/collect/docs";
import { collectChrome } from "../lib/retro/collect/chrome";

type Config = { repos: string[]; author_emails: string[]; claude: { enabled: boolean }; codex: { enabled: boolean }; memory: { enabled: boolean }; chrome: { enabled: boolean; profile: string; mode: "denylist" | "allowlist"; domains: string[] }; search_terms: boolean; tz: string };
const template: Config = { repos: [], author_emails: [], claude: { enabled: true }, codex: { enabled: true }, memory: { enabled: true }, chrome: { enabled: false, profile: "Default", mode: "denylist", domains: [] }, search_terms: false, tz: "Asia/Seoul" };
const run = promisify(execFile);
const list = async (path: string) => readdir(path, { withFileTypes: true }).catch(() => []);
async function selectedLines(path: string, accept: (line: string) => boolean): Promise<string[]> {
  const result: string[] = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try { for await (const line of reader) { if (line.length < 1024 * 1024 && accept(line)) result.push(line); if (result.length >= 2000) break; } }
  catch { /* A disappearing or unreadable source does not interrupt other sources. */ }
  finally { reader.close(); stream.destroy(); }
  return result;
}
async function frontmatter(path: string): Promise<string> {
  const stream = createReadStream(path, { encoding: "utf8", highWaterMark: 1024 });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const lines: string[] = [];
  try {
    for await (const line of reader) {
      if (!lines.length && line !== "---") break;
      lines.push(line);
      if ((line === "---" && lines.length > 1) || lines.length > 40) break;
    }
  } finally { reader.close(); stream.destroy(); }
  return lines.join("\n");
}
async function main() {
  const { values } = parseArgs({ options: { date: { type: "string" }, config: { type: "string" }, out: { type: "string" }, chrome: { type: "boolean" }, "search-terms": { type: "boolean" }, "dry-run": { type: "boolean" } } });
  const configPath = resolve(values.config ?? join(homedir(), ".sasu", "retro.json"));
  let config: Config;
  try { config = { ...template, ...JSON.parse(await readFile(configPath, "utf8")) }; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("config_invalid");
    if (!values["dry-run"]) { await mkdir(resolve(configPath, ".."), { recursive: true }); await writeFile(configPath, JSON.stringify(template, null, 2), { flag: "wx" }); }
    console.info("config_required: repos·author_emails를 설정한 뒤 다시 실행하세요."); return;
  }
  const date = values.date ?? localDate(new Date(), config.tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date_invalid");
  const rows: RetroActivity[] = [];
  const sinceGit = new Date(Date.parse(date) - 86400000).toISOString();
  const untilGit = new Date(Date.parse(date) + 2 * 86400000).toISOString();
  // Git author filtering is mandatory: no author means no collection from the repository.
  for (const repo of config.repos) for (const author of config.author_emails) {
    try {
      const args = ["-C", repo, "log", `--since=${sinceGit}`, `--until=${untilGit}`, "--fixed-strings", `--author=${author}`, "--format=%H%x1f%aI%x1f%s", "--shortstat"];
      const output = await run("git", args, { maxBuffer: 4 * 1024 * 1024, windowsHide: true });
      rows.push(...collectGit(output.stdout, basename(repo)).filter(a => localDate(a.at, config.tz) === date));
      const commits = rows.filter(a => a.kind === "git_commit" && a.meta.repo === basename(repo));
      for (const commit of commits) {
        const stat = await run("git", ["-C", repo, "show", "--format=", "--numstat", commit.ref, "--", "docs", "CLAUDE.md", "AGENTS.md", ".claude"], { maxBuffer: 1024 * 1024, windowsHide: true });
        const headings = async (ref: string) => (await run("git", ["-C", repo, "grep", "-h", "-E", "^### ADR-[0-9]+:", ref, "--", "docs/ADR.md"], { maxBuffer: 1024 * 1024, windowsHide: true }).catch(() => ({ stdout: "" }))).stdout.split(/\r?\n/);
        const [before, after] = await Promise.all([headings(`${commit.ref}^`), headings(commit.ref)]);
        rows.push(...collectDocs(stat.stdout, before, after, commit.at).map(a => ({ ...a, ref: `${basename(repo)}:${commit.ref.slice(0, 12)}:${a.ref}`.slice(0, 200) })));
      }
    } catch { console.warn("git: unavailable"); }
  }
  const projects = join(homedir(), ".claude", "projects");
  if (config.claude.enabled) {
    const history = await selectedLines(join(homedir(), ".claude", "history.jsonl"), line => line.includes('"display"'));
    rows.push(...collectClaude(history, [], date, config.tz));
  }
  for (const project of config.claude.enabled || config.memory.enabled ? await list(projects) : []) {
    if (!project.isDirectory()) continue;
    const root = join(projects, project.name);
    if (config.claude.enabled) for (const file of await list(root)) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const path = join(root, file.name), info = await stat(path).catch(() => null);
      if (!info || localDate(info.mtime, config.tz) !== date) continue;
      rows.push(...collectClaude([], await selectedLines(path, line => /"type"\s*:\s*"ai-title"/.test(line)), date, config.tz, info.mtime.toISOString()));
    }
    if (config.memory.enabled) for (const file of await list(join(root, "memory"))) {
      if (!file.isFile() || !file.name.endsWith(".md")) continue;
      const path = join(root, "memory", file.name), info = await stat(path).catch(() => null);
      if (!info || localDate(info.mtime, config.tz) !== date || info.size > 1024 * 1024) continue;
      const content = await frontmatter(path);
      rows.push(...collectMemory([{ path: `${project.name}/${file.name}`, mtime: info.mtime.toISOString(), content }], date, config.tz));
    }
  }
  if (config.codex.enabled) {
    // UTC directories on both sides cover a local date crossing UTC midnight.
    for (const offset of [-1, 0, 1]) {
      const utc = new Date(Date.parse(date) + offset * 86400000).toISOString().slice(0, 10);
      const root = join(homedir(), ".codex", "sessions", ...utc.split("-"));
      for (const file of await list(root)) if (file.isFile() && file.name.endsWith(".jsonl")) rows.push(...collectCodex(await selectedLines(join(root, file.name), line => /"type"\s*:\s*"user_message"/.test(line)), file.name.replace(/^rollout-/, "").replace(/\.jsonl$/, ""), date, config.tz));
    }
  }
  if (values.chrome || config.chrome.enabled) {
    const temporary = await mkdtemp(join(tmpdir(), "sasu-retro-"));
    const copy = join(temporary, "History");
    try {
      if (!/^[\w -]+$/.test(config.chrome.profile)) throw new Error("profile_invalid");
      const chromeRoot = process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data") : process.platform === "darwin" ? join(homedir(), "Library", "Application Support", "Google", "Chrome") : join(homedir(), ".config", "google-chrome");
      await copyFile(join(chromeRoot, config.chrome.profile, "History"), copy);
      const since = (Date.parse(date) - 86400000 + 11644473600000) * 1000;
      const until = since + 3 * 86400000 * 1000;
      const searchOptIn = values["search-terms"] || config.search_terms;
      let visits: Parameters<typeof collectChrome>[0], terms: {term: string; visit_time: number}[];
      const sqlite = await import("node:sqlite").catch(() => null);
      if (sqlite) {
        const db = new sqlite.DatabaseSync(copy, { readOnly: true });
        try {
          const query = (sql: string) => {
            const statement = db.prepare(sql);
            statement.setReadBigInts(true);
            return statement.all(since, until).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value])));
          };
          visits = query("select urls.url,urls.title,visits.visit_time,1 as visit_count from visits join urls on urls.id=visits.url where visits.visit_time>=? and visits.visit_time<? order by visits.visit_time limit 10000") as unknown as typeof visits;
          terms = searchOptIn ? query("select k.term,v.visit_time from keyword_search_terms k join visits v on v.url=k.url_id where v.visit_time>=? and v.visit_time<? limit 1000") as unknown as typeof terms : [];
        } finally { db.close(); }
      } else {
        const fallback = fileURLToPath(new URL("./retro-chrome-dump.py", import.meta.url));
        const output = await run(process.platform === "win32" ? "py" : "python3", [...(process.platform === "win32" ? ["-3"] : []), fallback, copy, String(since), String(until), ...(searchOptIn ? ["search-opt-in"] : [])], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
        const parsed = JSON.parse(output.stdout); visits = parsed.visits; terms = parsed.searches;
      }
      const searches = terms.map(row => ({ term: String(row.term), at: new Date(Number(row.visit_time) / 1000 - 11644473600000).toISOString() }));
      rows.push(...collectChrome(visits, searches, { ...config.chrome, enabled: true, search_terms: searchOptIn, date, tz: config.tz }));
    } catch { console.warn("chrome: unavailable"); }
    finally { await unlink(copy).catch(() => undefined); await rmdir(temporary); }
  }
  const unique = [...new Map(rows.map(a => [`${a.kind}:${a.ref}`, a])).values()].slice(0, 500);
  const result = parseRetroBundle({ version: 1, date, tz: config.tz, collected_at: new Date().toISOString(), collector: { name: "sasu-retro-collect", version: "1.0.0" }, activities: unique });
  if (!result.ok) throw new Error(result.code);
  const masked = result.bundle.activities.filter(a => /\[(이메일|전화번호|계좌번호|주민번호|카드번호)\]/.test(`${a.title} ${a.text}`)).length;
  if (values["dry-run"]) { console.table(Object.entries(Object.groupBy(result.bundle.activities, a => a.kind)).map(([kind, values]) => ({ kind, count: values?.length ?? 0 }))); console.table(result.bundle.activities.slice(0,5).map(({kind,title})=>({kind,title}))); }
  else await writeFile(resolve(values.out ?? `retro-${date}.json`), JSON.stringify(result.bundle, null, 2), { flag: "wx" });
  console.info(`activities: ${result.bundle.activities.length} · masked: ${masked} · out: ${values["dry-run"] ? "dry-run" : resolve(values.out ?? `retro-${date}.json`)}`);
}
main().catch(error => { console.error(`retro_collect: ${["config_invalid", "date_invalid", "date_out_of_range", "invalid_bundle", "bundle_too_large"].includes(error?.message) ? error.message : "collection_failed"}`); process.exitCode = 1; });
