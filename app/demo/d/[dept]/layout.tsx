import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Icon } from "@/components/ui/icon";
import { siteLinks } from "@/lib/site";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { DemoWorkspaceState } from "@/components/demo-workspace-state";

export const dynamic = "force-dynamic";

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
  // Public demo departments are exposed only through the SECURITY DEFINER RPC.
  // Direct table reads are intentionally hidden by RLS, even for the demo account.
  const { data } = await supabase.rpc("demo_departments");
  const department = ((data ?? []) as Array<{ id: string; name: string }>).find(
    (candidate) => candidate.id === dept,
  );
  if (!department) notFound();
  const { data: firstCard } = await supabase.from("decision_requests").select("id").eq("dept_id", dept).order("opened_at", { ascending: false }).limit(1).maybeSingle();

  return (
    <DemoWorkspaceState key={dept}><WorkspaceShell
      demo
      fullDemo
      firstCardId={firstCard?.id}
      deptId={dept}
      departmentName={department.name}
      showOrgAdmin
      showRetros={process.env.SASU_RETRO_ENABLED === "true"}
      showTrailers
    >
      {children}
      <aside className="workspace-cta" aria-label="게스트 데모 다음 단계">
        <div>
          <strong>결정이 실제 업무로 이어지는 순간</strong>
          <p>예고편을 열고 신입의 첫 업무를 직접 체험해 보세요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <Link className="button button-primary button-small" href={`/demo/d/${dept}/trailers`}>예고편 바로 체험 <Icon name="arrow" size={14} /></Link>
          <Link className="text-link" href="/demo">
            다른 부서 보기
          </Link>
        </div>
      </aside>
    </WorkspaceShell></DemoWorkspaceState>
  );
}
