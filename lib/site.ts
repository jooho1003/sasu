type SiteEnvironment = Readonly<Record<string, string | undefined>>;

// 사용자가 지정했고 비로그인 열람을 확인한 공개 가이드. 빈 환경 변수는 노출을 끈다.
const DEFAULT_GUIDE_URL = "https://app.notion.com/p/SASU-3ddd12f23255809985bfd98b97ce51c9";

export type SiteLinks = {
  guideUrl: string | null;
  pilotContactUrl: string | null;
  demoVideoUrl: string | null;
  voteUrl: string | null;
  trailerDemoUrl: string | null;
};

function externalUrl(
  raw: string | undefined,
  protocols: readonly string[],
): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    return protocols.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function trailerDemoHref(env: SiteEnvironment = process.env): string | null {
  const publishedPath = env.SASU_TRAILER_DEMO_PATH?.trim();
  if (env.SASU_TRAILER_PUBLISH_ENABLED === "true" && publishedPath && /^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(publishedPath)) {
    return publishedPath;
  }
  return env.SASU_TRAILER_PREVIEW_ENABLED === "true" ? "/trailers" : null;
}

export function siteLinks(env: SiteEnvironment = process.env): SiteLinks {
  return {
    guideUrl: externalUrl(env.SASU_GUIDE_URL ?? DEFAULT_GUIDE_URL, ["https:"]),
    pilotContactUrl: externalUrl(env.SASU_PILOT_CONTACT_URL, ["https:", "mailto:"]),
    demoVideoUrl: externalUrl(env.SASU_DEMO_VIDEO_URL, ["https:"]),
    voteUrl: externalUrl(env.SASU_VOTE_URL, ["https:"]),
    trailerDemoUrl: trailerDemoHref(env),
  };
}

export function metadataBase(env: SiteEnvironment = process.env): URL {
  const configured = externalUrl(env.NEXT_PUBLIC_APP_URL, ["https:", "http:"]);
  if (configured) {
    const url = new URL(configured);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  }

  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost && /^[a-z0-9.-]+$/iu.test(vercelHost)) {
    return new URL(`https://${vercelHost}/`);
  }
  return new URL("http://localhost:3000/");
}

// /api/*는 옛 호스트에서도 이동하지 않는다: 설치된 데스크톱(0.1.0~0.1.2)이 옛 주소로 Bearer를 보내고, 다른 출처 308은 Authorization을 떼어 401로 세션이 지워진다(불변식 52).
export function legacyHostRedirect(
  input: { host: string | null; pathname: string; search: string },
  env: SiteEnvironment = process.env,
): string | null {
  const legacyHosts = (env.SASU_LEGACY_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-z0-9.-]+$/u.test(entry));
  if (legacyHosts.length === 0 || !input.host) return null;

  const requestHost = input.host.trim().toLowerCase().replace(/:\d+$/u, "");
  if (!legacyHosts.includes(requestHost)) return null;

  const canonical = metadataBase(env);
  if (canonical.protocol !== "https:") return null;
  if (requestHost === canonical.hostname.toLowerCase()) return null;

  if (input.pathname === "/api" || input.pathname.startsWith("/api/")) return null;
  // 경로를 상대 URL로 풀면 "//evil.example"이 호스트가 된다. 정식 origin에 경로만 덮어쓴다.
  const target = new URL(canonical);
  target.pathname = input.pathname;
  target.search = input.search;
  return target.toString();
}
