import { AsyncLocalStorage } from "node:async_hooks";

import { NotionError, runWithNotionAuth } from "@/lib/notion";
import { decryptNotionToken } from "@/lib/notion-installation";

type Installation = {
  org_id: string;
  workspace_id: string;
  encrypted_token: string;
};

type Credentials = {
  orgId: string;
  workspaceId: string;
  token: string;
};

type Client = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

const workspaceStorage = new AsyncLocalStorage<Credentials>();

function credentials(value: unknown): Credentials {
  if (!value) throw new NotionError("notion_not_configured");
  const row = value as Installation;
  if (
    typeof row.org_id !== "string" ||
    typeof row.workspace_id !== "string" ||
    typeof row.encrypted_token !== "string"
  ) {
    throw new NotionError("notion_not_configured");
  }
  try {
    return {
      orgId: row.org_id,
      workspaceId: row.workspace_id,
      token: decryptNotionToken(
        row.encrypted_token,
        row.org_id,
        row.workspace_id,
      ),
    };
  } catch {
    throw new NotionError("notion_not_configured");
  }
}

async function withInstallation<T>(
  client: Client,
  rpc: string,
  args: Record<string, unknown>,
  action: () => Promise<T>,
): Promise<T> {
  // Resolve every scope, including nested calls: an outer job/department may
  // belong to a different organization or its installation may be revoked.
  const result = await client.rpc(rpc, args);
  if (result.error) throw new NotionError("notion_not_configured");
  const scoped = credentials(result.data);
  return workspaceStorage.run(scoped, () =>
    runWithNotionAuth({ token: scoped.token }, action),
  );
}

export function withNotionForDepartment<T>(
  client: Client,
  deptId: string,
  action: () => Promise<T>,
): Promise<T> {
  return withInstallation(
    client,
    "notion_installation_for_department",
    { p_dept: deptId },
    action,
  );
}

export function withNotionForJob<T>(
  client: Client,
  jobId: string,
  action: () => Promise<T>,
): Promise<T> {
  return withInstallation(
    client,
    "notion_installation_for_job",
    { p_job: jobId },
    action,
  );
}

export function withNotionForAdmin<T>(client: Client, action: () => Promise<T>): Promise<T> {
  return withInstallation(client, "notion_installation_for_admin", {}, action);
}
