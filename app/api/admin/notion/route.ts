import { saveNotionInstallation } from "@/lib/adapters/notion-installation";
import { orgAdminReadEnabled, orgAdminWritesEnabled } from "@/lib/features";
import { mask } from "@/lib/mask";
import { notionWhoAmI, runWithNotionAuth } from "@/lib/notion";
import {
  encryptNotionToken,
  notionTokenEncryptionConfigured,
} from "@/lib/notion-installation";
import { metadataBase } from "@/lib/site";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function noStore(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...init?.headers, "Cache-Control": "no-store" },
  });
}

function validOrigin(request: Request): boolean {
  return request.headers.get("origin") === metadataBase().origin;
}

export async function GET() {
  if (!orgAdminReadEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const client = await createServerSupabaseClient();
  const result = await client.rpc("admin_notion_installation");
  if (result.error) {
    return noStore(
      { error: "조직 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  return noStore({
    configured:
      orgAdminWritesEnabled() && notionTokenEncryptionConfigured(),
    installation: result.data,
  });
}

export async function POST(request: Request) {
  if (!orgAdminWritesEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!validOrigin(request)) {
    return noStore({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }

  let body: { token?: unknown; attested?: unknown };
  try {
    body = (await request.json()) as {
      token?: unknown;
      attested?: unknown;
    };
  } catch {
    return noStore(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 2_048) {
    return noStore(
      { error: "Notion 내부 통합 토큰을 확인해주세요." },
      { status: 400 },
    );
  }
  if (body.attested !== true) {
    return noStore(
      { error: "업무 자료 수집 권한 확인이 필요합니다." },
      { status: 400 },
    );
  }
  if (!notionTokenEncryptionConfigured()) {
    return noStore(
      { error: "Notion 연결 설정을 준비 중입니다." },
      { status: 503 },
    );
  }

  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) {
    return noStore({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const admin = await client.rpc("admin_org_id");
  if (admin.error || typeof admin.data !== "string") {
    return noStore(
      { error: "조직 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  const eligible = await client.rpc("admin_notion_installation");
  if (eligible.error) {
    return noStore(
      { error: "이 조직에서는 Notion을 연결할 수 없습니다." },
      { status: 403 },
    );
  }

  try {
    const installation = await runWithNotionAuth(
      { token },
      notionWhoAmI,
    );
    const workspaceId =
      installation.workspaceId ?? `bot:${installation.botId}`;
    const encrypted = encryptNotionToken(token, admin.data, workspaceId);
    // Credential collection adapter: the service role is limited to persisting
    // a /users/me-validated token. Dashboard reads and revocation stay session-bound.
    const saved = await saveNotionInstallation({
      actorId: user.id,
      orgId: admin.data,
      workspaceId,
      workspaceName: installation.workspaceName
        ? mask(installation.workspaceName).slice(0, 200)
        : null,
      botId: installation.botId,
      encryptedToken: encrypted,
    });
    if (saved === "workspace_conflict") {
      return noStore(
        { error: "이미 다른 조직에 연결된 Notion 워크스페이스입니다." },
        { status: 409 },
      );
    }
    if (saved !== "saved") {
      return noStore(
        { error: "Notion 연결을 저장하지 못했습니다." },
        { status: 500 },
      );
    }
    return noStore({ ok: true });
  } catch {
    return noStore(
      { error: "Notion 토큰 또는 워크스페이스를 확인해주세요." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!orgAdminWritesEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!validOrigin(request)) {
    return noStore({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const client = await createServerSupabaseClient();
  const result = await client.rpc("revoke_notion_installation");
  if (result.error?.code === "42501") {
    return noStore(
      { error: "조직 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  if (result.error) {
    return noStore(
      { error: "Notion 연결을 해제하지 못했습니다." },
      { status: 500 },
    );
  }
  return noStore({ ok: true, revoked: result.data === true });
}
