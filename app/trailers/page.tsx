import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecruitmentTrailer } from "@/components/recruitment-trailer";
import { trailerScenarios } from "@/fixtures/trailer/scenarios";
import { validateScenario } from "@/lib/trailer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "채용 예고편 · 사수",
  description: "입사 전에 만나보는, 우리 팀의 결정하는 방식. 가상 사례로 체험하는 오피스.",
  robots: { index: false, follow: false },
};

export default function TrailersPage() {
  if (process.env.SASU_TRAILER_PREVIEW_ENABLED !== "true") notFound();
  return <RecruitmentTrailer scenarios={trailerScenarios.map(validateScenario)} />;
}
