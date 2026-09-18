"use client";

import { useEffect, useState } from "react";

type Entry = { id: string; title: string; kind: "page" | "data_source" | "unknown" };
type Root = { root_id: string; dept_name: string; top_title: string | null; scope: string; state: string; discovered_count: number; completed_count: number; pending_count: number; failed_count: number; unassigned_count: number };

export function NotionCollection({ departments }: { departments: Array<{ id: string; name: string }> }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [roots, setRoots] = useState<Root[]>([]);
  const [dept, setDept] = useState("");
  const [message, setMessage] = useState("최상위 항목을 불러오는 중입니다.");
  const load = async () => {
    try {
      const [top, status] = await Promise.all([
        fetch("/api/admin/notion/top-level", { cache: "no-store" }),
        fetch("/api/admin/notion/roots", { cache: "no-store" }),
      ]);
      if (!top.ok || !status.ok) throw new Error();
      setEntries((await top.json()).results); setRoots((await status.json()).roots); setMessage("");
    } catch { setMessage("Notion 연결 또는 현황을 확인하지 못했습니다."); }
  };
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const timer = window.setInterval(() => void load(), 10_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, []);
  const save = async (entry: Entry | null) => {
    if (!dept) { setMessage("먼저 수집할 부서를 선택해주세요."); return; }
    const response = await fetch("/api/admin/notion/roots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dept, scope: entry ? "subtree" : "workspace", notion_id: entry?.id ?? "", kind: entry?.kind ?? "", title: entry?.title ?? "", visibility: "dept", include_new: true }) });
    const body = await response.json() as { error?: string; missing?: number };
    setMessage(response.ok ? "수집을 시작했습니다. 현황이 곧 갱신됩니다." : body.missing ? `선택한 부서에 동의하지 않은 멤버 ${body.missing}명이 있어 시작할 수 없습니다.` : (body.error ?? "수집 시작에 실패했습니다."));
    if (response.ok) await load();
  };
  return <section className="panel grid gap-4 p-5" aria-label="Notion 자동 수집 범위">
    <div><h2 className="m-0 text-xl">Notion 자동 수집</h2><p className="mb-0 mt-2 text-sm text-[var(--muted)]">노션에서 일부만 보던 문서도 선택한 부서의 전원(또는 부서장)에게 검색됩니다. 회의록처럼 발언이 담긴 문서도 수집됩니다. 부서 구성원 전원의 동의가 필요합니다.</p></div>
    <label className="grid max-w-sm gap-2 text-sm">수집 부서<select value={dept} onChange={(event) => setDept(event.target.value)} className="rounded-xl border border-ink/20 bg-surface px-3 py-2"><option value="">부서 선택</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <div className="grid gap-2">{entries.map((entry) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3" key={entry.id}><span>{entry.title} <small className="text-[var(--muted)]">{entry.kind === "data_source" ? "데이터베이스" : "페이지"}</small></span><button className="button button-primary button-small" onClick={() => void save(entry)} type="button">수집 시작</button></div>)}<button className="button button-small w-fit" onClick={() => void save(null)} type="button">나머지 전부를 한 부서로</button></div>
    {message ? <p role="status" className="m-0 text-sm">{message}</p> : null}
    <div className="grid gap-2">{roots.map((root) => <p className="m-0 rounded-lg bg-black/5 p-3 text-sm" key={root.root_id}>{root.dept_name} · {root.top_title ?? "전체 워크스페이스"} · {root.state} · 완료 {root.completed_count} / 대기 {root.pending_count} / 실패 {root.failed_count} · 미배정 {root.unassigned_count}</p>)}</div>
  </section>;
}
