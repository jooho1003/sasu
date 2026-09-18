// Explicit migration of the existing single-workspace token. Dry-run is the default.
import { loadEnvConfig } from "@next/env";
import { z } from "zod";

import {
  encryptNotionToken,
  notionTokenEncryptionConfigured,
} from "../lib/notion-installation";
import { mask } from "../lib/mask";
import { notionWhoAmI, runWithNotionAuth } from "../lib/notion";
import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const orgId = args.find((value) => value !== "--apply");
  const apply = args.includes("--apply");
  if (
    !z.uuid().safeParse(orgId).success ||
    args.some((value) => value !== orgId && value !== "--apply")
  ) {
    throw new Error(
      "usage: tsx scripts/register-legacy-notion.ts <org-uuid> [--apply]",
    );
  }
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) throw new Error("legacy_token_missing");
  if (!notionTokenEncryptionConfigured()) {
    throw new Error("notion_encryption_not_configured");
  }

  const installation = await runWithNotionAuth({ token }, notionWhoAmI);
  const workspaceId =
    installation.workspaceId ?? `bot:${installation.botId}`;
  const preview = {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    orgId,
    workspaceId,
    botId: installation.botId,
  };
  if (!apply) {
    process.stdout.write(`${JSON.stringify(preview)}\n`);
    return;
  }

  const client = createServiceSupabaseClient();
  const admin = await client
    .from("org_admins")
    .select("user_id")
    .eq("org_id", orgId)
    .order("granted_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string }>();
  if (admin.error || !admin.data) throw new Error("org_admin_missing");
  const encrypted = encryptNotionToken(token, orgId!, workspaceId);
  const saved = await client.rpc("complete_notion_installation", {
    p_actor: admin.data.user_id,
    p_org: orgId,
    p_workspace: workspaceId,
    p_name: installation.workspaceName
      ? mask(installation.workspaceName).slice(0, 200)
      : null,
    p_bot: installation.botId,
    p_kind: "internal_token",
    p_encrypted: encrypted,
  });
  if (saved.error || saved.data !== true) {
    throw new Error("legacy_installation_failed");
  }
  process.stdout.write(`${JSON.stringify(preview)}\n`);
}

main().catch((error) => {
  const message =
    error instanceof Error && /^[a-z_]+$/u.test(error.message)
      ? error.message
      : "legacy_installation_failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
