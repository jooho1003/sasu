import { DemoDocumentWorkspace } from "@/components/demo-document-workspace";
import { readDemoWorkspace } from "@/lib/supabase/demo-workspace";

export default async function DemoDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { dept } = await params;
  const { source } = await searchParams;
  return <main className="workspace-page"><header className="page-heading"><div><p className="eyebrow">부서의 근거 자료</p><h1>문서·회의 기록</h1><p>문서를 펼쳐 원문과 여러 결정을 함께 확인하고, 보류 안건을 이어서 결정하세요.</p></div></header><DemoDocumentWorkspace key={source ?? "all"} dept={dept} data={await readDemoWorkspace(dept)} initialSource={source} /></main>;
}
