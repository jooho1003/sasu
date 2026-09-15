import { z } from "zod";
import { TrailerScenario } from "@/lib/contracts";
import { validateScenario } from "@/lib/trailer";
export const PUBLIC_TRAILER_SLUG = /^[a-z0-9]{22}$/;
export function parsePublicTrailer(data: unknown): { status: "ok"; scenarios: TrailerScenario[]; applyUrl: string | null } | { status: "invalid" } {
  const parsed = z.strictObject({ scenarios: TrailerScenario.array().min(1).max(3), apply_url: z.url().refine((url) => new URL(url).protocol === "https:").nullable() }).safeParse(data);
  if (!parsed.success || new Set(parsed.data.scenarios.map((scenario) => scenario.id)).size !== parsed.data.scenarios.length) return { status: "invalid" };
  try { return { status: "ok", scenarios: parsed.data.scenarios.map(validateScenario), applyUrl: parsed.data.apply_url }; }
  catch { return { status: "invalid" }; }
}
