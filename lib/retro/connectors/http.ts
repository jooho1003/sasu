// Fixed public API hosts only. Redirects, caller-supplied hosts and response logging are forbidden.
const HOSTS = new Set([
  "api.github.com",
  "api.figma.com",
  "www.googleapis.com",
  "openidconnect.googleapis.com",
  "oauth2.googleapis.com",
  "api.notion.com",
  "api.atlassian.com",
  "auth.atlassian.com",
  "api.linear.app",
  "salesmap.kr",
  "api.hubapi.com",
  "api.pipedrive.com",
  "oauth.pipedrive.com",
  "api.intercom.io",
  "api.workable.com",
  "openapi.wanted.jobs",
  "api.stibee.com",
  "login.mailchimp.com",
  "graph.facebook.com",
  "analyticsdata.googleapis.com",
]);
export type ConnectorError = Error & {
  code: string;
  retryAfterSeconds?: number;
};
export const connectorError = (
  code: string,
  retryAfterSeconds?: number,
): ConnectorError =>
  Object.assign(new Error(code), {
    code,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });
export async function connectorJson(
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<unknown> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<unknown> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    (!HOSTS.has(target.hostname) &&
      !/^us\d{1,3}\.api\.mailchimp\.com$/.test(target.hostname) &&
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.zendesk\.com$/.test(
        target.hostname,
      )) ||
    target.port ||
    target.username ||
    target.password
  )
    throw connectorError("connector_scope_denied");
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetcher(target.href, {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw connectorError("connector_timeout");
    }
    if (response.status === 429) {
      const raw = response.headers.get("retry-after") ?? "1";
      const seconds = Math.max(
        1,
        Math.ceil(
          /^\d+$/.test(raw)
            ? Number(raw)
            : (Date.parse(raw) - Date.now()) / 1000,
        ) || 1,
      );
      await response.body?.cancel();
      if (attempt || seconds > 30)
        throw connectorError("rate_limited", seconds);
      await sleep(seconds * 1000);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw connectorError(
        response.status === 401
          ? "connector_auth_failed"
          : response.status === 403
            ? "connector_scope_denied"
            : "connector_failed",
      );
    }
    const limit = 4 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw connectorError("connector_response_too_large");
    }
    const reader = response.body?.getReader();
    if (!reader) throw connectorError("connector_invalid_response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) {
          await reader.cancel();
          throw connectorError("connector_response_too_large");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw connectorError("connector_invalid_response");
    }
  }
  throw connectorError("rate_limited");
}
