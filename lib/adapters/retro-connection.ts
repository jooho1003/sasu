import { RetroCredential, type RetroConnectionProvider } from "@/lib/contracts";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { encryptConnectionSecret } from "@/lib/retro/connection-crypto";
import { isDepartmentConnector } from "@/lib/retro/connectors/department";
import { CONNECTOR_LABELS } from "@/lib/retro/connectors/registry";

/** Credential ingestion only. The DB requires a consumed, unexpired state bound to this actor. */
export async function saveRetroConnection(input: {
  hash: string;
  actor: string;
  dept: string;
  provider: RetroConnectionProvider;
  credential: RetroCredential;
}): Promise<string> {
  const credential = RetroCredential.parse(input.credential);
  const encrypted = encryptConnectionSecret(
    JSON.stringify(credential),
    input.actor,
    input.provider,
    input.dept,
  );
  const result = await createServiceSupabaseClient().rpc(
    "complete_retro_connection",
    {
      p_hash: input.hash,
      p_actor: input.actor,
      p_encrypted: encrypted,
      p_label:
        CONNECTOR_LABELS[input.provider] +
        (isDepartmentConnector(input.provider) ? " 부서 자료" : " 개인 계정"),
      p_scopes: credential.scopes,
    },
  );
  if (result.error || !result.data) throw new Error("connector_failed");
  return result.data;
}
