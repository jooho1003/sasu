// Writes LOCAL review-qa connection values for the session-1 harness. Never prints values.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const info = JSON.parse(execSync("npx --yes supabase status --workdir .vercel/review-qa -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(info.API_URL)) throw new Error("local_supabase_required");
const credentials = JSON.parse(readFileSync(".vercel/review-qa/credentials.json", "utf8"));
writeFileSync(".vercel/real-device-20261005/env.json", JSON.stringify({
  url: info.API_URL, anon: info.ANON_KEY, service: info.SERVICE_ROLE_KEY,
  email: "review-lead@example.test", password: credentials.password, jobsSecret: credentials.password,
}));
console.log("env.json written for", info.API_URL);
