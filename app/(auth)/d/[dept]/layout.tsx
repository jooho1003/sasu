import Link from "next/link";

import { requirePageMembership } from "@/lib/supabase/membership";
import { orgAdminReadEnabled } from "@/lib/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type DepartmentLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ dept: string }>;
}>;

export default async function DepartmentLayout({
  children,
  params,
}: DepartmentLayoutProps) {
  const { dept } = await params;
  const nextPath = `/d/${dept}`;
  const membership = await requirePageMembership(dept, nextPath);
  let showOrgAdmin = false;
  if (orgAdminReadEnabled()) {
    try {
      const result = await (await createServerSupabaseClient()).rpc("admin_org_id");
      showOrgAdmin = !result.error && Boolean(result.data);
    } catch { /* Optional navigation must not prevent department access. */ }
  }

  return (
    <div
      data-membership-dept-id={membership.deptId}
      data-membership-role={membership.role}
    >
      {showOrgAdmin ? <div className="px-5 py-3 text-right text-sm"><Link href="/admin">조직 관리 →</Link></div> : null}
      {!membership.consentedAt ? (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-[var(--urgent)]/15 px-5 py-3 text-sm">
          <strong>동의 전에는 내 발언이 저장되지 않습니다.</strong>
          <Link href={`/consent?next=${encodeURIComponent(nextPath)}`}>
            동의문 보기
          </Link>
        </div>
      ) : null}
      {children}
    </div>
  );
}
