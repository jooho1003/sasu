import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecruitmentTrailer } from "@/components/recruitment-trailer";
import { trailerPublishEnabled } from "@/lib/features";
import { parsePublicTrailer, PUBLIC_TRAILER_SLUG } from "@/lib/trailer-public";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "채용 예고편", robots: { index: false, follow: false } };
export default async function PublicTrailerPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!trailerPublishEnabled()) notFound(); const { slug } = await params;
  if (!PUBLIC_TRAILER_SLUG.test(slug)) notFound();
  let result;
  try { result = await createPublicSupabaseClient().rpc("public_trailer", { p_slug: slug }); }
  catch { return <Unavailable slug={slug} />; }
  if (result.error) return <Unavailable slug={slug} />;
  if (result.data === null) notFound();
  const parsed = parsePublicTrailer(result.data); if (parsed.status !== "ok") return <Unavailable slug={slug} />;
  return <RecruitmentTrailer scenarios={parsed.scenarios} applyUrl={parsed.applyUrl} notice="이 체험의 회사·인물·수치는 가상화되었습니다" />;
}
function Unavailable({ slug }: { slug: string }) { return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-5 p-6"><h1 className="text-2xl">체험을 불러오지 못했습니다</h1><p role="alert">잠시 후 다시 시도해주세요.</p><a href={`/t/${slug}`} className="text-accent">다시 시도</a></main>; }
