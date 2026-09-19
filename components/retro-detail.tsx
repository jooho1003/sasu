"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RetroActivityRow, RetroDayRow, RetroRevisionRow } from "@/lib/contracts";
import { RETRO_SECTIONS, verifyRetroDraft } from "@/lib/retro/verify";
import { retroMarkdown } from "@/lib/retro/export";
export type RetroDetailData = { day: RetroDayRow; activities: RetroActivityRow[]; revision: RetroRevisionRow | null; confirmed: RetroRevisionRow | null; owner: boolean };
const sectionNames = { did: "한 일", learned: "배운 것·찾아본 것", decided: "결정·판단", next: "내일·미결" };
export function RetroDetail({ dept, id, initial, readOnly = false }: { dept: string; id: string; initial?: RetroDetailData; readOnly?: boolean }) {
  const router = useRouter(), endpoint = `/api/d/${dept}/retros/${id}`;
  const [data, setData] = useState(initial ?? null), [edit, setEdit] = useState<RetroRevisionRow | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (readOnly) return;
    try { const response = await fetch(endpoint, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result); }
    catch { if (!signal?.aborted) setMessage("회고를 불러오지 못했습니다. 새로고침해 주세요."); }
  }, [endpoint, readOnly]);
  // The effect starts the request that synchronizes the server snapshot.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { if (readOnly || data?.day.status !== "drafting") return; const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer); }, [data?.day.status, load, readOnly]);
  async function action(body: unknown, method = "POST") {
    if (busy || readOnly) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if ((body as { action?: string }).action === "delete") { router.push(`/d/${dept}/retros`); return; }
      setEdit(null); await load();
    } catch (e) { await load(); setMessage(e instanceof Error ? e.message : "처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function exportMarkdown(download: boolean) {
    if (!data?.confirmed) return; setMessage("");
    try {
      let markdown: string;
      if (readOnly) markdown = retroMarkdown(data.day, data.confirmed, data.activities);
      else { const response = await fetch(`${endpoint}/export`, { cache: "no-store", signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(); markdown = await response.text(); }
      if (download && !readOnly) { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `retro-${data.day.retro_date}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      else { await navigator.clipboard.writeText(markdown); setMessage("Markdown을 복사했습니다."); }
    } catch { setMessage("내보내지 못했습니다. 확정 상태와 브라우저 권한을 확인해 주세요."); }
  }
  async function addNote() {
    if (!note.trim() || busy || readOnly) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`${endpoint}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: note }), signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error("한 줄을 저장하지 못했습니다."); setNote(""); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "한 줄을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  if (!data) return <div>{!message ? <p role="status">회고를 불러오는 중입니다.</p> : null}{message ? <p role="alert">{message}</p> : null}</div>;
  const { day, activities, owner } = data, revision = edit ?? data.revision;
  const verified = revision ? verifyRetroDraft({ ...revision, citations: revision.citations, highlight: revision.highlight }, activities.map(a => ({ ...a, excluded: revision.origin === "confirm" ? false : a.excluded }))) : null;
  const button = "rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm disabled:opacity-40";
  const active = owner && !readOnly;
  return <div className="grid gap-6">
    <header className="grid gap-4"><p className="m-0 text-sm text-muted">{day.retro_date} · {day.status === "confirmed" ? "확정" : day.status === "drafting" ? "초안 생성 중" : day.status === "failed" ? "생성 실패" : day.status === "needs_review" ? "검토 필요" : "초안"}</p><h1 className="m-0 text-3xl">{revision?.title ?? "오늘의 회고"}</h1>
      <div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 text-sm">공개 범위<select className={button} disabled={!active || busy} value={day.visibility} onChange={e => void action({ action: "visibility", visibility: e.target.value })}><option value="self">본인만</option><option value="dept">부서 공개</option><option value="leads_only">부서장 전용</option></select></label><button className={button} disabled={!active || busy || !revision || !!edit} onClick={() => void action({ action: "confirm", revision: day.revision })}>확정</button><button className={button} disabled={!active || busy || !revision} onClick={() => setEdit(revision && verified ? structuredClone({ ...revision, body: verified.body }) : null)}>편집</button><details className="relative"><summary className={`${button} cursor-pointer`}>내보내기</summary><div className="absolute z-10 grid w-60 gap-2 rounded-xl border bg-white p-3 shadow-lg"><button className={button} disabled={!data.confirmed || (!owner && !readOnly)} onClick={() => void exportMarkdown(false)}>Markdown 복사</button><button className={button} disabled={readOnly || !data.confirmed || !owner} onClick={() => void exportMarkdown(true)}>Markdown 다운로드</button><button className={button} disabled>노션 페이지 만들기 — 준비 중</button><button className={button} disabled>공개 링크 — 준비 중</button></div></details><button className={button} disabled={!active || busy} onClick={() => { if (confirm("하루치 활동·본문·인용을 모두 삭제할까요?")) void action({ action: "delete" }); }}>삭제</button></div>
      {message ? <p role="alert">{message}</p> : null}{day.status === "drafting" ? <p role="status">활동에서 근거를 확인하고 있습니다. 2분이 지나면 다시 생성할 수 있습니다.</p> : null}
    </header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid content-start gap-6" aria-label="회고 본문">{edit ? <label className="grid gap-2">제목<input className="rounded-xl border p-3" maxLength={60} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label> : null}
        {verified?.highlight ? <p className="rounded-xl bg-accent/10 p-5">{verified.highlight}</p> : null}
        {verified ? RETRO_SECTIONS.map(section => <section key={section} className="rounded-2xl border border-ink/10 p-5"><h2 className="mt-0 text-xl">{sectionNames[section]}</h2>{verified.body[section].map((item, index) => <div className="mb-4 grid gap-2" key={`${section}-${index}`}>
          {edit ? <><textarea aria-label={`${sectionNames[section]} ${index + 1}`} className="rounded-xl border p-3" maxLength={2000} value={edit.body[section][index]?.text ?? item.text} onChange={e => setEdit({ ...edit, body: { ...edit.body, [section]: edit.body[section].map((i,n) => n === index ? { ...i, text: e.target.value } : i) } })} /><button className={`${button} w-fit`} onClick={() => setEdit({ ...edit, body: { ...edit.body, [section]: edit.body[section].filter((_,n) => n!==index) } })}>항목 삭제</button></> : <p className="m-0 whitespace-pre-wrap">{item.text}</p>}
          <div className="flex flex-wrap gap-2">{item.citations.map((c,n) => { const a = activities.find(a=>a.id===c.activity_id); return a ? <details key={n} className="max-w-full rounded-xl bg-ink/5 px-3 py-2 text-sm"><summary className="cursor-pointer" aria-label={`근거 ${a.title}`}>근거 · {a.kind.startsWith("web_") ? String(a.meta.domain ?? "검색") : a.title}</summary><p className="max-w-lg whitespace-pre-wrap break-words">{a.kind === "web_visit" ? `${a.meta.domain ?? "웹 문서"} · ${a.title}` : `${a.title}\n${a.text}`}</p></details> : null; })}</div>
        </div>)}</section>) : <p>확인할 활동은 있지만 초안이 아직 없습니다. 활동을 확인하고 다시 생성해 주세요.</p>}
        {edit ? <div className="flex gap-3"><button className={button} disabled={busy} onClick={() => void action({ revision: day.revision, title: edit.title, body: edit.body, topics: edit.topics }, "PATCH")}>수정 저장</button><button className={button} onClick={() => setEdit(null)}>취소</button></div> : null}
      </section>
      <aside className="grid h-fit gap-4 rounded-2xl bg-ink/5 p-5"><h2 className="m-0 text-xl">근거 활동</h2><button className={button} disabled={!active || busy || day.status === "drafting"} onClick={() => void action({ action: "regenerate" })}>다시 생성</button>{active ? <div className="grid gap-2"><label className="text-sm" htmlFor="retro-note">한 줄 추가</label><textarea id="retro-note" className="rounded-xl border p-3" maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="오늘 직접 한 일을 짧게 적으세요" /><button className={button} disabled={busy || !note.trim()} onClick={() => void addNote()}>한 줄 저장하기</button></div> : null}{[...new Set(activities.map(a => a.kind))].map(kind => <details key={kind} open={!kind.startsWith("web_")}><summary className="cursor-pointer font-bold">{({git_commit:"커밋",claude_session:"대화 세션",claude_prompt:"질문",codex_session:"대화 세션",memory_change:"메모리",doc_change:"설계 문서",web_visit:"찾아본 문서",web_search:"검색",sasu_decision:"결정",sasu_answer:"묻기",sasu_card:"카드",sasu_review:"자료 확정",slack_message:"슬랙 메시지",meeting_attended:"참석한 회의",notion_page_changed:"부서에서 바뀐 문서",manual_note:"직접 적은 한 줄",voice_note:"음성으로 적은 한 줄",metric_snapshot:"지표 확인"} as Record<string,string>)[kind] ?? kind}</summary>{activities.filter(a=>a.kind===kind).map(a=><div className="my-3 grid gap-2 border-b border-ink/10 pb-3 text-sm" key={a.id}><p className="m-0 break-words">{a.title}</p>{kind === "web_visit" ? <p className="m-0">{String(a.meta.domain ?? "웹 문서")}</p> : <p className="m-0 whitespace-pre-wrap break-words">{a.text}</p>}<label className="flex items-center gap-2"><input type="checkbox" checked={a.excluded} disabled={busy || !owner} onChange={e => { const excluded = e.target.checked; setData({ ...data, activities: activities.map(row => row.id === a.id ? { ...row, excluded } : row) }); if (!readOnly) void action({ action: "exclude", activity_id: a.id, excluded }); }} aria-label={`${a.title} 다음 생성에서 제외`} />다음 생성에서 제외</label></div>)}</details>)}</aside>
    </div>
  </div>;
}
