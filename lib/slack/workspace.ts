import { AsyncLocalStorage } from "node:async_hooks";
import { decryptSlackToken } from "@/lib/slack/installation";

type Credentials = { token: string | null; orgId: string | null; teamId: string | null };
type Installation = { org_id: string; team_id: string; encrypted_token: string };
type Client = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const context = new AsyncLocalStorage<Credentials>();
export function currentSlackToken(): string | null | undefined { return context.getStore()?.token; }
export function currentSlackWorkspace(): Credentials | undefined { return context.getStore(); }
export function withSlackCredentials<T>(credentials: Credentials, action: () => Promise<T>): Promise<T> { return context.run(credentials, action); }
function credentials(value: unknown): Credentials {
  if (!value) return { token: null, orgId: null, teamId: null };
  const row = value as Installation;
  if (typeof row.org_id !== "string" || typeof row.team_id !== "string" || typeof row.encrypted_token !== "string") throw new Error("slack_credential_unavailable");
  return { token: decryptSlackToken(row.encrypted_token, row.org_id, row.team_id), orgId: row.org_id, teamId: row.team_id };
}
export async function slackWorkspaceForTeam(client: Client, team: unknown): Promise<Credentials | null> {
  if (typeof team !== "string" || !/^T[A-Z0-9]+$/.test(team)) return null;
  const result = await client.rpc("slack_installation_for_team", { p_team: team });
  if (result.error) throw new Error("slack_workspace_lookup_failed");
  return result.data ? credentials(result.data) : null;
}
export async function withSlackDepartment<T>(client: Client, dept: string, action: () => Promise<T>): Promise<T> {
  const result = await client.rpc("slack_installation_for_department", { p_dept: dept });
  if (result.error) throw new Error("slack_workspace_lookup_failed");
  return withSlackCredentials(credentials(result.data), action);
}
export async function withSlackJob<T>(client: Client, jobId: string, kind: string, action: () => Promise<T>): Promise<T> {
  if (!["send_slack", "slack_backfill", "answer", "deliver_slack_answer", "send_reminder"].includes(kind)) return action();
  const result = await client.rpc("slack_installation_for_job", { p_job: jobId });
  if (result.error) throw new Error("slack_workspace_lookup_failed");
  return withSlackCredentials(credentials(result.data), action);
}
