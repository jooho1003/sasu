"use client";
import { useEffect, useState } from "react";
type Status = { configured: boolean; installation: { team_id: string; team_name: string; active: boolean; installed_at: string } | null };
const messages: Record<string,string> = {
  installed: "Slack 설치가 완료되었습니다. 부서 세팅에서 계정을 연결하고 동의를 받은 뒤 채널을 추가해주세요.",
  cancelled: "Slack 설치를 취소했습니다.", invalid_state: "설치 요청이 만료되었거나 로그인 상태가 달라졌습니다. 다시 시작해주세요.",
  workspace_conflict: "이 조직 또는 워크스페이스에 다른 연결이 있습니다. 기존 연결을 확인해주세요.",
  failed: "Slack 설치를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
};
export function SlackInstallation({ result }: { result?: string }) {
  const [data, setData] = useState<Status | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/slack", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const body = await response.json() as Status;
      if (!controller.signal.aborted) { setData(body); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  return <section className="panel grid gap-3 p-5" aria-label="Slack 워크스페이스 설치">
    <h2 className="m-0 text-xl">Slack 워크스페이스</h2>
    {result && messages[result] ? <p role="status" className="m-0">{messages[result]}</p> : null}
    {error ? <p role="alert">설치 정보를 불러오지 못했습니다. <button type="button" onClick={() => setRetry(v => v + 1)}>다시 시도</button></p> : null}
    {data ? <>
      <p className="m-0">{data.installation ? `${data.installation.team_name} · ${data.installation.active ? "연결됨" : "연결 해제됨"}` : "아직 연결된 워크스페이스가 없습니다."}</p>
      <p className="m-0 text-sm text-[var(--muted)]">조직에 워크스페이스 하나를 연결합니다. 수집할 채널과 멤버 동의는 각 부서에서 설정합니다.</p>
      {data.configured ? <form action="/api/slack/oauth/start" method="post"><button className="button button-primary" type="submit">{data.installation ? "Slack 다시 연결" : "Slack에 사수 설치"}</button></form> : <p className="m-0 text-sm text-[var(--muted)]">설치 기능을 준비 중입니다.</p>}
    </> : !error ? <p role="status">설치 상태를 확인하는 중…</p> : null}
  </section>;
}
