import { DemoSettings } from "@/components/demo-settings";
import { readDemoWorkspace } from "@/lib/supabase/demo-workspace";
export default async function Page({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  return <DemoSettings retention data={await readDemoWorkspace(dept)} />;
}
