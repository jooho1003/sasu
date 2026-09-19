import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
const root = process.cwd();
const base = resolve(root, "docs/planning/persona-review-2026-09-18");
const out = resolve(root, "docs/verification/persona-review-2026-09-18");
const walk = dir => readdirSync(dir).flatMap(name => {
  const file = resolve(dir, name);
  return statSync(file).isDirectory() ? walk(file) : [file];
});
const docs = walk(base).filter(file => file.endsWith(".md"));
const issues = [], links = [], sourceFiles = new Set();
function parseLinks(content) {
  const found = [];
  for (let i = 0; i < content.length - 1; i++) {
    if (content.slice(i, i + 2) !== "](") continue;
    const start = i + 2; let depth = 1, j = start;
    for (; j < content.length && depth > 0; j++) {
      if (content[j] === "\\") { j++; continue; }
      if (content[j] === "(") depth++;
      if (content[j] === ")") depth--;
    }
    if (depth === 0) { found.push(content.slice(start, j - 1)); i = j - 1; }
  }
  return found;
}
const personas = [];
for (const file of docs) {
  const body = readFileSync(file, "utf8");
  if (body.includes("\uFFFD")) issues.push({ file: relative(root, file), issue: "Replacement character" });
  if (body.split("\n").some(line => /[\t ]+\r?$/.test(line))) issues.push({ file: relative(root, file), issue: "Trailing whitespace" });
  if ([...body.matchAll(/^```/gm)].length % 2) issues.push({ file: relative(root, file), issue: "Unbalanced code fences" });
  for (const target of parseLinks(body)) {
    if (/^https?:/.test(target)) { links.push({ from: relative(root, file), target, external: true }); continue; }
    const [path] = target.split("#");
    if (!path) continue;
    const resolved = resolve(dirname(file), path);
    const exists = existsSync(resolved);
    links.push({ from: relative(root, file), target, exists });
    if (!exists && !["document-check.json", "source-snapshot.json"].some(suffix => target.endsWith(suffix))) issues.push({ from: relative(root, file), target, issue: "Missing local target" });
    if (exists && !resolved.startsWith(base) && !resolved.startsWith(out) && statSync(resolved).isFile()) sourceFiles.add(resolved);
  }
  if (file.includes("personas") && !file.endsWith("README.md")) {
    for (const line of body.split("\n")) {
      if (!/^\| \*\*[A-Z]{2}-L[1-5] /.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
      const id = cells[0].match(/[A-Z]{2}-L[1-5]/)[0];
      const gaps = [...new Set([...line.matchAll(/G\d{2}/g)].map(m => m[0]))];
      personas.push({ id, file: relative(base, file).replaceAll("\\", "/"), role: cells[0].replaceAll("**", ""), workflow: cells[1], benefitHypothesis: cells[2], drawback: cells[3], sizeComparisonAndResearchQuestion: cells[4], gaps });
      if (cells.length !== 5 || !cells[4].includes("S는") || !cells[4].includes("M은") || gaps.length === 0) issues.push({ id, issue: "Persona coverage incomplete" });
    }
  }
}
const gapText = readFileSync(resolve(base, "gaps.md"), "utf8"), designText = readFileSync(resolve(base, "designs.md"), "utf8");
const gaps = [...gapText.matchAll(/\| \*\*(G\d{2}) /g)].map(m => m[1]);
const designs = [...designText.matchAll(/^## (D\d{2}) /gm)].map(m => m[1]);
const criteria = [...new Set([...designText.matchAll(/\bT\d{2}\b/g)].map(m => m[0]))];
const journeys = [...readFileSync(resolve(base, "journeys.md"), "utf8").matchAll(/^## (J\d{2}) /gm)].map(m => m[1]);
for (const [name, value, expected] of [["personas", personas.length, 50], ["gaps", gaps.length, 28], ["designs", designs.length, 10], ["criteria", criteria.length, 52], ["journeys", journeys.length, 14]]) if (value !== expected) issues.push({ name, value, expected });
for (const [prefix, ids, count] of [["G", gaps, 28], ["D", designs, 10], ["T", criteria, 52], ["J", journeys, 14]]) {
  for (let n = 1; n <= count; n++) if (!ids.includes(prefix + String(n).padStart(2, "0"))) issues.push({ issue: "Missing sequential id", id: prefix + String(n).padStart(2, "0") });
}
if (new Set(personas.map(p => p.id)).size !== personas.length) issues.push({ issue: "Duplicate persona id" });
const boundaryProfiles = readFileSync(resolve(base, "scope-and-size.md"), "utf8").split("## 경계 페르소나")[1];
for (const gap of gaps) {
  if (!personas.some(p => p.gaps.includes(gap)) && !boundaryProfiles.includes(gap)) issues.push({ gap, issue: "No department or boundary persona linkage" });
  if (!designText.includes(gap)) issues.push({ gap, issue: "No design linkage" });
}
writeFileSync(resolve(out, "persona-matrix.json"), JSON.stringify({ scope: "Hypothetical personas; not interview evidence", personas }, null, 2));
const snapshot = { at: new Date().toISOString(), scope: "Read-only input fingerprints at document check time; concurrent work may change files", files: [...sourceFiles].sort().map(file => ({ path: relative(root, file).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), size: statSync(file).size })) };
writeFileSync(resolve(out, "source-snapshot.json"), JSON.stringify(snapshot, null, 2));
const result = { at: new Date().toISOString(), files: docs.length, personas: personas.length, departments: new Set(personas.map(p => p.id.split("-")[0])).size, gaps: gaps.length, designs: designs.length, acceptanceCriteria: criteria.length, journeys: journeys.length, localLinks: links.filter(l => !l.external).length, sourceFiles: sourceFiles.size, issues, disclaimer: "Checks document structure and relative path existence only. Does not validate product behavior, source claim entailment, external links, or all heading fragments." };
writeFileSync(resolve(out, "document-check.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (issues.length) process.exitCode = 1;
