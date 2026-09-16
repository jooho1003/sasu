import { DemoReviewSimulator } from "@/components/demo-safe-actions";
import { requireDemoReviewer } from "@/lib/supabase/membership";

export default async function DemoReviewsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  await requireDemoReviewer(`/demo/d/${dept}/reviews`);
  return <DemoReviewSimulator />;
}
