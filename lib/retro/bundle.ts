import { RetroBundle, type RetroActivity } from "@/lib/contracts";
import { mask } from "@/lib/mask";

export function localDate(value: Date | string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function normalizeActivity(activity: RetroActivity): RetroActivity {
  const clean = (value: string, limit: number) => mask(value.replace(/\s+/g, " ").trim()).slice(0, limit);
  return { ...activity, title: clean(activity.title, 200), text: clean(activity.text, 500), meta: Object.fromEntries(Object.entries(activity.meta).map(([key, value]) => [key, typeof value === "string" ? clean(value, 500) : value])) };
}
export function parseRetroBundle(json: unknown, now = new Date()): { ok: true; bundle: RetroBundle } | { ok: false; code: string } {
  try {
    if (new TextEncoder().encode(JSON.stringify(json)).length > 1024 * 1024) return { ok: false, code: "bundle_too_large" };
    const parsed = RetroBundle.safeParse(json);
    if (!parsed.success) return { ok: false, code: "invalid_bundle" };
    const bundle = parsed.data;
    const today = localDate(now, bundle.tz);
    if (Math.abs(Date.parse(bundle.date) - Date.parse(today)) > 7 * 86400000) return { ok: false, code: "date_out_of_range" };
    const refs = new Set<string>();
    for (const activity of bundle.activities) {
      if (activity.kind.startsWith("sasu_")) return { ok: false, code: "server_only_kind" };
      if (localDate(activity.at, bundle.tz) !== bundle.date) return { ok: false, code: "invalid_bundle" };
      const key = JSON.stringify([activity.kind, activity.ref]);
      if (refs.has(key)) return { ok: false, code: "duplicate_ref" };
      refs.add(key);
    }
    return { ok: true, bundle: { ...bundle, activities: bundle.activities.map(normalizeActivity) } };
  } catch { return { ok: false, code: "invalid_bundle" }; }
}
