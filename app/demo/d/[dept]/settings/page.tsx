import SettingsS5 from "@/components/settings-s5";
import { DemoReadOnlyFrame } from "@/components/demo-safe-actions";
import { requireDemoReviewer } from "@/lib/supabase/membership";

export default async function DemoSettingsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  await requireDemoReviewer(`/demo/d/${dept}/settings`);
  return (
    <DemoReadOnlyFrame>
      <SettingsS5 deptId={dept} memberAdminEnabled={false} />
    </DemoReadOnlyFrame>
  );
}
