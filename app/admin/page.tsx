import { AdminInviteRow } from "@/lib/contracts";
import { orgAdminWritesEnabled, trailerPublishEnabled } from "@/lib/features";
import { AdminOverviewView, AdminUnavailable } from "@/components/admin/views";
import { adminOverview, adminRead } from "./_data";

export default async function AdminPage() {
  const writesEnabled = orgAdminWritesEnabled();
  const [overview, invites] = await Promise.all([
    adminOverview(),
    writesEnabled
      ? adminRead("admin_invites", AdminInviteRow.array())
      : Promise.resolve([]),
  ]);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">조직 관리</p>
          <h1>조직 개요</h1>
          <p>부서별 멤버, 연결된 자료와 의사결정 현황을 한눈에 확인하세요.</p>
        </div>
      </header>
      {overview ? (
        <AdminOverviewView
          data={overview}
          invites={invites ?? []}
          writesEnabled={writesEnabled}
          publishingEnabled={trailerPublishEnabled()}
        />
      ) : (
        <AdminUnavailable />
      )}
    </>
  );
}
