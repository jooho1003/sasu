import {
  RetroConnectionConfig,
  type RetroConnectionProvider,
} from "@/lib/contracts";

export const CONNECTOR_LABELS: Record<RetroConnectionProvider, string> = {
  github: "깃허브",
  figma: "피그마",
  google_calendar: "구글 캘린더",
  notion: "노션",
  jira: "지라",
  confluence: "컨플루언스",
  linear: "리니어",
  salesmap: "세일즈맵",
  hubspot: "허브스팟",
  pipedrive: "파이프드라이브",
  intercom: "인터컴",
  zendesk: "젠데스크",
  wanted: "원티드",
  stibee: "스티비",
  mailchimp: "메일침프",
  meta: "메타",
  youtube: "유튜브",
  ga4: "구글 애널리틱스",
};
export const AVAILABLE_CONNECTORS: readonly RetroConnectionProvider[] = [
  "github",
  "figma",
  "google_calendar",
  "notion",
  "jira",
  "confluence",
  "linear",
  "hubspot",
  "pipedrive",
  "salesmap",
  "intercom",
  "zendesk",
  "wanted",
  "stibee",
  "mailchimp",
  "youtube",
  "ga4",
];
const KEYS: Record<
  RetroConnectionProvider,
  readonly (keyof RetroConnectionConfig)[]
> = {
  github: ["repositories"],
  figma: ["files"],
  google_calendar: [],
  notion: ["pages"],
  jira: ["cloudId", "projects"],
  confluence: ["cloudId", "pageIds"],
  linear: ["issues"],
  salesmap: [],
  hubspot: [],
  pipedrive: [],
  intercom: [],
  zendesk: ["subdomain"],
  wanted: [],
  stibee: [],
  mailchimp: [],
  meta: ["pageId"],
  youtube: [],
  ga4: ["propertyId"],
};
export function parseConnectorConfig(
  provider: RetroConnectionProvider,
  input: unknown,
): RetroConnectionConfig {
  if (!AVAILABLE_CONNECTORS.includes(provider))
    throw new Error("connector_scope_denied");
  const config = RetroConnectionConfig.parse(input),
    keys = KEYS[provider];
  if (
    config.repositories?.some((repo) =>
      repo.split("/").some((part) => part === "." || part === ".."),
    )
  )
    throw new Error("invalid_connection");
  if (
    Object.keys(config).some(
      (k) => !keys.includes(k as keyof RetroConnectionConfig),
    ) ||
    keys.some(
      (k) => !config[k] || (Array.isArray(config[k]) && !config[k].length),
    )
  )
    throw new Error("invalid_connection");
  return config;
}
