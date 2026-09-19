import { notFound } from "next/navigation";
import Link from "next/link";
import { DemoRetro } from "@/components/demo-retro";
import { buildDemoRetros } from "@/fixtures/retro/days";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { RetroDayRow, RetroActivityRow, RetroRevisionRow } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export default async function DemoRetrosPage() {
  if (process.env.SASU_RETRO_ENABLED !== "true") notFound();
  let days = buildDemoRetros();
  try {
    const client = createPublicSupabaseClient();
    const read = await client.from("retro_days").select("*").eq("visibility", "dept").eq("status", "confirmed").order("retro_date", { ascending: false }).limit(20);
    const parsed = RetroDayRow.array().safeParse(read.data);
    if (!read.error && parsed.success && parsed.data.length) {
      const ids = parsed.data.map(d=>d.id);
      const [ar, rr] = await Promise.all([client.from("retro_activities").select("*").in("day_id",ids),client.from("retro_revisions").select("*").in("day_id",ids)]);
      const activities = RetroActivityRow.array().safeParse(ar.data), revisions = RetroRevisionRow.array().safeParse(rr.data);
      if (activities.success && revisions.success) days = parsed.data.flatMap(day=>{const revision = revisions.data.find(r=>r.day_id===day.id&&r.revision===day.confirmed_revision);return revision?[{day:{...day,title:revision.title,topics:revision.topics,display_name:"합성 작성자"},activities:activities.data.filter(a=>a.day_id===day.id),revision,confirmed:revision,owner:true}]:[];});
    }
  } catch { /* The bundled, entirely synthetic demo also works before local seeding. */ }
  return <main className="mx-auto grid max-w-7xl gap-6 p-5 sm:p-8"><Link href="/demo/features" className="text-accent">← 기능 지도</Link><h1 className="m-0 text-3xl">개발 회고 체험</h1><DemoRetro days={days}/></main>;
}
