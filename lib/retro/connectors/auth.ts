import { createHash } from "node:crypto";
import {
  RetroCredential,
  type RetroConnectionProvider,
  type RetroConnectionConfig,
} from "@/lib/contracts";
import { connectorError, connectorJson } from "./http";
import {
  zendeskConfigured,
  zendeskAuthorization,
  exchangeZendesk,
  refreshZendesk,
} from "./zendesk";
import {
  departmentHeaders,
  isDepartmentConnector,
  validateDepartmentToken,
} from "./department";
import {
  mailchimpConfigured,
  mailchimpAuthorization,
  exchangeMailchimp,
} from "./mailchimp";
import { record, str } from "./map";

const GOOGLE_SCOPES: Partial<Record<RetroConnectionProvider, string>> = {
  google_calendar: "https://www.googleapis.com/auth/calendar.events.readonly",
  youtube: "https://www.googleapis.com/auth/youtube.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
};
const ATLASSIAN = (provider: RetroConnectionProvider) =>
  provider === "jira" || provider === "confluence";
const scopesFor = (provider: RetroConnectionProvider) =>
  GOOGLE_SCOPES[provider]
    ? ["openid", GOOGLE_SCOPES[provider]!]
    : provider === "figma"
      ? ["current_user:read", "file_versions:read", "file_comments:read"]
      : provider === "jira"
        ? ["read:me", "read:jira-work", "offline_access"]
        : provider === "confluence"
          ? [
              "read:me",
              "read:page:confluence",
              "read:comment:confluence",
              "offline_access",
            ]
          : provider === "linear"
            ? ["read"]
            : provider === "pipedrive"
              ? ["base", "activities:read"]
              : provider === "hubspot"
                ? ["oauth", "crm.objects.contacts.read"]
                : [];
const envKey = (provider: RetroConnectionProvider) =>
  GOOGLE_SCOPES[provider]
    ? "GOOGLE"
    : ATLASSIAN(provider)
      ? "ATLASSIAN"
      : provider.toUpperCase();
const PKCE = (provider: RetroConnectionProvider) =>
  !!GOOGLE_SCOPES[provider] || provider === "figma" || provider === "linear";
function clientKeys(provider: RetroConnectionProvider) {
  const key = envKey(provider),
    id = process.env[`RETRO_${key}_CLIENT_ID`],
    secret = process.env[`RETRO_${key}_CLIENT_SECRET`];
  if (!id || !secret) throw connectorError("connector_not_configured");
  return { id, secret };
}
export function oauthConfigured(provider: RetroConnectionProvider) {
  if (provider === "mailchimp") return mailchimpConfigured();
  if (provider === "zendesk") return zendeskConfigured();
  try {
    clientKeys(provider);
    return (
      [
        "figma",
        "notion",
        "jira",
        "confluence",
        "linear",
        "pipedrive",
        "intercom",
        "hubspot",
      ].includes(provider) || !!GOOGLE_SCOPES[provider]
    );
  } catch {
    return false;
  }
}
export const stateHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function authorizationUrl(
  provider: RetroConnectionProvider,
  state: string,
  redirect: string,
  verifier: string,
  config: RetroConnectionConfig = {},
): string {
  if (provider === "mailchimp") return mailchimpAuthorization(state, redirect);
  if (provider === "zendesk")
    return zendeskAuthorization(config, state, redirect);
  const { id } = clientKeys(provider);
  const root = GOOGLE_SCOPES[provider]
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : provider === "figma"
      ? "https://www.figma.com/oauth"
      : provider === "notion"
        ? "https://api.notion.com/v1/oauth/authorize"
        : ATLASSIAN(provider)
          ? "https://auth.atlassian.com/authorize"
          : provider === "linear"
            ? "https://linear.app/oauth/authorize"
            : provider === "pipedrive"
              ? "https://oauth.pipedrive.com/oauth/authorize"
              : provider === "intercom"
                ? "https://app.intercom.com/oauth"
                : provider === "hubspot"
                  ? "https://app.hubspot.com/oauth/authorize"
                  : null;
  if (!root) throw connectorError("connector_scope_denied");
  const url = new URL(root);
  url.search = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirect,
    state,
  }).toString();
  const scopes = scopesFor(provider);
  if (scopes.length && provider !== "pipedrive")
    url.searchParams.set("scope", scopes.join(" "));
  if (provider === "notion") url.searchParams.set("owner", "user");
  if (PKCE(provider)) {
    url.searchParams.set(
      "code_challenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (ATLASSIAN(provider)) {
    url.searchParams.set("audience", "api.atlassian.com");
    url.searchParams.set("prompt", "consent");
  }
  if (provider === "linear") url.searchParams.set("actor", "user");
  if (GOOGLE_SCOPES[provider]) {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "false");
  }
  return url.href;
}
export function credentialHeaders(
  provider: RetroConnectionProvider,
  c: RetroCredential,
): Record<string, string> {
  if (isDepartmentConnector(provider)) return departmentHeaders(provider, c);
  if (provider === "figma" && c.authKind === "token")
    return { "X-Figma-Token": c.accessToken };
  const headers: Record<string, string> = {
    authorization: `Bearer ${c.accessToken}`,
  };
  if (provider === "github") {
    headers.accept = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2026-03-10";
  }
  if (provider === "notion") headers["Notion-Version"] = "2025-09-03";
  if (provider === "intercom") headers["Intercom-Version"] = "2.16";
  return headers;
}
export async function validatePersonalToken(
  provider: RetroConnectionProvider,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<RetroCredential> {
  if (isDepartmentConnector(provider))
    return validateDepartmentToken(provider, token, fetcher);
  if (!["github", "figma", "salesmap"].includes(provider))
    throw connectorError("connector_scope_denied");
  if (provider === "github" && !token.startsWith("github_pat_"))
    throw connectorError("connector_scope_denied");
  const candidate: RetroCredential = {
    accessToken: token,
    refreshToken: null,
    expiresAt: null,
    subjectId: "pending",
    authKind: "token",
    scopes: scopesFor(provider),
  };
  const body = record(
    await connectorJson(
      provider === "github"
        ? "https://api.github.com/user"
        : provider === "figma"
          ? "https://api.figma.com/v1/me"
          : "https://salesmap.kr/api/v2/user/me",
      { headers: credentialHeaders(provider, candidate) },
      fetcher,
    ),
  );
  const id = str(
    provider === "salesmap" ? record(record(body.data).user).id : body.id,
  );
  if (
    !id ||
    (provider === "github" && body.type !== "User") ||
    (provider === "salesmap" && body.success !== true)
  )
    throw connectorError("connector_auth_failed");
  return RetroCredential.parse({ ...candidate, subjectId: id });
}
async function requestTokens(
  provider: RetroConnectionProvider,
  values: Record<string, string>,
  fetcher: typeof fetch,
  refresh = false,
) {
  const { id, secret } = clientKeys(provider);
  const google = !!GOOGLE_SCOPES[provider];
  const endpoint = google
    ? "https://oauth2.googleapis.com/token"
    : provider === "figma"
      ? `https://api.figma.com/v1/oauth/${refresh ? "refresh" : "token"}`
      : provider === "notion"
        ? "https://api.notion.com/v1/oauth/token"
        : ATLASSIAN(provider)
          ? "https://auth.atlassian.com/oauth/token"
          : provider === "linear"
            ? "https://api.linear.app/oauth/token"
            : provider === "pipedrive"
              ? "https://oauth.pipedrive.com/oauth/token"
              : provider === "intercom"
                ? "https://api.intercom.io/auth/eagle/token"
                : provider === "hubspot"
                  ? "https://api.hubapi.com/oauth/v3/token"
                  : null;
  if (!endpoint) throw connectorError("connector_scope_denied");
  const json =
    provider === "notion" || ATLASSIAN(provider) || provider === "intercom";
  const headers: Record<string, string> = {
    "content-type": json
      ? "application/json"
      : "application/x-www-form-urlencoded",
  };
  if (
    !google &&
    !ATLASSIAN(provider) &&
    provider !== "intercom" &&
    provider !== "hubspot"
  )
    headers.authorization = `Basic ${Buffer.from(id + ":" + secret).toString("base64")}`;
  const payload =
    google ||
    ATLASSIAN(provider) ||
    provider === "intercom" ||
    provider === "hubspot"
      ? { ...values, client_id: id, client_secret: secret }
      : values;
  return record(
    await connectorJson(
      endpoint,
      {
        method: "POST",
        headers,
        body: json ? JSON.stringify(payload) : new URLSearchParams(payload),
      },
      fetcher,
    ),
  );
}
export async function exchangeCredential(
  provider: RetroConnectionProvider,
  code: string,
  redirect: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
  config: RetroConnectionConfig = {},
): Promise<RetroCredential> {
  if (provider === "mailchimp")
    return exchangeMailchimp(code, redirect, fetcher);
  if (provider === "zendesk")
    return exchangeZendesk(config, code, redirect, fetcher);
  const body = await requestTokens(
    provider,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      ...(PKCE(provider) ? { code_verifier: verifier } : {}),
    },
    fetcher,
  );
  const token = str(body.access_token);
  if (!token) throw connectorError("connector_auth_failed");
  let subject = "";
  if (provider === "notion") {
    const owner = record(body.owner);
    if (owner.type !== "user") throw connectorError("connector_scope_denied");
    subject = str(record(owner.user).id);
  } else if (provider === "figma") {
    const me = record(
      await connectorJson(
        "https://api.figma.com/v1/me",
        { headers: { authorization: `Bearer ${token}` } },
        fetcher,
      ),
    );
    subject = str(me.id);
    if (str(body.user_id_string) && str(body.user_id_string) !== subject)
      throw connectorError("connector_auth_failed");
  } else if (ATLASSIAN(provider))
    subject = str(
      record(
        await connectorJson(
          "https://api.atlassian.com/me",
          { headers: { authorization: `Bearer ${token}` } },
          fetcher,
        ),
      ).account_id,
    );
  else if (provider === "pipedrive")
    subject = str(
      record(
        record(
          await connectorJson(
            "https://api.pipedrive.com/api/v1/users/me",
            { headers: { authorization: `Bearer ${token}` } },
            fetcher,
          ),
        ).data,
      ).id,
    );
  else if (provider === "intercom") {
    const me = record(
      await connectorJson(
        "https://api.intercom.io/me",
        {
          headers: {
            authorization: `Bearer ${token}`,
            "Intercom-Version": "2.16",
          },
        },
        fetcher,
      ),
    );
    if (me.type !== "admin") throw connectorError("connector_auth_failed");
    subject = str(me.id);
  } else if (provider === "hubspot") {
    const { id, secret } = clientKeys(provider);
    const identity = record(
      await connectorJson(
        "https://api.hubapi.com/oauth/2026-09/token/introspect",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            token,
            token_type_hint: "access_token",
          }),
        },
        fetcher,
      ),
    );
    const signed = record(identity.signed_access_token),
      granted = identity.scopes;
    if (
      identity.active !== true ||
      identity.client_id !== id ||
      signed.isUserLevel !== true ||
      signed.isServiceAccount !== false ||
      str(signed.userId) !== str(identity.user_id) ||
      !Array.isArray(granted) ||
      scopesFor(provider).some((scope) => !granted.includes(scope))
    )
      throw connectorError("connector_scope_denied");
    subject = str(identity.user_id);
  } else if (provider === "linear") {
    const response = record(
      await connectorJson(
        "https://api.linear.app/graphql",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ query: "query { viewer { id } }" }),
        },
        fetcher,
      ),
    );
    if (response.errors) throw connectorError("connector_auth_failed");
    subject = str(record(record(response.data).viewer).id);
  } else if (GOOGLE_SCOPES[provider]) {
    const granted = str(body.scope).split(" ");
    if (scopesFor(provider).some((s) => !granted.includes(s)))
      throw connectorError("connector_scope_denied");
    subject = str(
      record(
        await connectorJson(
          "https://openidconnect.googleapis.com/v1/userinfo",
          { headers: { authorization: `Bearer ${token}` } },
          fetcher,
        ),
      ).sub,
    );
  }
  if (!subject) throw connectorError("connector_auth_failed");
  return RetroCredential.parse({
    accessToken: token,
    refreshToken: str(body.refresh_token) || null,
    expiresAt:
      typeof body.expires_in === "number"
        ? Date.now() + body.expires_in * 1000
        : null,
    subjectId: subject,
    authKind: "oauth",
    scopes: scopesFor(provider),
  });
}
export async function refreshCredential(
  provider: RetroConnectionProvider,
  credential: RetroCredential,
  fetcher: typeof fetch = fetch,
  config: RetroConnectionConfig = {},
): Promise<RetroCredential> {
  if (provider === "zendesk")
    return refreshZendesk(config, credential, fetcher);
  if (
    credential.authKind === "token" ||
    credential.expiresAt === null ||
    credential.expiresAt > Date.now() + 60000
  )
    return credential;
  if (!credential.refreshToken) throw connectorError("connector_auth_failed");
  const body = await requestTokens(
    provider,
    {
      refresh_token: credential.refreshToken,
      ...(provider === "figma" ? {} : { grant_type: "refresh_token" }),
    },
    fetcher,
    true,
  );
  const token = str(body.access_token);
  if (!token) throw connectorError("connector_auth_failed");
  return RetroCredential.parse({
    ...credential,
    accessToken: token,
    refreshToken: str(body.refresh_token) || credential.refreshToken,
    expiresAt:
      typeof body.expires_in === "number"
        ? Date.now() + body.expires_in * 1000
        : null,
  });
}
