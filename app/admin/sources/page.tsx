import { AdminSourceRow } from "@/lib/contracts";
import { AdminSourcesTable, AdminUnavailable } from "@/components/admin/views";
import { adminRead } from "../_data";

export default async function AdminSourcesPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const [{ dept }, sources] = await Promise.all([searchParams, adminRead("admin_sources", AdminSourceRow.array())]);
  const departments = [...new Map((sources ?? []).map((source) => [source.dept_id, source.dept_name])).entries()];
  return <><h1 className="m-0 text-3xl">수집 채널</h1><p className="m-0 text-sm text-muted">채널 추가·제거는 부서장이 부서 세팅에서 합니다.</p><form className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm">부서<select name="dept" defaultValue={dept ?? ""} className="rounded-xl border border-ink/20 bg-surface px-3 py-2"><option value="">전체 부서</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="rounded-xl border border-accent/30 px-4 py-2 text-sm font-bold text-accent">조회</button></form>{sources ? <AdminSourcesTable rows={dept ? sources.filter((source) => source.dept_id === dept) : sources} /> : <AdminUnavailable />}</>;
}
