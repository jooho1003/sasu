import type { ReactNode } from "react";
import type {
  AdminOverview,
  AdminMemberRow,
  DemoAdminMemberRow,
  AdminSourceRow,
  AdminAnswerStatRow,
  AdminEventRow,
  AdminInviteRow,
} from "@/lib/contracts";
import { AdminAction } from "./actions";

const cell = "px-4 py-3 text-left align-top";
export const adminPanel = "panel min-w-0 p-5 sm:p-6";

export function AdminTable({
  headers,
  children,
  empty = false,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div
        className="admin-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={headers.join(" · ")}
      >
        <table className="admin-table">
          <thead className="admin-table-head">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className={`${cell} whitespace-nowrap`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {empty ? (
              <tr>
                <td colSpan={headers.length} className={`${cell} text-muted`}>
                  표시할 기록이 없습니다.
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      <p className="mb-0 mt-2 text-right text-[10px] text-muted sm:hidden">
        표를 좌우로 밀어 더 확인하세요 →
      </p>
    </div>
  );
}

export function AdminUnavailable({
  children = "관리 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
}: {
  children?: ReactNode;
}) {
  return (
    <p role="status" className={adminPanel}>
      {children}
    </p>
  );
}

export function AdminOverviewView({
  data,
  readOnly = false,
  writesEnabled = false,
  publishingEnabled = false,
  invites = [],
}: {
  data: AdminOverview;
  readOnly?: boolean;
  writesEnabled?: boolean;
  publishingEnabled?: boolean;
  invites?: AdminInviteRow[];
}) {
  const members = data.departments.reduce(
    (sum, dept) => sum + dept.member_count,
    0,
  );
  const consented = data.departments.reduce(
    (sum, dept) => sum + dept.consented_count,
    0,
  );
  const canWrite = !readOnly && writesEnabled;
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "부서",
            value: data.departments.length,
            detail: "우리 조직의 부서",
          },
          { label: "멤버", value: members, detail: `${consented}명 동의` },
          {
            label: "연결된 자료",
            value: data.departments.reduce(
              (sum, dept) => sum + dept.active_source_count,
              0,
            ),
            detail: "현재 수집 중",
          },
          {
            label: "공개 중인 예고편",
            value: data.published_trailers.length,
            detail: "예고편 공개 현황",
          },
        ].map((item) => (
          <section key={item.label} className={`${adminPanel} admin-stat`}>
            <h2 className="m-0 text-sm text-muted">{item.label}</h2>
            <p className="my-3 text-3xl font-bold">{item.value}</p>
            <p className="m-0 text-sm text-muted">{item.detail}</p>
          </section>
        ))}
      </div>
      <section className={`${adminPanel} grid gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl">부서 현황</h2>
          {canWrite ? (
            <AdminAction
              label={data.departments.length ? "부서 만들기" : "첫 부서 만들기"}
              endpoint="/api/admin/departments"
              kind="department"
              description="부서를 만든 뒤 첫 부서장을 초대할 수 있습니다."
            />
          ) : null}
        </div>
        {!data.departments.length ? (
          <p className="m-0 text-muted">
            아직 부서가 없습니다. 첫 부서를 만들고 부서장을 초대해 주세요.
          </p>
        ) : (
          <AdminTable
            headers={[
              "부서",
              "부서장",
              "멤버",
              "동의",
              "자료",
              "30일 결정",
              "30일 질문",
              ...(canWrite ? ["관리"] : []),
            ]}
          >
            {data.departments.map((dept) => (
              <tr key={dept.dept_id}>
                <th scope="row" className={cell}>
                  {dept.name}
                </th>
                <td className={cell}>
                  {dept.lead_names.length ? (
                    dept.lead_names.join(", ")
                  ) : (
                    <span className="rounded-full bg-ink/5 px-2 py-1 text-xs">
                      부서장 없음
                    </span>
                  )}
                </td>
                {[
                  dept.member_count,
                  dept.consented_count,
                  dept.active_source_count,
                  dept.decisions_30d,
                  dept.answers_30d,
                ].map((value, index) => (
                  <td key={index} className={cell}>
                    {value}
                  </td>
                ))}
                {canWrite ? (
                  <td className={cell}>
                    {dept.member_count === 0 ? (
                      <AdminAction
                        label="첫 부서장 초대"
                        endpoint={`/api/admin/departments/${dept.dept_id}/first-lead-invite`}
                        kind="invite"
                        description={`${dept.name}의 첫 부서장을 초대합니다. 자기 이메일은 사용할 수 없습니다.`}
                        pendingInvites={invites
                          .filter((invite) => invite.dept_id === dept.dept_id)
                          .map((invite) => ({
                            inviteId: invite.invite_id,
                            email: invite.email,
                          }))}
                        pendingScope="department"
                        revokeBase="/api/admin/invites"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </AdminTable>
        )}
      </section>
      <section className={`${adminPanel} grid gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-xl">공개 예고편</h2>
          {canWrite && publishingEnabled ? (
            <AdminAction
              label={
                data.trailer_publish_enabled
                  ? "공개 허용 끄기"
                  : "공개 허용 켜기"
              }
              endpoint="/api/admin/trailer-publishing"
              body={{ enabled: !data.trailer_publish_enabled }}
              description={
                data.trailer_publish_enabled
                  ? "공개 중인 예고편이 모두 철회됩니다."
                  : "부서장이 검사와 항목별 승인을 마친 가상 사례를 공개할 수 있게 합니다."
              }
            />
          ) : null}
        </div>
        <p className="m-0 text-sm">
          조직 공개 허용 {data.trailer_publish_enabled ? "켜짐" : "꺼짐"}
        </p>
        <AdminTable
          headers={[
            "부서",
            "제목",
            "발행일",
            "체험",
            ...(canWrite && publishingEnabled ? ["관리"] : []),
          ]}
          empty={!data.published_trailers.length}
        >
          {data.published_trailers.map((trailer) => (
            <tr key={trailer.trailer_id}>
              <td className={cell}>{trailer.dept_name}</td>
              <th className={cell} scope="row">
                {trailer.title}
              </th>
              <td className={cell}>{formatAdminDate(trailer.published_at)}</td>
              <td className={cell}>
                <a className="text-accent" href={trailer.public_path}>
                  공개 링크 →
                </a>
              </td>
              {canWrite && publishingEnabled ? (
                <td className={cell}>
                  <AdminAction
                    label="철회"
                    endpoint={`/api/admin/trailers/${trailer.trailer_id}/unpublish`}
                    description="공개 링크가 닫힙니다. 다시 발행하면 새 링크가 만들어집니다."
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </AdminTable>
      </section>
      <p className="m-0 text-sm text-muted">
        이번 달 AI 호출 수{" "}
        <strong className="text-ink">
          {data.llm_calls_this_month.toLocaleString("ko-KR")}회
        </strong>
      </p>
    </div>
  );
}

export function AdminMembersTable({
  rows,
  readOnly = false,
  writesEnabled = false,
}: {
  rows: (AdminMemberRow | DemoAdminMemberRow)[];
  readOnly?: boolean;
  writesEnabled?: boolean;
}) {
  const canWrite = !readOnly && writesEnabled;
  return (
    <AdminTable
      headers={[
        "이름",
        ...(!readOnly ? ["이메일"] : []),
        "부서",
        "역할",
        "동의",
        "슬랙",
        ...(canWrite ? ["관리"] : []),
      ]}
      empty={!rows.length}
    >
      {rows.map((row, index) => (
        <tr key={`${row.dept_id}-${"user_id" in row ? row.user_id : index}`}>
          <th scope="row" className={cell}>
            {row.display_name}
          </th>
          {!readOnly ? (
            <td className={`${cell} min-w-[180px] break-all`}>
              {"email" in row ? row.email : "—"}
            </td>
          ) : null}
          <td className={cell}>{row.dept_name}</td>
          <td className={cell}>{row.role === "lead" ? "부서장" : "멤버"}</td>
          <td className={cell}>
            <span
              className={`badge ${row.consented_at ? "badge-green" : "badge-urgent"}`}
            >
              {row.consented_at ? "동의" : "미동의"}
            </span>
          </td>
          <td className={cell}>
            <span
              className={`badge ${row.slack_linked ? "badge-green" : "badge-neutral"}`}
            >
              {row.slack_linked ? "연결됨" : "미연결"}
            </span>
          </td>
          {canWrite ? (
            <td className={cell}>
              {"user_id" in row ? (
                <div className="flex flex-wrap gap-2">
                  {row.role === "lead" &&
                  rows.filter(
                    (member) =>
                      member.dept_id === row.dept_id && member.role === "lead",
                  ).length > 1 ? (
                    <AdminAction
                      label="부서장 해제"
                      endpoint="/api/admin/members/demote"
                      body={{ userId: row.user_id, deptId: row.dept_id }}
                      description={`${row.display_name}님의 부서장 권한을 해제하고 멤버로 변경합니다.`}
                    />
                  ) : null}
                  <AdminAction
                    label="제외"
                    endpoint="/api/admin/members/remove"
                    body={{ userId: row.user_id, deptId: row.dept_id }}
                    description={`${row.display_name}님을 ${row.dept_name}에서 제외합니다. 마지막 부서장은 제외할 수 없습니다.`}
                  />
                </div>
              ) : null}
            </td>
          ) : null}
        </tr>
      ))}
    </AdminTable>
  );
}

export function AdminInvitesTable({
  rows,
  writesEnabled = false,
}: {
  rows: AdminInviteRow[];
  writesEnabled?: boolean;
}) {
  return (
    <AdminTable
      headers={[
        "이메일",
        "부서",
        "역할",
        "초대한 주체",
        "초대 일시",
        "만료",
        ...(writesEnabled ? ["관리"] : []),
      ]}
      empty={!rows.length}
    >
      {rows.map((row) => (
        <tr key={row.invite_id}>
          <td className={`${cell} min-w-[180px] break-all`}>{row.email}</td>
          <td className={cell}>{row.dept_name}</td>
          <td className={cell}>{row.role === "lead" ? "부서장" : "멤버"}</td>
          <td className={cell}>
            {row.invited_by_role === "org_admin" ? "조직 관리자" : "부서장"}
          </td>
          <td className={cell}>{formatAdminDate(row.created_at)}</td>
          <td className={cell}>{formatAdminDate(row.expires_at)}</td>
          {writesEnabled ? (
            <td className={cell}>
              <AdminAction
                label="철회"
                endpoint={`/api/admin/invites/${row.invite_id}/revoke`}
                description="이 초대 링크를 더 이상 사용할 수 없게 합니다."
              />
            </td>
          ) : null}
        </tr>
      ))}
    </AdminTable>
  );
}

export function formatAdminDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function AdminSourcesTable({
  rows,
}: {
  rows: AdminSourceRow[];
  readOnly?: boolean;
}) {
  return (
    <AdminTable
      headers={[
        "부서",
        "종류 · 이름",
        "공개 범위",
        "원칙 문서",
        "상태",
        "항목",
        "마지막 동기화",
        "오류",
      ]}
      empty={!rows.length}
    >
      {rows.map((row) => (
        <tr key={row.source_id}>
          <td className={cell}>{row.dept_name}</td>
          <th scope="row" className={cell}>
            {(
              {
                slack_channel: "슬랙",
                meeting: "회의",
                notion_page: "노션",
                document: "문서",
              } as Record<string, string>
            )[row.kind] ?? "문서"}
            <span className="mt-1 block font-normal">
              {row.title ?? "이름 없음"}
            </span>
          </th>
          <td className={cell}>
            {row.visibility === "dept" ? "부서 전체" : "부서장"}
          </td>
          <td className={cell}>{row.is_principles ? "원칙 문서" : "—"}</td>
          <td className={cell}>
            {row.active === null ? "—" : row.active ? "활성" : "비활성"}
          </td>
          <td className={cell}>{row.item_count}</td>
          <td className={cell}>{formatAdminDate(row.last_synced_at)}</td>
          <td className={cell}>{row.has_error ? "확인 필요" : "없음"}</td>
        </tr>
      ))}
    </AdminTable>
  );
}

export function AdminAnswerStatsTable({
  rows,
}: {
  rows: AdminAnswerStatRow[];
  readOnly?: boolean;
}) {
  return (
    <AdminTable
      headers={[
        "날짜",
        "부서",
        "답변",
        "거절",
        "실패",
        "부서 인용",
        "부서장 인용",
        "결정 인용",
      ]}
      empty={!rows.length}
    >
      {rows.map((row) => (
        <tr key={`${row.day}-${row.dept_id}`}>
          <th scope="row" className={cell}>
            {row.day}
          </th>
          <td className={cell}>{row.dept_name}</td>
          {[
            row.answered,
            row.refused,
            row.failed,
            row.cited_dept,
            row.cited_leads_only,
            row.cited_decisions,
          ].map((value, index) => (
            <td key={index} className={cell}>
              {value}
            </td>
          ))}
        </tr>
      ))}
    </AdminTable>
  );
}

const eventLabels: Record<AdminEventRow["action"], string> = {
  department_create: "부서 생성",
  first_lead_invite: "첫 부서장 초대",
  member_invite: "멤버 초대",
  invite_revoke: "초대 철회",
  invite_accept: "초대 수락",
  lead_promote: "부서장 지정",
  lead_demote: "부서장 해제",
  member_remove: "멤버 제외",
};
export function AdminEventsTable({
  rows,
  readOnly = false,
}: {
  rows: AdminEventRow[];
  readOnly?: boolean;
}) {
  if (readOnly) return null;
  return (
    <AdminTable
      headers={["일시", "행위자", "작업", "부서", "대상"]}
      empty={!rows.length}
    >
      {rows.map((row) => (
        <tr key={row.event_id}>
          <td className={cell}>{formatAdminDate(row.created_at)}</td>
          <td className={cell}>{row.actor_label}</td>
          <td className={cell}>{eventLabels[row.action]}</td>
          <td className={cell}>{row.dept_name}</td>
          <td className={cell}>{row.target_user_label}</td>
        </tr>
      ))}
    </AdminTable>
  );
}
