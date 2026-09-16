import { DemoReadOnlyFrame } from "@/components/demo-safe-actions";
import { RetentionConsole } from "@/components/retention-console";
import { requireDemoReviewer } from "@/lib/supabase/membership";

export default async function DemoRetentionPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  await requireDemoReviewer(`/demo/d/${dept}/retention`);
  return (
    <DemoReadOnlyFrame>
      <RetentionConsole deptId={dept} />
    </DemoReadOnlyFrame>
  );
}
