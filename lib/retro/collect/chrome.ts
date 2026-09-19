import type { RetroActivity } from "@/lib/contracts";
import { localDate, normalizeActivity } from "../bundle";
// The allowlist option is preferable when the browser is also used privately.
export const CHROME_DENYLIST = ["mail.google.com", "outlook.live.com", "outlook.office.com", "gmail.com", "bank", "banking", "kbstar.com", "shinhan.com", "wooribank.com", "kakaobank.com", "hanafn.com", "card", "kakaotalk.com", "web.whatsapp.com", "slack.com", "discord.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "adult", "porn", "hospital", "health", "medical", "localhost"];
type Options = { enabled?: boolean; search_terms?: boolean; date: string; tz: string; mode?: "denylist" | "allowlist"; domains?: string[] };
export function collectChrome(visits: { url: string; title: string; visit_time: number; visit_count: number }[], searches: { term: string; at: string }[], options: Options): RetroActivity[] {
  if (!options.enabled) return [];
  const rows = new Map<string, RetroActivity>();
  for (const visit of visits) {
    try {
      const url = new URL(visit.url), host = url.hostname.toLowerCase();
      // Search result titles commonly contain the query even after URL stripping.
      // Search terms are collected only through the separately opted-in source.
      if (/\/(search|results)(\/|$)/i.test(url.pathname) || ["q", "query", "search_query", "keyword", "wd"].some(key => url.searchParams.has(key))) continue;
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /^\[|^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes(".")) continue;
      const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
      if (CHROME_DENYLIST.some(d => d.includes(".") ? matches(d) : host.split(/[.-]/).includes(d))) continue;
      if (options.mode === "allowlist" ? !(options.domains ?? []).some(matches) : (options.domains ?? []).some(matches)) continue;
      const at = new Date(visit.visit_time / 1000 - 11644473600000).toISOString();
      if (localDate(at, options.tz) !== options.date) continue;
      const ref = `${url.origin}${url.pathname}`; if (ref.length > 200) continue;
      const current = rows.get(ref);
      if (current) current.meta.visits = Number(current.meta.visits) + visit.visit_count;
      else rows.set(ref, normalizeActivity({ kind: "web_visit", ref, title: visit.title || host, at, text: "", meta: { domain: host, visits: visit.visit_count } }));
    } catch { /* Invalid URLs and dates are not collected. */ }
  }
  if (options.search_terms) for (const search of searches) {
    if (!Number.isFinite(Date.parse(search.at)) || localDate(search.at, options.tz) !== options.date) continue;
    const activity = normalizeActivity({ kind: "web_search", ref: "", title: search.term, text: "", at: search.at, meta: {} });
    activity.ref = `q:${activity.title}`.slice(0, 200); rows.set(activity.ref, activity);
  }
  return [...rows.values()];
}
