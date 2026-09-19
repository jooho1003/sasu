"use client";
import { useState } from "react";

export function ReviewSettingsForm({ initial, writable }: {
  initial: { browser_recording_enabled: boolean; allow_original_download: boolean };
  writable: boolean;
}) {
  const [download, setDownload] = useState(initial.allow_original_download);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return <form className="panel" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/review-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ browser_recording_enabled: initial.browser_recording_enabled, allow_original_download: download }) });
      if (!response.ok) throw new Error("설정을 저장하지 못했습니다. 권한과 연결 상태를 확인해 주세요.");
      setMessage("원본 내려받기 설정을 저장했습니다. 변경 내역은 관리 기록에 남습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "설정을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }}>
    <h2>자료 원본 보호</h2>
    <fieldset disabled={busy || !writable}>
      <label className="review-consent"><input type="checkbox" checked={download} onChange={(event) => setDownload(event.target.checked)} />원본 파일 내려받기 허용</label>
      <p>기본값은 꺼짐입니다. 음성은 재생할 수 있고, 문서 원본 열기는 내려받기를 허용해야 가능합니다. 재생된 음성의 별도 저장을 기술적으로 막는 기능은 아닙니다.</p>
      <p>웹 직접 녹음은 준비 중입니다. 현재 녹음 설정: {initial.browser_recording_enabled ? "켜짐" : "꺼짐"}. 실제 녹음 기능 검증 후 변경할 수 있습니다.</p>
      <button type="submit" className="button button-primary">원본 보호 설정 저장</button>
    </fieldset>
    {!writable ? <p>현재 조직 관리 화면은 읽기 전용입니다.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
