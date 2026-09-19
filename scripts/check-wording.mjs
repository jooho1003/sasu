import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const forbidden = new Map([["원장", "결정 기록"], ["세팅", "설정"], ["기록 보존", "기록 보관"], ["문서 평가", "문서 점수표"], ["음성·자료 검토", "올린 자료"], ["합성 데이터", "가상 자료"], ["합성 지원자", "가상 지원자"], ["멤버십", "부서 소속"], ["매직링크", "로그인 링크"]]);
const files = [];
function walk(dir) { for (const entry of readdirSync(dir)) { if (["node_modules", ".next", ".git", "test-results", "docs"].includes(entry)) continue; const path = join(dir, entry); if (statSync(path).isDirectory()) walk(path); else if (/\.(tsx|ts|jsx|js)$/.test(entry)) files.push(path); } }
walk(join(root, "app")); walk(join(root, "components"));
const findings = [];
for (const file of files) { const lines = readFileSync(file, "utf8").split(/\r?\n/); lines.forEach((line, index) => { for (const [term, replacement] of forbidden) if (line.includes(term)) findings.push({ file: relative(root, file), line: index + 1, term, replacement }); }); }
console.log(JSON.stringify({ scanned: files.length, findings: findings.length, findings: findings.slice(0, 200) }, null, 2));
