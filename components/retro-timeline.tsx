"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RetroDayRow } from "@/lib/contracts";
import { localDate, parseRetroBundle } from "@/lib/retro/bundle";

const statusLabels = { collecting: "수집 중", drafting: "초안 생성 중", draft: "초안", needs_review: "검토 필요", confirmed: "확정", failed: "실패" };
const visibilityLabels = { self: "본인만", dept: "부서 공개", leads_only: "부서장 전용" };
export function RetroTimeline({ dept, userId, initialDays, readOnly = false, onSelect }: { dept: string; userId: string; initialDays?: RetroDayRow[]; readOnly?: boolean; onSelect?: (id: string) => void }) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays ?? []), [loading, setLoading] = useState(!initialDays), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""), [person, setPerson] = useState(""), [topic, setTopic] = useState(""), [mine, setMine] = useState(false), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (readOnly) return;
    try { const response = await fetch(`/api/d/${dept}/retros`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), cache: "no-store" }); if (!response.ok) throw new Error(); const data = await response.json(); setDays(data.days); setMessage(""); }
    catch { if (!signal?.aborted) setMessage("회고를 불러오지 못했습니다. 새로고침해 주세요."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [dept, readOnly]);
  // The effect starts the request that synchronizes the server snapshot.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { if (readOnly || !days.some(d => d.status === "drafting")) return; const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer); }, [days, load, readOnly]);
  async function create(file?: File) {
    if (busy || readOnly) return; setBusy(true); setMessage("");
    try {
      if (file && (file.size > 1048576 || !file.name.endsWith(".json"))) throw new Error("1MB 이하 JSON 파일을 선택해 주세요.");
      const bundle = file ? parseRetroBundle(JSON.parse(await file.text())) : null;
      if (bundle && !bundle.ok) throw new Error("회고 파일의 날짜·형식·한도를 확인해 주세요.");
      const value = bundle?.ok ? bundle.bundle : null;
      const response = await fetch(`/api/d/${dept}/retros`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), date: value?.date ?? localDate(new Date(), "Asia/Seoul"), tz: value?.tz ?? "Asia/Seoul", bundle: value }), signal: AbortSignal.timeout(20000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "회고를 만들지 못했습니다.");
      router.push(`/d/${dept}/retros/${result.id}`);
    } catch (error) { setMessage(error instanceof Error && !error.message.includes("JSON") ? error.message : "회고 파일을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  const visible = days.filter(d => (!mine || d.user_id === userId) && (!person || person === d.user_id) && (!topic || d.topics.includes(topic)) && (!from || d.retro_date >= from) && (!to || d.retro_date <= to) && `${d.title ?? ""} ${d.topics.join(" ")}`.includes(search));
  const names = [...new Map(days.map(d => [d.user_id, d.display_name ?? "작성자"])).entries()];
  const topics = [...new Set(days.flatMap(d => d.topics))];
  const [week] = useState(() => localDate(new Date(Date.now() - 7 * 86400000), "Asia/Seoul"));
  const weekly = days.filter(d => d.retro_date >= week);
  const counts = new Map<string, number>(); weekly.flatMap(d => d.topics).forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1));
  const inputClass = "min-w-0 rounded-xl border border-ink/15 bg-white px-3 py-2";
  return <div className="grid gap-6">
    <section className="grid gap-4 rounded-2xl border border-ink/10 bg-surface p-5" aria-label="오늘 회고 만들기" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) void create(e.dataTransfer.files[0]); }}>
      <h2 className="m-0 text-xl">오늘 회고 만들기</h2><p className="m-0 text-sm text-muted">로컬 수집기가 만든 파일을 여기에 놓거나 사수 안의 내 활동만 모아 시작하세요.</p>
      <div className="flex flex-wrap gap-3"><label className="grid gap-2 text-sm">회고 파일 업로드<input aria-label="회고 파일 업로드" type="file" accept=".json,application/json" disabled={busy || readOnly} onChange={e => { if (e.target.files?.[0]) void create(e.target.files[0]); e.target.value = ""; }} /></label><button className={inputClass} type="button" disabled={busy || readOnly} title={readOnly ? "체험판에서는 만들 수 없어요" : undefined} onClick={() => void create()}>사수 활동만으로 만들기</button></div>
      <Link href={readOnly ? "/demo/features" : `/d/${dept}/settings#retro-collector`} className="text-sm text-accent underline">수집기 설정 안내</Link>
    </section>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="grid content-start gap-5" aria-label="회고 타임라인">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input className={inputClass} aria-label="제목·주제 검색" placeholder="제목·주제 검색" value={search} onChange={e => setSearch(e.target.value)} />
          <select className={inputClass} aria-label="작성자" value={person} onChange={e => setPerson(e.target.value)}><option value="">모든 작성자</option>{names.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <select className={inputClass} aria-label="주제" value={topic} onChange={e => setTopic(e.target.value)}><option value="">모든 주제</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
          <label className="grid gap-1 text-sm">시작일<input className={inputClass} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="grid gap-1 text-sm">종료일<input className={inputClass} type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} />내 회고만</label>
        </div>
        {message ? <p role="alert">{message}</p> : null}
        {loading ? <p role="status">회고를 불러오는 중입니다.</p> : !visible.length ? <p>아직 회고가 없어요. 수집기로 오늘 활동을 모아 보세요.</p> : visible.map(d => <article key={d.id} className="grid gap-3 rounded-2xl border border-ink/10 bg-surface p-5"><p className="m-0 text-sm text-muted">{d.retro_date} · {d.display_name ?? "작성자"} · {visibilityLabels[d.visibility]}</p><h2 className="m-0 text-xl">{onSelect ? <button className="text-left text-accent" onClick={() => onSelect(d.id)}>{d.title || "회고 초안"}</button> : <Link href={`/d/${dept}/retros/${d.id}`} className="text-accent">{d.title || "회고 초안"}</Link>}</h2><p className="m-0 text-sm">{statusLabels[d.status]} · 활동 {d.activity_count}건</p><div className="flex flex-wrap gap-2">{d.topics.map(t => <span key={t} className="rounded-full bg-accent/10 px-3 py-1 text-xs">{t}</span>)}</div></article>)}
      </section>
      <aside className="h-fit rounded-2xl bg-ink/5 p-5"><h2 className="mt-0 text-lg">이번 주 주제</h2>{[...counts].sort((a,b) => b[1]-a[1]).slice(0,10).map(([t,n]) => <p key={t}>{t} · {n}</p>)}<h2 className="text-lg">작성자별 확정 일수</h2>{names.map(([id,name]) => <p key={id}>{name} · {new Set(weekly.filter(d => d.user_id===id && d.confirmed_revision!==null).map(d=>d.retro_date)).size}일</p>)}</aside>
    </div>
  </div>;
}
