"use client";

import { useEffect, useState } from "react";

type Device = {
  id: string;
  device_name: string;
  dept_name: string;
  created_at: string;
  last_seen_at: string;
};

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
}).format(new Date(value));

export function SettingsDevices({ isDemo = false }: { isDemo?: boolean }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;
    const controller = new AbortController();
    void fetch("/api/devices", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("연결한 기기를 불러오지 못했습니다.");
        return response.json() as Promise<{ devices: Device[] }>;
      })
      .then((body) => setDevices(body.devices))
      .catch(() => {
        if (!controller.signal.aborted) setMessage("연결한 기기를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.");
      });
    return () => controller.abort();
  }, [isDemo]);

  if (isDemo) return null;

  const revoke = async (id: string) => {
    setPendingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setDevices((current) => current?.filter((device) => device.id !== id) ?? current);
      setConfirmId(null);
      setMessage("이 기기는 다음 요청부터 로그아웃돼요.");
    } catch {
      setMessage("기기 연결을 해제하지 못했습니다. 잠시 후 다시 해 주세요.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="settings-panel panel" aria-labelledby="settings-devices-heading">
      <div>
        <h2 id="settings-devices-heading" className="m-0 text-xl">연결된 기기</h2>
        <p className="mb-0 mt-2 text-sm text-[var(--muted)]">내가 연결한 컴퓨터만 보여 줍니다.</p>
      </div>
      {devices === null ? <p className="m-0 text-sm text-[var(--muted)]">기기를 확인하는 중입니다.</p> : null}
      {devices?.length === 0 ? <p className="m-0 text-sm text-[var(--muted)]">연결된 기기가 없어요.</p> : null}
      {devices?.map((device) => (
        <div key={device.id} className="grid gap-3 border-b border-black/10 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="grid gap-1 text-sm">
            <strong>{device.device_name}</strong>
            <span className="text-[var(--muted)]">{device.dept_name} · 연결한 날 {formatDate(device.created_at)}</span>
            <span className="text-[var(--muted)]">마지막 접속 {formatDate(device.last_seen_at)}</span>
          </div>
          {confirmId === device.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">이 기기를 해제할까요?</span>
              <button className="rounded-lg border border-[var(--urgent)] px-3 py-2 text-sm font-bold text-[var(--urgent)]" disabled={pendingId === device.id} onClick={() => void revoke(device.id)} type="button">해제</button>
              <button className="rounded-lg border border-black/15 px-3 py-2 text-sm font-bold" disabled={pendingId === device.id} onClick={() => setConfirmId(null)} type="button">취소</button>
            </div>
          ) : (
            <button className="w-fit rounded-lg border border-[var(--urgent)] px-3 py-2 text-sm font-bold text-[var(--urgent)]" onClick={() => setConfirmId(device.id)} type="button">연결 해제하기</button>
          )}
        </div>
      ))}
      {message ? <p role="status" className="m-0 text-sm text-[var(--muted)]">{message}</p> : null}
    </section>
  );
}
