import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Icon } from "@/components/ui/icon";
import { siteLinks } from "@/lib/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { orgAdminReadEnabled, trailerPublishEnabled } from "@/lib/features";

export default async function DemoDepartmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const links = siteLinks();
  const supabase = createPublicSupabaseClient();
  const { data: department } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", dept)
    .maybeSingle<{ id: string; name: string }>();
  if (!department) notFound();

  return (
    <WorkspaceShell
      demo
      deptId={dept}
      departmentName={department.name}
      showOrgAdmin={orgAdminReadEnabled()}
      showTrailers={trailerPublishEnabled()}
    >
      {children}
      <aside className="workspace-cta" aria-label="게스트 데모 다음 단계">
        <div>
          <strong>우리 부서의 결정도 사수하세요</strong>
          <p>우리 팀의 기록을 연결하고, 함께 일할 사수를 만나보세요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {links.pilotContactUrl ? (
            <a
              className="button button-primary button-small"
              href={links.pilotContactUrl}
              target="_blank"
              rel="noreferrer"
            >
              파일럿 문의
            </a>
          ) : (
            <Link className="button button-primary button-small" href="/#pilot">
              우리 팀에 적용하기 <Icon name="arrow" size={14} />
            </Link>
          )}
          {links.voteUrl ? (
            <a
              className="text-link"
              href={links.voteUrl}
              target="_blank"
              rel="noreferrer"
            >
              투표하기
            </a>
          ) : null}
          {links.demoVideoUrl ? (
            <a
              className="text-link"
              href={links.demoVideoUrl}
              target="_blank"
              rel="noreferrer"
            >
              3분 데모 영상
            </a>
          ) : null}
          <Link className="text-link" href="/demo">
            다른 부서 보기
          </Link>
        </div>
      </aside>
    </WorkspaceShell>
  );
}
