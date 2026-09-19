"use client";

import { FormEvent, useEffect, useState } from "react";

type Installation = {
  workspace_id: string;
  workspace_name: string | null;
  auth_kind: "internal_token" | "oauth";
  active: boolean;
  installed_at: string;
};

type Status = {
  configured: boolean;
  installation: Installation | null;
};

export function NotionInstallation() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/notion", { cache: "no-store" });
    if (!response.ok) throw new Error();
    setStatus((await response.json()) as Status);
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/notion", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as Status;
      })
      .then((body) => {
        if (!controller.signal.aborted) setStatus(body);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("노션 연결 정보를 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, attested }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      setToken("");
      setAttested(false);
      await load();
      setMessage("노션 부서 메뉴를 연결했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "노션 연결을 완료하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/notion", { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      await load();
      setMessage("노션 연결을 해제하고 노션 소스 수집을 중단했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "노션 연결을 해제하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.installation?.active === true;
  return (
    <section className="panel grid gap-4 p-5" aria-label="노션 부서 메뉴 연결">
      <div>
        <h2 className="m-0 text-xl">노션 부서 메뉴</h2>
        <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
          노션에서 최상위 페이지에 연결을 추가하면 하위 전체가 공유됩니다.
          연결한 부서 범위가 곧 보기 범위입니다.
        </p>
      </div>
      {message ? <p className="m-0" role="status">{message}</p> : null}
      {status ? (
        <>
          <p className="m-0">
            {connected
              ? `${status.installation?.workspace_name ?? "노션 부서 메뉴"} · 연결됨`
              : status.installation
                ? "연결 해제됨"
                : "아직 연결된 부서 메뉴가 없습니다."}
          </p>
          {status.configured ? (
            <form className="grid max-w-xl gap-3" onSubmit={connect}>
              <label className="grid gap-2 text-sm">
                내부 통합 토큰
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  required
                  className="rounded-xl border border-ink/20 bg-surface px-3 py-2"
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(event) => setAttested(event.target.checked)}
                  required
                />
                이 통합이 연결할 업무 자료를 수집할 권한이 있음을 확인했습니다.
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="button button-primary" type="submit" disabled={busy}>
                  {connected ? "다시 연결" : "연결"}
                </button>
                {connected ? (
                  <button className="button" type="button" disabled={busy} onClick={disconnect}>
                    연결 해제
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="m-0 text-sm text-[var(--muted)]">
              노션 토큰 암호화 설정을 준비 중입니다.
            </p>
          )}
        </>
      ) : !message ? (
        <p role="status">연결 상태를 확인하는 중…</p>
      ) : null}
    </section>
  );
}
