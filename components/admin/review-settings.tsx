"use client";
import { useEffect, useState } from "react";

export function ReviewSettingsForm({ initial, writable }: {
  initial: { browser_recording_enabled: boolean; allow_original_download: boolean };
  writable: boolean;
}) {
  const [download, setDownload] = useState(initial.allow_original_download);
  const [recording, setRecording] = useState(initial.browser_recording_enabled);
  const [savedRecording, setSavedRecording] = useState(initial.browser_recording_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeRecordings, setActiveRecordings] = useState<number | null>(null);
  useEffect(() => {
    if (!writable || !savedRecording) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/review-settings", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data: { active_recordings: number } = await response.json();
        if (Number.isInteger(data.active_recordings) && data.active_recordings >= 0 && !controller.signal.aborted)
          setActiveRecordings(data.active_recordings);
      } catch {
        // The preview is optional; saving still refreshes the count before disabling recording.
      }
    })();
    return () => controller.abort();
  }, [writable, savedRecording]);
  return <form className="panel" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (savedRecording && !recording) {
        const countResponse = await fetch("/api/admin/review-settings", { cache: "no-store" });
        if (!countResponse.ok) throw new Error("진행 중인 녹음 수를 확인하지 못했습니다. 다시 시도해 주세요.");
        const count: { active_recordings: number } = await countResponse.json();
        if (!Number.isInteger(count.active_recordings) || count.active_recordings < 0)
          throw new Error("진행 중인 녹음 수를 확인하지 못했습니다. 다시 시도해 주세요.");
        if (count.active_recordings > 0 && !window.confirm(`진행 중인 녹음 ${count.active_recordings}건이 저장을 완료하지 못할 수 있습니다. 녹음 기능을 끌까요?`)) return;
      }
      const response = await fetch("/api/admin/review-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ browser_recording_enabled: recording, allow_original_download: download }) });
      if (!response.ok) throw new Error("설정을 저장하지 못했습니다. 권한과 연결 상태를 확인해 주세요.");
      setSavedRecording(recording);
      setMessage("자료 보호 설정을 저장했습니다. 변경 내역은 관리 기록에 남습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "설정을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }}>
    <h2>자료 원본 보호</h2>
    <fieldset disabled={busy || !writable}>
      <div>
        <label className="review-consent"><input type="checkbox" aria-describedby="review-download-description" checked={download} onChange={(event) => setDownload(event.target.checked)} />원본 파일 내려받기 허용</label>
        <p id="review-download-description">기본값은 꺼짐입니다. 음성은 재생할 수 있고, 문서 원본 열기는 내려받기를 허용해야 가능합니다. 재생된 음성의 별도 저장을 기술적으로 막는 기능은 아닙니다.</p>
      </div>
      <div>
        <label className="review-consent"><input type="checkbox" aria-describedby="review-recording-description" checked={recording} onChange={(event) => setRecording(event.target.checked)} />웹 회의 녹음 사용</label>
        <p id="review-recording-description">녹음을 끄면 새 녹음 시작과 진행 중인 녹음의 서버 저장이 막힙니다. 이미 저장된 원본 보기와 파일 가져오기는 유지됩니다.</p>
        {writable && savedRecording && activeRecordings !== null ? <p>{activeRecordings === 0 ? "지금 진행 중인 녹음이 없습니다" : `지금 진행 중인 녹음 ${activeRecordings}건`}</p> : null}
      </div>
      <button type="submit" className="button button-primary">원본 보호 설정 저장</button>
    </fieldset>
    {!writable ? <p>현재 조직 관리 화면은 읽기 전용입니다.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
