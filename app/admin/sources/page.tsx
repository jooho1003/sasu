import { AdminSourceRow } from "@/lib/contracts";
import { AdminSourcesTable, AdminUnavailable } from "@/components/admin/views";
import { adminRead } from "../_data";
import { SlackInstallation } from "@/components/admin/slack-installation";
import { NotionInstallation } from "@/components/admin/notion-installation";
import { NotionCollection } from "@/components/admin/notion-collection";

export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; slack?: string }>;
}) {
  const [{ dept, slack }, sources] = await Promise.all([
    searchParams,
    adminRead("admin_sources", AdminSourceRow.array()),
  ]);
  const departments = [
    ...new Map(
      (sources ?? []).map((source) => [source.dept_id, source.dept_name]),
    ).entries(),
  ];
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">조직 관리</p>
          <h1>수집 채널</h1>
          <p>채널 추가·제거는 부서장이 부서 세팅에서 합니다.</p>
        </div>
      </header>
      <SlackInstallation result={slack} />
      <NotionInstallation />
      <NotionCollection departments={departments.map(([id, name]) => ({ id, name }))} />
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid gap-2 text-sm">
          부서
          <select
            name="dept"
            defaultValue={dept ?? ""}
            className="rounded-xl border border-ink/20 bg-surface px-3 py-2"
          >
            <option value="">전체 부서</option>
            {departments.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-xl border border-accent/30 px-4 py-2 text-sm font-bold text-accent">
          조회
        </button>
      </form>
      {sources ? (
        <AdminSourcesTable
          rows={
            dept ? sources.filter((source) => source.dept_id === dept) : sources
          }
        />
      ) : (
        <AdminUnavailable />
      )}
    </>
  );
}
