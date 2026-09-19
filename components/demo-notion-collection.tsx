"use client";

import { useMemo, useState } from "react";
import {
  DEMO_NOTION_ROOTS,
  DEMO_NOTION_SOURCES,
} from "@/lib/demo-access";
import {
  NotionSourceList,
  type CollectedNotionRoot,
  type CollectedNotionSource,
} from "@/components/notion-source-list";

const departments = [
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "영업팀", missingConsent: 0 },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "개발팀", missingConsent: 0 },
  { id: "11111111-1111-4111-8111-111111111119", name: "인사팀", missingConsent: 1 },
] as const;

const topLevel = [
  { id: "demo-sales-principles", title: "영업 운영 위키 (합성)", kind: "page" },
  { id: "demo-dev-principles", title: "개발 운영 위키 (합성)", kind: "page" },
] as const;

export function DemoNotionCollection() {
  const [connected, setConnected] = useState(true);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, "dept" | "leads_only">>({});
  const [includeNew, setIncludeNew] = useState<Record<string, boolean>>(
    Object.fromEntries(topLevel.map((entry) => [entry.id, true])),
  );
  const [selectedDept, setSelectedDept] = useState<string>(departments[0].id);
  const [role, setRole] = useState<"lead" | "member">("lead");
  const [message, setMessage] = useState("모든 조작은 이 브라우저에서만 유지됩니다.");
  const [started, setStarted] = useState(false);

  const demoSources = useMemo<CollectedNotionSource[]>(
    () => DEMO_NOTION_SOURCES.filter((source) => source.dept_id === selectedDept).map((source) => ({
      id: source.id,
      root_id: source.root_id,
      external_id: source.external_id,
      title: source.title,
      visibility: source.visibility,
      active: source.active,
      last_synced_at: source.last_synced_at,
      last_error: source.last_error,
      parent_external_id: source.parent_external_id,
      ingest_mode: "reference",
    })),
    [selectedDept],
  );
  const demoRoots = useMemo<CollectedNotionRoot[]>(
    () => DEMO_NOTION_ROOTS.filter((root) => root.dept_id === selectedDept).map((root) => ({
      id: root.id,
      top_title: root.top_title,
      state: root.state,
      visibility: root.visibility,
      card_candidates: root.card_candidates,
    })),
    [selectedDept],
  );

  function startCollection() {
    const assigned = topLevel.filter((entry) => mapping[entry.id]);
    if (assigned.length === 0) {
      setMessage("먼저 최상위 항목을 부서에 매핑해주세요.");
      return;
    }
    const blocked = assigned.find((entry) =>
      departments.find((department) => department.id === mapping[entry.id])?.missingConsent,
    );
    if (blocked) {
      const department = departments.find((item) => item.id === mapping[blocked.id])!;
      setMessage(`${department.name}에 동의하지 않은 멤버 ${department.missingConsent}명이 있어 시작할 수 없습니다. 가져오기를 시작하지 않았습니다.`);
      setStarted(false);
      return;
    }
    setStarted(true);
    setMessage(`${assigned.length}개 최상위 항목의 합성 수집을 시작했습니다. 실제 노션이나 데이터베이스에는 요청하지 않았습니다.`);
  }

  return (
    <main className="demo-landing">
      <header className="demo-intro">
        <p className="eyebrow">가상 회사 자료 · 직접 눌러 보는 체험</p>
        <h1>노션 자동 수집</h1>
        <p>조직 관리자의 범위 매핑과 팀장의 문서 통제를 한 흐름으로 확인합니다.</p>
      </header>
      <p className="demo-safe-banner" role="status">{message}</p>

      <section className="panel grid gap-5 p-5 sm:p-6" id="demo-notion-admin" aria-labelledby="demo-notion-admin-heading">
        <div>
          <p className="eyebrow">조직 관리 · 자료 연결</p>
          <h2 className="m-0 text-xl" id="demo-notion-admin-heading">노션 연결과 범위 매핑</h2>
          <p className="mb-0 mt-2 text-sm text-[var(--muted)]">노션에서 일부만 보던 문서도 선택한 부서의 전원(또는 팀장)에게 검색됩니다. 회의록처럼 발언이 담긴 문서도 수집되며 부서 구성원 전원의 동의가 필요합니다.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 p-4">
          <span><strong>온새미로 노션 (합성)</strong> · {connected ? "연결됨" : "연결 해제됨"}</span>
          <button className="button button-small" onClick={() => {
            setConnected((current) => !current);
            setMessage(connected ? "연결 해제 체험 완료 · 실제 토큰은 변경하지 않았습니다." : "연결 체험 완료 · 실제 노션 호출은 없습니다.");
          }} type="button">{connected ? "연결 해제 체험" : "연결 체험"}</button>
        </div>
        <div className="grid gap-3">
          {topLevel.map((entry) => (
            <fieldset className="grid gap-3 rounded-xl border border-black/10 p-4 md:grid-cols-3" disabled={!connected} key={entry.id}>
              <legend className="px-1 font-bold">{entry.title}</legend>
              <label className="grid gap-1 text-sm">부서
                <select aria-label={`${entry.title} 부서`} className="rounded-lg border border-black/15 bg-white px-3 py-2" value={mapping[entry.id] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [entry.id]: event.target.value }))}>
                  <option value="">배정 안 함</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">볼 수 있는 사람
                <select aria-label={`${entry.title} 볼 수 있는 사람`} className="rounded-lg border border-black/15 bg-white px-3 py-2" value={visibility[entry.id] ?? "dept"} onChange={(event) => setVisibility((current) => ({ ...current, [entry.id]: event.target.value as "dept" | "leads_only" }))}>
                  <option value="dept">부서 전체</option>
                  <option value="leads_only">팀장만</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm"><input checked={includeNew[entry.id]} onChange={(event) => setIncludeNew((current) => ({ ...current, [entry.id]: event.target.checked }))} type="checkbox" />새 문서 포함</label>
            </fieldset>
          ))}
        </div>
        <button className="button button-primary w-fit" disabled={!connected} onClick={startCollection} type="button">수집 시작 체험</button>
        {started ? (
          <div className="grid gap-2" aria-label="합성 수집 진행 현황">
            {DEMO_NOTION_ROOTS.map((root) => (
              <p className="m-0 rounded-xl bg-black/5 p-3 text-sm" key={root.id}>
                {departments.find((department) => department.id === root.dept_id)?.name} · 발견 {root.discovered_count} · 완료 {root.completed_count} · 대기 {root.pending_count} · 실패 {root.failed_count} · 제외 {root.excluded_count}
              </p>
            ))}
            <p className="m-0 text-sm text-[var(--muted)]">미배정 2건 · 본문을 읽지 않았습니다.</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4" id="demo-notion-department" aria-labelledby="demo-notion-department-heading">
        <div className="panel grid gap-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow">부서 설정 · 연결 관리</p>
            <h2 className="m-0 text-xl" id="demo-notion-department-heading">자동 수집 문서 통제</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-sm">확인할 부서
              <select className="rounded-lg border border-black/15 bg-white px-3 py-2" value={selectedDept} onChange={(event) => setSelectedDept(event.target.value)}>
                {departments.slice(0, 2).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <div aria-label="권한 보기" className="flex items-end gap-2" role="group">
              <button aria-pressed={role === "lead"} className="button button-small" onClick={() => setRole("lead")} type="button">팀장 보기</button>
              <button aria-pressed={role === "member"} className="button button-small" onClick={() => setRole("member")} type="button">일반 멤버 보기</button>
            </div>
            <button className="button button-small self-end" onClick={() => setMessage("재발견 체험 완료 · 제외한 문서는 계속 제외 상태입니다.")} type="button">재발견 체험</button>
          </div>
        </div>
        <NotionSourceList key={selectedDept} deptId={selectedDept} role={role} demo={{ sources: demoSources, roots: demoRoots }} />
      </section>
    </main>
  );
}
