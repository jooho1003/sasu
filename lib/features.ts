export type OrgAdminMode = "off" | "readonly" | "on";

type FeatureEnv = Readonly<Record<string, string | undefined>>;

export function orgAdminMode(env: FeatureEnv = process.env): OrgAdminMode {
  const value = env.SASU_ORG_ADMIN_MODE;
  return value === "readonly" || value === "on" ? value : "off";
}

export function orgAdminReadEnabled(env?: FeatureEnv): boolean {
  return orgAdminMode(env) !== "off";
}

export function orgAdminWritesEnabled(env?: FeatureEnv): boolean {
  return orgAdminMode(env) === "on";
}

export function trailerPublishEnabled(env: FeatureEnv = process.env): boolean {
  return env.SASU_TRAILER_PUBLISH_ENABLED === "true";
}
export function trailerScoresMode(env: Readonly<Record<string, string | undefined>> = process.env): "off" | "scores" | "full" {
  const value = env.SASU_TRAILER_SCORES_MODE;
  return value === "scores" || value === "full" ? value : "off";
}
