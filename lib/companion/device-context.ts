// Design Ref: desktop-companion §4.1, §7 S1~S3 — 부서는 연결 RPC에서만 정한다.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActorContext, Failure } from "@/lib/companion/context";
import { createBearerSupabaseClient } from "@/lib/supabase/bearer";

type BearerContext = {
  ok: true;
  client: SupabaseClient;
  userId: string;
  token: string;
};

type DeviceContext = ActorContext & {
  linkId: string;
  deptName: string;
  displayName: string;
};

type DeviceContextResult = { ok: true; ctx: DeviceContext };

type Dependencies = {
  createClient?: (accessToken: string) => SupabaseClient;
};

type CompanionContextRow = {
  link_id: string;
  dept_id: string;
  dept_name: string;
  role: "lead" | "member";
  display_name: string;
  consented_at: string | null;
};

function failure(
  status: number,
  code: string,
  error: string,
): Failure {
  return { ok: false, status, error, code };
}

function isCompanionContextRow(value: unknown): value is CompanionContextRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.link_id === "string" &&
    typeof row.dept_id === "string" &&
    typeof row.dept_name === "string" &&
    (row.role === "lead" || row.role === "member") &&
    typeof row.display_name === "string" &&
    (row.consented_at === null || typeof row.consented_at === "string")
  );
}

export function readBearer(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s,]+)$/i);
  return match?.[1] ?? null;
}

export async function requireBearerUser(
  request: Request,
  deps: Dependencies = {},
): Promise<BearerContext | Failure> {
  const token = readBearer(request);
  if (!token) {
    return failure(401, "no_token", "기기 로그인이 필요합니다.");
  }

  const createClient = deps.createClient ?? createBearerSupabaseClient;

  try {
    const client = createClient(token);
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);

    if (error || !user) {
      return failure(
        401,
        "session_invalid",
        "기기 로그인이 만료되었습니다. 다시 로그인해 주세요.",
      );
    }

    return { ok: true, client, userId: user.id, token };
  } catch {
    return failure(
      401,
      "session_invalid",
      "기기 로그인이 만료되었습니다. 다시 로그인해 주세요.",
    );
  }
}

export async function requireDeviceContext(
  request: Request,
  deps: Dependencies = {},
): Promise<DeviceContextResult | Failure> {
  const auth = await requireBearerUser(request, deps);
  if (!auth.ok) {
    return auth;
  }

  try {
    const { data, error } = await auth.client.rpc("companion_context");

    if (error) {
      if (error.code === "42501") {
        return failure(403, "forbidden", "이 작업을 할 수 없습니다.");
      }
      return failure(
        500,
        "context_failed",
        "기기 연결을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      );
    }

    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isCompanionContextRow(row)) {
      return failure(
        401,
        "device_revoked",
        "이 기기 연결이 해제되었습니다. 다시 로그인해 주세요.",
      );
    }

    return {
      ok: true,
      ctx: {
        client: auth.client,
        userId: auth.userId,
        deptId: row.dept_id,
        role: row.role,
        consentedAt: row.consented_at,
        linkId: row.link_id,
        deptName: row.dept_name,
        displayName: row.display_name,
      },
    };
  } catch {
    return failure(
      500,
      "context_failed",
      "기기 연결을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  }
}
