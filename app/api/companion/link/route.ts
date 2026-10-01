// Design Ref: desktop-companion §4 E02~E04 — 연결·현재 컨텍스트·해제의 얇은 배선.
import {
  CompanionContextResponse,
  CompanionLinkInput,
  CompanionLinkResponse,
} from "@/lib/contracts";
import { jsonResult, type Result } from "@/lib/companion/context";
import {
  requireBearerUser,
  requireDeviceContext,
} from "@/lib/companion/device-context";

type RpcError = { code?: string; message?: string } | null;

function failure<T>(
  status: number,
  code: string,
  error: string,
): Result<T> {
  return { ok: false, status, code, error };
}

function linkRpcFailure<T>(error: RpcError): Result<T> {
  if (error?.code === "42501") {
    return failure(403, "forbidden", "이 부서에는 기기를 연결할 수 없습니다.");
  }
  if (error?.code === "P0001" && error.message === "device_link_limit") {
    return failure(
      429,
      "device_link_limit",
      "연결할 수 있는 기기는 5대까지입니다. 쓰지 않는 기기를 먼저 해제해 주세요.",
    );
  }
  if (error?.code === "22023") {
    return failure(
      401,
      "session_invalid",
      "기기 로그인이 만료되었습니다. 다시 로그인해 주세요.",
    );
  }
  return failure(
    500,
    "link_failed",
    "기기를 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  );
}

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return jsonResult(auth);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResult(
      failure(400, "invalid_input", "입력값을 확인해 주세요."),
    );
  }

  const input = CompanionLinkInput.safeParse(raw);
  if (!input.success) {
    return jsonResult(
      failure(400, "invalid_input", "입력값을 확인해 주세요."),
    );
  }

  const linked = await auth.client.rpc("link_device", {
    p_dept: input.data.dept_id,
    p_device_name: input.data.device_name,
    p_app_version: input.data.app_version,
  });

  if (linked.error || typeof linked.data !== "string") {
    return jsonResult(linkRpcFailure(linked.error));
  }

  const device = await requireDeviceContext(request, {
    createClient: () => auth.client,
  });
  if (!device.ok) {
    return jsonResult(device);
  }
  if (device.ctx.linkId !== linked.data) {
    return jsonResult(linkRpcFailure(null));
  }

  const response = CompanionLinkResponse.safeParse({
    link_id: device.ctx.linkId,
    dept: { id: device.ctx.deptId, name: device.ctx.deptName },
    role: device.ctx.role,
  });
  if (!response.success) {
    return jsonResult(linkRpcFailure(null));
  }

  return jsonResult({ ok: true, status: 201, body: response.data });
}

export async function GET(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) {
    return jsonResult(device);
  }

  const response = CompanionContextResponse.safeParse({
    link_id: device.ctx.linkId,
    dept: { id: device.ctx.deptId, name: device.ctx.deptName },
    role: device.ctx.role,
    display_name: device.ctx.displayName,
  });
  if (!response.success) {
    return jsonResult(
      failure(
        500,
        "context_failed",
        "기기 연결을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      ),
    );
  }

  return jsonResult({ ok: true, status: 200, body: response.data });
}

export async function DELETE(request: Request) {
  const device = await requireDeviceContext(request);
  if (!device.ok) {
    return jsonResult(device);
  }

  const revoked = await device.ctx.client.rpc("revoke_device_link", {
    p_link: device.ctx.linkId,
  });
  if (revoked.error) {
    return jsonResult(linkRpcFailure(revoked.error));
  }
  if (revoked.data !== true) {
    return jsonResult(
      failure(
        401,
        "device_revoked",
        "이 기기 연결이 해제되었습니다. 다시 로그인해 주세요.",
      ),
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
