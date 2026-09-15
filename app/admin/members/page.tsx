import { AdminInviteRow, AdminMemberRow } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { AdminMembersTable, AdminInvitesTable, AdminUnavailable } from "@/components/admin/views";
import { AdminTabs } from "@/components/admin/actions";
import { adminRead } from "../_data";

export default async function AdminMembersPage() {
  const [members, invites] = await Promise.all([adminRead("admin_members", AdminMemberRow.array()), adminRead("admin_invites", AdminInviteRow.array())]);
  const writesEnabled = orgAdminWritesEnabled();
  return <><h1 className="m-0 text-3xl">멤버</h1><p className="m-0 text-sm text-muted">기존 부서의 멤버 초대와 부서장 지정은 부서장이 부서 세팅에서 합니다.</p><AdminTabs tabs={[
    { label: "멤버", content: members ? <AdminMembersTable rows={members} writesEnabled={writesEnabled} /> : <AdminUnavailable /> },
    { label: "대기 중 초대", content: invites ? <AdminInvitesTable rows={invites} writesEnabled={writesEnabled} /> : <AdminUnavailable /> },
  ]} /></>;
}
