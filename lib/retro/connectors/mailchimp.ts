import { RetroCredential, type RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "@/lib/retro/bundle";
import { connectorError, connectorJson } from "./http";
import { dayWindow, record, rows, str } from "./map";
function keys() {
  const id = process.env.RETRO_MAILCHIMP_CLIENT_ID,
    secret = process.env.RETRO_MAILCHIMP_CLIENT_SECRET;
  if (!id || !secret) throw connectorError("connector_not_configured");
  return { id, secret };
}
export function mailchimpConfigured() {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}
export function mailchimpAuthorization(state: string, redirect: string) {
  const url = new URL("https://login.mailchimp.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: keys().id,
    response_type: "code",
    redirect_uri: redirect,
    state,
  }).toString();
  return url.href;
}
export async function exchangeMailchimp(
  code: string,
  redirect: string,
  fetcher: typeof fetch = fetch,
) {
  const { id, secret } = keys(),
    data = record(
      await connectorJson(
        "https://login.mailchimp.com/oauth2/token",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirect,
          }),
        },
        fetcher,
      ),
    );
  const token = str(data.access_token);
  if (!token) throw connectorError("connector_auth_failed");
  const metadata = record(
    await connectorJson(
      "https://login.mailchimp.com/oauth2/metadata",
      { headers: { authorization: `OAuth ${token}` } },
      fetcher,
    ),
  );
  const dc = str(metadata.dc);
  if (!/^us\d{1,3}$/.test(dc)) throw connectorError("connector_scope_denied");
  const me = record(
      await connectorJson(
        `https://${dc}.api.mailchimp.com/3.0/?fields=login_id`,
        { headers: { authorization: `Bearer ${token}` } },
        fetcher,
      ),
    ),
    subject = str(me.login_id);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(subject))
    throw connectorError("connector_auth_failed");
  return RetroCredential.parse({
    accessToken: token,
    refreshToken: null,
    expiresAt: null,
    subjectId: `${dc}:${subject}`,
    authKind: "oauth",
    scopes: [],
  });
}
export async function pullMailchimp(
  subject: string,
  date: string,
  get: (url: string | URL) => Promise<unknown>,
): Promise<RetroActivity[]> {
  const match = /^(us\d{1,3}):[A-Za-z0-9_-]{1,100}$/.exec(subject);
  if (!match) throw connectorError("connector_scope_denied");
  const window = dayWindow(date, "Asia/Seoul"),
    output: RetroActivity[] = [];
  for (let page = 0; page < 10 && output.length < 200; page++) {
    const url = new URL(`https://${match[1]}.api.mailchimp.com/3.0/campaigns`);
    url.search = new URLSearchParams({
      status: "sent",
      since_send_time: window.from,
      before_send_time: window.to,
      count: "100",
      offset: String(page * 100),
      fields:
        "total_items,campaigns.id,campaigns.status,campaigns.send_time,campaigns.emails_sent",
    }).toString();
    const data = record(await get(url));
    if (!Array.isArray(data.campaigns))
      throw connectorError("connector_invalid_response");
    const campaigns = rows(data.campaigns);
    for (const row of campaigns) {
      const at = str(row.send_time),
        id = str(row.id);
      if (
        !id ||
        row.status !== "sent" ||
        !Number.isFinite(Date.parse(at)) ||
        localDate(new Date(at), "Asia/Seoul") !== date ||
        output.length >= 200
      )
        continue;
      if (!Number.isSafeInteger(row.emails_sent) || Number(row.emails_sent) < 0)
        throw connectorError("connector_invalid_response");
      output.push(
        normalizeActivity({
          kind: "metric_snapshot",
          ref: `mailchimp:${id}`,
          at: new Date(at).toISOString(),
          title: "캠페인 발송 수치",
          text: `발송 수 ${row.emails_sent}건`,
          meta: { provider: "mailchimp", sent: Number(row.emails_sent) },
        }),
      );
    }
    if (campaigns.length < 100) break;
  }
  return output;
}
