import { AdminInviteRow } from "@/lib/contracts";
import { orgAdminWritesEnabled, trailerPublishEnabled } from "@/lib/features";
import { AdminOverviewView, AdminUnavailable } from "@/components/admin/views";
import { adminOverview, adminRead } from "./_data";

export default async function AdminPage() {
  const writesEnabled = orgAdminWritesEnabled();
  const [overview, invites] = await Promise.all([adminOverview(), writesEnabled ? adminRead("admin_invites", AdminInviteRow.array()) : Promise.resolve([])]);
  return <><h1 className="m-0 text-3xl">조직 개요</h1>{overview ? <AdminOverviewView data={overview} invites={invites ?? []} writesEnabled={writesEnabled} publishingEnabled={trailerPublishEnabled()} /> : <AdminUnavailable />}</>;
}
