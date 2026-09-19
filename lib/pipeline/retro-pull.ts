import { RetroConnectionProvider, RetroCredential } from "@/lib/contracts";
import { registerHandler } from "@/lib/jobs";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "@/lib/retro/connection-crypto";
import { refreshCredential } from "@/lib/retro/connectors/auth";
import { pullConnector } from "@/lib/retro/connectors/pull";
import { connectorError } from "@/lib/retro/connectors/http";
import { parseConnectorConfig } from "@/lib/retro/connectors/registry";

export async function scheduleRetroPulls() {
  if (process.env.SASU_RETRO_ENABLED !== "true") return;
  const result = await createServiceSupabaseClient().rpc(
    "schedule_retro_pulls",
  );
  if (result.error) throw connectorError("connector_failed");
}
export async function pullRetroConnection(payload: {
  connectionId: string;
  date: string;
}) {
  if (process.env.SASU_RETRO_ENABLED !== "true") return;
  const client = createServiceSupabaseClient();
  const claimed = await client.rpc("claim_retro_pull", {
    p_connection: payload.connectionId,
  });
  if (claimed.error) throw connectorError("connector_failed");
  if (!claimed.data) return;
  const c = claimed.data;
  try {
    // Leave time to persist before the DB's two-minute lease expires.
    const deadline = AbortSignal.timeout(75000);
    const fetcher: typeof fetch = (url, init) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.any([
          deadline,
          ...(init?.signal ? [init.signal] : []),
        ]),
      });
    const provider = RetroConnectionProvider.parse(c.provider);
    const config = parseConnectorConfig(provider, c.config);
    const stored = RetroCredential.parse(
      JSON.parse(
        decryptConnectionSecret(
          c.encrypted_secret,
          c.user_id,
          provider,
          c.dept_id,
        ),
      ),
    );
    const credential = await refreshCredential(
      provider,
      stored,
      fetcher,
      config,
    );
    const encrypted = encryptConnectionSecret(
      JSON.stringify(credential),
      c.user_id,
      provider,
      c.dept_id,
    );
    // Persist rotating refresh tokens before subsequent API calls can fail.
    if (
      credential.accessToken !== stored.accessToken ||
      credential.refreshToken !== stored.refreshToken
    ) {
      const refreshed = await client.rpc("refresh_retro_pull", {
        p_connection: c.id,
        p_lease: c.lease,
        p_encrypted: encrypted,
      });
      if (refreshed.error) throw connectorError("connector_failed");
      if (!refreshed.data) return;
    }
    const activities = await pullConnector(
      provider,
      config,
      credential,
      payload.date,
      fetcher,
    );
    const saved = await client.rpc("save_retro_pull", {
      p_connection: c.id,
      p_lease: c.lease,
      p_date: payload.date,
      p_activities: activities,
      p_encrypted: encrypted,
    });
    if (saved.error) throw connectorError("connector_failed");
    // NULL means revoked/replaced/expired while the HTTP request was in flight.
  } catch (error) {
    const raw =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "connector_failed";
    const code = [
      "rate_limited",
      "connection_credential_unavailable",
      "connector_auth_failed",
      "connector_scope_denied",
      "connector_timeout",
    ].includes(raw)
      ? raw
      : "connector_failed";
    const recorded = await client.rpc("fail_retro_pull", {
      p_connection: c.id,
      p_lease: c.lease,
      p_error: code,
    });
    if (recorded.error) throw connectorError("connector_failed");
    if (recorded.data === false) return;
    const retry =
      error &&
      typeof error === "object" &&
      "retryAfterSeconds" in error &&
      typeof error.retryAfterSeconds === "number"
        ? error.retryAfterSeconds
        : undefined;
    throw connectorError(code, retry);
  }
}
export function registerRetroPullHandler() {
  registerHandler("retro_pull", async (payload) => {
    if (!payload || typeof payload !== "object")
      throw connectorError("connector_failed");
    const p = payload as Record<string, unknown>;
    if (
      typeof p.connectionId !== "string" ||
      typeof p.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.date)
    )
      throw connectorError("connector_failed");
    await pullRetroConnection({ connectionId: p.connectionId, date: p.date });
  });
}
