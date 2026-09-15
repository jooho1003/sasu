import { cache } from "react";
import { connection } from "next/server";
import type { z } from "zod";
import { AdminOverview } from "@/lib/contracts";
import { requireOrgAdmin } from "@/lib/supabase/org-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const adminContext = cache(async () => {
  // A build with mode=off must not cache a 404 for later request-time mode changes.
  await connection();
  return requireOrgAdmin();
});

export async function adminRead<T extends z.ZodType>(name: string, schema: T, args?: Record<string, unknown>): Promise<z.output<T> | null> {
  if ((await adminContext()).status !== "ok") return null;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc(name, args);
  if (result.error) return null;
  const parsed = schema.safeParse(result.data);
  return parsed.success ? parsed.data : null;
}

export const adminOverview = cache(() => adminRead("admin_overview", AdminOverview));
