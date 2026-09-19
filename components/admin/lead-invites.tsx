"use client";

import { useCallback, useEffect, useState } from "react";
import { LeadInviteRow } from "@/lib/contracts";
import { AdminAction } from "./actions";

async function fetchInvites(base: string) {
  const response = await fetch(base, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  const parsed = LeadInviteRow.array().safeParse(body.invites);
  if (!response.ok || !parsed.success) throw new Error("unavailable");
  return parsed.data;
}

export function LeadInvites({ deptId, onChanged }: { deptId: string; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<LeadInviteRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const base = `/api/d/${encodeURIComponent(deptId)}/invites`;
  const load = useCallback(() => fetchInvites(base)
    .then((data) => { setRows(data); setError(""); })
    .catch(() => { setError("초대 목록을 불러오지 못했습니다. 다시 불러와 주세요."); })
    .finally(() => setLoading(false)), [base]);
  useEffect(() => { void load(); }, [load]);
  const refresh = async () => { await Promise.all([load(), onChanged()]); };
  return <div className="grid gap-4 border-t border-ink/10 pt-4">
    <div><AdminAction label="멤버 초대" endpoint={base} kind="invite" description="역할: 멤버. 초대 수락 후 팀장으로 지정할 수 있습니다." pendingInvites={rows.map((row) => ({ inviteId: row.invite_id, email: row.email }))} revokeBase={base} onChanged={refresh} /></div>
    <h3 className="m-0 text-base">대기 중 초대</h3>
    {loading ? <p role="status" className="m-0 text-sm text-muted">초대 목록을 불러오는 중입니다.</p> : error ? <div><p role="status">{error}</p><button className="text-sm font-bold text-accent underline" type="button" onClick={() => void load()}>다시 불러오기</button></div> : !rows.length ? <p className="m-0 text-sm text-muted">대기 중인 초대가 없습니다.</p> : <ul className="m-0 grid gap-3 p-0">
      {rows.map((row) => <li key={row.invite_id} className="flex list-none flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3"><div className="grid gap-1 text-sm"><strong className="break-all">{row.email}</strong><span>멤버 · 초대한 사람: {row.created_by_label}</span><span className="text-muted">초대: {new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 만료: {new Date(row.expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span></div><AdminAction label="거두기" endpoint={`${base}/${row.invite_id}/revoke`} description="이 초대 링크를 더 이상 사용할 수 없게 합니다." onChanged={refresh} /></li>)}
    </ul>}
  </div>;
}
