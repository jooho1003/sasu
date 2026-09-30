import SalesReview from "@/components/sales-review";
import { SALES_CASE_SOURCES, SALES_CASE_TITLES } from "@/lib/sales-review";
import { requireMembership } from "@/lib/supabase/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function SalesReviewPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const membership = await requireMembership(dept);
  const client = await createServerSupabaseClient();
  const demo = await client.rpc("is_demo_department", { p_dept: membership.deptId });
  if (demo.error || demo.data) notFound();
  return <SalesReview
    deptId={membership.deptId}
    role={membership.role}
    consented={Boolean(membership.consentedAt)}
    sources={SALES_CASE_SOURCES}
    titles={SALES_CASE_TITLES}
  />;
}
