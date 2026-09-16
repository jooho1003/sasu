// Explicit migration of the existing manual install. Run only during approved rollout.
import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createServiceSupabaseClient } from "../lib/supabase/service";
import { encryptSlackToken, oauthStateHash, SLACK_SCOPES } from "../lib/slack/installation";
import { mask } from "../lib/mask";

loadEnvConfig(process.cwd());
async function main() {
  const [orgId, adminId, expectedTeam] = process.argv.slice(2);
  if (!z.uuid().safeParse(orgId).success || !z.uuid().safeParse(adminId).success || !/^T[A-Z0-9]+$/.test(expectedTeam ?? "")) throw new Error("usage: tsx scripts/register-legacy-slack.ts <org-uuid> <admin-uuid> <expected-team-id>");
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token?.startsWith("xoxb-")) throw new Error("legacy_token_missing");
  const response = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  const result = await response.json() as { ok?: boolean; team_id?: string; team?: string; user_id?: string };
  if (!response.ok || result.ok !== true || result.team_id !== expectedTeam || !/^U[A-Z0-9]+$/.test(result.user_id ?? "")) throw new Error("legacy_workspace_mismatch");
  const granted = (response.headers.get("x-oauth-scopes") ?? "").split(",").map(value => value.trim());
  if (SLACK_SCOPES.some(scope => !granted.includes(scope))) throw new Error("legacy_scopes_missing_reinstall_required");
  const encrypted = encryptSlackToken(token, orgId, expectedTeam);
  const client = createServiceSupabaseClient();
  const hash = oauthStateHash(randomBytes(32).toString("base64url"));
  const state = await client.from("slack_oauth_states").insert({ state_hash: hash, org_id: orgId, user_id: adminId, consumed_at: new Date().toISOString() });
  if (state.error) throw new Error("legacy_state_failed");
  const installed = await client.rpc("complete_slack_installation", { p_hash: hash, p_actor: adminId, p_org: orgId, p_team: expectedTeam, p_name: mask(result.team ?? "Slack"), p_bot: result.user_id, p_encrypted: encrypted, p_scopes: granted });
  if (installed.error || installed.data !== true) throw new Error("legacy_installation_failed");
  process.stdout.write(JSON.stringify({ ok: true, orgId, teamId: expectedTeam }) + "\n");
}
main().catch(error => { process.stderr.write(error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message + "\n" : "legacy_installation_failed\n"); process.exitCode = 1; });
