import { retroMarkdown } from "@/lib/retro/export";
import { detail, fail, noStore, type Context } from "../../_shared";
export async function GET(_request: Request, context: Context) {
  const data = await detail(context); if (data instanceof Response) return data;
  if (!data.owner) return fail("retro_not_found");
  if (!data.confirmed) return fail("not_confirmed");
  const result = await data.client.rpc("record_retro_export", { p_day: data.day.id, p_revision: data.confirmed.revision, p_kind: "markdown" });
  if (result.error) return fail(result.error);
  const markdown = retroMarkdown({ ...data.day, author: data.member.displayName }, data.confirmed, data.activities);
  return new Response(markdown, { headers: { ...noStore, "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="retro-${data.day.retro_date}.md"` } });
}
