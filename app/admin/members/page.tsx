import { AdminInviteRow, AdminMemberRow } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import {
  AdminMembersTable,
  AdminInvitesTable,
  AdminUnavailable,
} from "@/components/admin/views";
import { AdminTabs } from "@/components/admin/actions";
import { adminRead } from "../_data";

export default async function AdminMembersPage() {
  const [members, invites] = await Promise.all([
    adminRead("admin_members", AdminMemberRow.array()),
    adminRead("admin_invites", AdminInviteRow.array()),
  ]);
  const writesEnabled = orgAdminWritesEnabled();
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">조직 관리</p>
          <h1>멤버</h1>
          <p>
            기존 부서의 멤버 초대와 부서장 지정은 부서장이 부서 세팅에서 합니다.
          </p>
        </div>
      </header>
      <AdminTabs
        tabs={[
          {
            label: "멤버",
            content: members ? (
              <AdminMembersTable rows={members} writesEnabled={writesEnabled} />
            ) : (
              <AdminUnavailable />
            ),
          },
          {
            label: "대기 중 초대",
            content: invites ? (
              <AdminInvitesTable rows={invites} writesEnabled={writesEnabled} />
            ) : (
              <AdminUnavailable />
            ),
          },
        ]}
      />
    </>
  );
}
