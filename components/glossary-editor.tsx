"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { glossaryPrompt, type GlossaryEntry } from "@/lib/recording/glossary";

type Entry = GlossaryEntry & { id: string };

export function GlossaryEditor({ deptId }: { deptId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const budget = glossaryPrompt(entries);
  const load = useCallback(async () => {
    const response = await fetch(`/api/d/${deptId}/glossary`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setEntries(data.entries);
    setCanEdit(data.can_edit === true);
  }, [deptId]);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => setMessage("용어집을 불러오지 못했습니다.")), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/d/${deptId}/glossary`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, term, reading: reading.trim() || null, note: note.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setId(null); setTerm(""); setReading(""); setNote("");
      await load();
      setMessage("용어를 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "용어를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function remove(entryId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/d/${deptId}/glossary`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entryId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
      setMessage("용어를 지웠습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "용어를 지우지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <main className="workspace-page">
    <p><Link href={`/d/${deptId}/reviews`}>자료 검토로 돌아가기</Link></p>
    <h1>부서 용어집</h1>
    <p>회의 내용을 받아쓰고 자료를 요약할 때 쓰는 표기 기준입니다. 사람 이름·연락처·개인정보는 넣지 마세요.</p>
    <p>음성 인식에 쓰는 용어: {budget.included}개 · 예산 {budget.budgetUsed}/224. 최근 수정한 용어부터 적용합니다.</p>
    {message ? <p role="status">{message}</p> : null}
    {canEdit ? <form onSubmit={(event) => void save(event)} className="panel">
      <h2>{id ? "용어 수정" : "용어 추가"}</h2>
      <label>용어 <input value={term} maxLength={100} required onChange={(event) => setTerm(event.target.value)} /></label>
      <label>읽는 법 <input value={reading} maxLength={100} onChange={(event) => setReading(event.target.value)} /></label>
      <label>설명 <input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="button button-primary" type="submit" disabled={busy}>용어 저장하기</button>
      {id ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setId(null); setTerm(""); setReading(""); setNote(""); }}>취소</button> : null}
    </form> : null}
    <section aria-label="등록된 용어">
      <h2>등록된 용어</h2>
      {entries.length === 0 ? <p>등록된 용어가 없습니다.</p> : <ul>{entries.map((entry) => <li key={entry.id}>
        <strong>{entry.term}</strong>{entry.reading ? ` · ${entry.reading}` : ""}{entry.note ? ` · ${entry.note}` : ""}
        {canEdit ? <>
          <button type="button" disabled={busy} onClick={() => { setId(entry.id); setTerm(entry.term); setReading(entry.reading ?? ""); setNote(entry.note ?? ""); }}>용어 수정하기</button>
          <button type="button" disabled={busy} onClick={() => void remove(entry.id)}>용어 삭제하기</button>
        </> : null}
      </li>)}</ul>}
    </section>
  </main>;
}
