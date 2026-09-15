type SiteEnvironment = Readonly<Record<string, string | undefined>>;

export type SiteLinks = {
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
