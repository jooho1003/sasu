import DocumentAssistant from "@/components/document-assistant";
import { DemoReadOnlyFrame } from "@/components/demo-safe-actions";
import { requireDemoReviewer } from "@/lib/supabase/membership";

export default async function DemoDocumentsPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  await requireDemoReviewer(`/demo/d/${dept}/documents`);
  return (
    <DemoReadOnlyFrame>
      <DocumentAssistant deptId={dept} role="lead" />
    </DemoReadOnlyFrame>
  );
}
