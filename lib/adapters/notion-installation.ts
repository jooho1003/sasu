import { createServiceSupabaseClient } from "@/lib/supabase/service";

type VerifiedNotionInstallation = {
  actorId: string;
  orgId: string;
  workspaceId: string;
  workspaceName: string | null;
  botId: string;
  encryptedToken: string;
};

export async function saveNotionInstallation(
  installation: VerifiedNotionInstallation,
): Promise<"saved" | "workspace_conflict" | "failed"> {
  const saved = await createServiceSupabaseClient().rpc(
    "complete_notion_installation",
    {
      p_actor: installation.actorId,
      p_org: installation.orgId,
      p_workspace: installation.workspaceId,
      p_name: installation.workspaceName,
      p_bot: installation.botId,
      p_kind: "internal_token",
      p_encrypted: installation.encryptedToken,
    },
  );
  if (saved.error?.code === "23505") return "workspace_conflict";
  return saved.error || saved.data !== true ? "failed" : "saved";
}
