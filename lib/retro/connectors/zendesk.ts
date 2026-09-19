import { RetroCredential, type RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";
import { connectorError, connectorJson } from "./http";
import { dayWindow, record, rows, str } from "./map";

type Config = { subdomain?: string };
const scopes = ["tickets:read", "users:read"];
function base(config: Config) {
  if (
    !config.subdomain ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.subdomain)
  )
    throw connectorError("invalid_connection");
  return `https://${config.subdomain}.zendesk.com`;
}
function keys() {
  const id = process.env.RETRO_ZENDESK_GLOBAL_CLIENT_ID,
    secret = process.env.RETRO_ZENDESK_GLOBAL_CLIENT_SECRET;
  if (!id || !secret) throw connectorError("connector_not_configured");
  return { id, secret };
}
export function zendeskConfigured() {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}
export function zendeskAuthorization(
  config: Config,
  state: string,
  redirect: string,
) {
  const url = new URL(base(config) + "/oauth/authorizations/new");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: keys().id,
    redirect_uri: redirect,
    scope: scopes.join(" "),
    state,
  }).toString();
  return url.href;
}
function subject(config: Config, c: RetroCredential) {
  base(config);
  const prefix = config.subdomain + ":";
  if (
    !c.subjectId.startsWith(prefix) ||
    !/^\d+$/.test(c.subjectId.slice(prefix.length))
  )
    throw connectorError("connector_scope_denied");
  return c.subjectId.slice(prefix.length);
}
async function tokens(
  config: Config,
  values: Record<string, string>,
  fetcher: typeof fetch,
) {
  const { id, secret } = keys(),
    response = record(
      await connectorJson(
        base(config) + "/oauth/tokens",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...values,
            scope: scopes.join(" "),
            expires_in: 1800,
            client_id: id,
            client_secret: secret,
          }),
        },
        fetcher,
      ),
    );
  const granted = str(response.scope).split(" ");
  if (scopes.some((s) => !granted.includes(s)))
    throw connectorError("connector_scope_denied");
  if (!str(response.access_token))
    throw connectorError("connector_auth_failed");
  return response;
}
function credential(
  response: Record<string, unknown>,
  subjectId: string,
  oldRefresh: string | null = null,
): RetroCredential {
  return RetroCredential.parse({
    accessToken: str(response.access_token),
    refreshToken: str(response.refresh_token) || oldRefresh,
    expiresAt:
      typeof response.expires_in === "number"
        ? Date.now() + response.expires_in * 1000
        : Date.now() + 1800000,
    subjectId,
    authKind: "oauth",
    scopes,
  });
}
export async function exchangeZendesk(
  config: Config,
  code: string,
  redirect: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await tokens(
    config,
    { grant_type: "authorization_code", code, redirect_uri: redirect },
    fetcher,
  );
  const me = record(
    record(
      await connectorJson(
        base(config) + "/api/v2/users/me.json",
        { headers: { authorization: `Bearer ${str(response.access_token)}` } },
        fetcher,
      ),
    ).user,
  );
  if (!/^\d+$/.test(str(me.id)) || !["agent", "admin"].includes(str(me.role)))
    throw connectorError("connector_scope_denied");
  return credential(response, config.subdomain + ":" + str(me.id));
}
export async function refreshZendesk(
  config: Config,
  c: RetroCredential,
  fetcher: typeof fetch = fetch,
) {
  subject(config, c);
  if (c.expiresAt !== null && c.expiresAt > Date.now() + 60000) return c;
  if (!c.refreshToken) throw connectorError("connector_auth_failed");
  return credential(
    await tokens(
      config,
      { grant_type: "refresh_token", refresh_token: c.refreshToken },
      fetcher,
    ),
    c.subjectId,
    c.refreshToken,
  );
}
/** Agent-level assigned tickets, never the administrator export/audit API. */
export async function pullZendesk(
  config: Config,
  c: RetroCredential,
  date: string,
  get: (url: string | URL) => Promise<unknown>,
): Promise<RetroActivity[]> {
  const user = subject(config, c),
    root = base(config) + "/api/v2",
    window = dayWindow(date, "Asia/Seoul"),
    output: RetroActivity[] = [];
  let cursor = "";
  const seen = new Set<string>();
  for (let page = 0; page < 3 && output.length < 200; page++) {
    const url = new URL(`${root}/users/${user}/tickets/assigned.json`);
    url.searchParams.set("page[size]", "20");
    if (cursor) url.searchParams.set("page[after]", cursor);
    const data = record(await get(url));
    for (const ticket of rows(data.tickets)) {
      const id = str(ticket.id);
      if (
        !/^\d+$/.test(id) ||
        str(ticket.assignee_id) !== user ||
        Date.parse(str(ticket.updated_at)) < Date.parse(window.from)
      )
        continue;
      let after = "";
      const commentsSeen = new Set<string>();
      for (let part = 0; part < 3 && output.length < 200; part++) {
        const commentsUrl = new URL(`${root}/tickets/${id}/comments.json`);
        commentsUrl.search = new URLSearchParams({
          "page[size]": "100",
          sort: "-created_at",
          ...(after ? { "page[after]": after } : {}),
        }).toString();
        const comments = record(await get(commentsUrl));
        for (const row of rows(comments.comments)) {
          const flags = record(row.metadata).flags,
            at = str(row.created_at),
            ref = str(row.id);
          if (
            str(row.author_id) !== user ||
            row.type !== "Comment" ||
            (Array.isArray(flags) &&
              flags.some((v) =>
                [0, 2, 3, 4, 11, 14, 20, 21, 22].includes(Number(v)),
              )) ||
            !ref ||
            !Number.isFinite(Date.parse(at)) ||
            localDate(new Date(at), "Asia/Seoul") !== date ||
            output.length >= 200
          )
            continue;
          output.push(
            normalizeActivity({
              kind: "ticket_handled",
              ref: `${id}:${ref}`,
              at: new Date(at).toISOString(),
              title: "내 명의 상담 기록",
              text: "내 이름으로 상담 답글 또는 메모가 등록됐습니다.",
              meta: { provider: "zendesk" },
            }),
          );
        }
        const meta = record(comments.meta),
          next = str(meta.after_cursor);
        if (meta.has_more !== true || !next || commentsSeen.has(next)) break;
        commentsSeen.add(next);
        after = next;
      }
    }
    const meta = record(data.meta),
      next = str(meta.after_cursor);
    if (meta.has_more !== true || !next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  return output;
}
