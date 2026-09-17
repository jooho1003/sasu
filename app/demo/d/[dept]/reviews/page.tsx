import { DemoReviewSimulator } from "@/components/demo-safe-actions";

export default async function DemoReviewsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  await params;
  return <DemoReviewSimulator />;
}
