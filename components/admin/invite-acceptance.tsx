"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminButton, adminInput } from "./actions";

export function InviteAcceptance({ token, initialName }: { token: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mismatch, setMismatch] = useState(false);
  return <div className="grid gap-4"><form className="grid gap-4" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setMessage(""); setMismatch(false);
    try {
      const response = await fetch("/api/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, displayName: name.trim() }), signal: AbortSignal.timeout(20_000) });
      const result = await response.json() as { error?: string; message?: string; next?: string };
      if (!response.ok) { setMismatch(result.error === "invite_email_mismatch"); setMessage(result.message ?? "초대를 수락하지 못했습니다. 다시 시도해 주세요."); return; }
      if (result.next?.startsWith("/consent?next=")) { router.replace(result.next); router.refresh(); }
      else setMessage("초대 결과를 확인하지 못했습니다. 새로고침해 주세요.");
    } catch { setMessage("처리 결과를 확인하지 못했습니다. 새로고침해 주세요."); }
    finally { setBusy(false); }
  }}>
    <label className="grid gap-2 text-sm font-bold">표시 이름<input className={adminInput} value={name} onChange={(event) => setName(event.target.value)} minLength={1} maxLength={40} required disabled={busy} autoComplete="nickname" /></label>
    <button className={adminButton} type="submit" disabled={busy}>{busy ? "수락 중…" : "초대 수락"}</button>
    {message ? <p role="status" className="m-0 text-sm">{message}</p> : null}
  </form>{mismatch ? <div className="grid gap-2"><p className="m-0 font-bold">다른 계정으로 로그인되어 있습니다</p><form action="/auth/signout" method="post"><input type="hidden" name="next" value={`/invite/${encodeURIComponent(token)}`} /><button className={adminButton} type="submit">로그아웃 후 다시 로그인</button></form></div> : null}</div>;
}
