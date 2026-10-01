import { readAnswerView } from "@/lib/answer-view";
import {
  actorFromMembership,
  jsonResult,
} from "@/lib/companion/context";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dept: string; id: string }> },
) {
  const { dept, id } = await params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();

  return jsonResult(
    await readAnswerView(actorFromMembership(client, membership), id),
    { cacheControl: false, legacy: "answer" },
  );
}
