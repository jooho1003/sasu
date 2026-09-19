import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrailerInviteFlow } from "@/components/trailer-invite-flow";
import { TrailerInviteToken } from "@/lib/contracts";
import { trailerInvitesEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "채용 예고편",
  robots: { index: false, follow: false },
};

export default async function TrailerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!trailerInvitesEnabled()) notFound();
  const { token } = await params;
  if (!TrailerInviteToken.safeParse(token).success) notFound();
  return <TrailerInviteFlow token={token} />;
}
