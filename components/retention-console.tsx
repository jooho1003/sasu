"use client";
import { useCallback, useEffect, useState } from "react";
type Source = {
  id: string;
  title: string | null;
  visibility: string;
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  item_count: number;
  first_record_at: string | null;
  last_record_at: string | null;
  last_export_at: string | null;
};
type Settings = {
  plan: "unknown" | "free" | "paid";
  expires_at: string | null;
  retention_days: number | null;
  checked_at?: string;
  review_original_days?: number | null;
};
const day = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeZone: "Asia/Seoul",
      }).format(new Date(value))
    : "확인 기록 없음";
export function RetentionConsole({ deptId }: { deptId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings>({
    plan: "unknown",
    expires_at: null,
    retention_days: null,
  });
  const [risk, setRisk] = useState("");
  const [selected, setSelected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [originalDays, setOriginalDays] = useState<number | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/d/${deptId}/retention`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setSources(body.sources);
    setSettings(body.settings);
    setOriginalDays(body.settings.review_original_days ?? null);
    setRisk(body.risk.message);
  }, [deptId]);
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((e) => setError(e.message)),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const response = await fetch(`/api/d/${deptId}/retention`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan: settings.plan,
        expires_at: settings.expires_at,
        retention_days: settings.retention_days,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    await load();
    setMessage(
      "확인한 설정을 기록했습니다. 슬랙의 실제 설정을 변경한 것은 아닙니다.",
    );
  }
  async function download(format: "json" | "md") {
    const response = await fetch(`/api/d/${deptId}/retention/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_id: selected, from, to, format }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `slack-records-${from}-${to}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await load();
    setMessage(
      "검토용 기록 파일을 생성했습니다. 내려받은 파일을 지정한 보관 위치에 저장하고 내용을 확인해 주세요.",
    );
  }
  return (
    <main className="workspace-page review-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">슬랙 기록 보관</p>
          <h1>필요한 기록을 놓치지 않도록</h1>
          <p>
            수집 범위와 보존 기한을 확인하고, 근거가 연결된 업무 기록을
            보관하세요.
          </p>
        </div>
      </header>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="review-notice">
          {message}
        </p>
      ) : null}
      <section className="panel">
        <h2>요금제·보존 설정 확인</h2>
        <p className="review-notice">
          {risk || "슬랙의 실제 설정을 확인한 값을 기록해 주세요."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(save);
          }}
        >
          <fieldset disabled={busy}>
            <div className="review-form-grid">
              <label>
                확인한 요금제
                <select
                  aria-label="확인한 요금제"
                  value={settings.plan}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      plan: e.target.value as Settings["plan"],
                    }))
                  }
                >
                  <option value="unknown">아직 확인하지 않음</option>
                  <option value="free">무료</option>
                  <option value="paid">유료·체험</option>
                </select>
              </label>
              <label>
                요금제 변경 예정일
                <input
                  aria-label="요금제 변경 예정일"
                  type="date"
                  value={settings.expires_at ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      expires_at: e.target.value || null,
                    }))
                  }
                />
              </label>
              <label>
                확인한 메시지 보관 기간
                <select
                  aria-label="확인한 메시지 보관 기간"
                  value={settings.retention_days ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      retention_days: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                >
                  <option value="">미확인·다른 정책</option>
                  <option value="90">90일</option>
                  <option value="365">1년</option>
                </select>
              </label>
            </div>
            <button className="button button-primary" type="submit">
              확인값 저장
            </button>
          </fieldset>
        </form>
        <p className="field-help">
          슬랙 무료의 90일 보기 제한과 실제 보존 삭제일은 다릅니다. 이 화면은
          확인 기록이며 슬랙 설정을 직접 변경하지 않습니다. 마지막 확인:{" "}
          {day(settings.checked_at ?? null)}
        </p>
        <a
          href="https://slack.com/help/articles/203457187-Customize-data-retention-in-Slack"
          target="_blank"
          rel="noreferrer"
        >
          슬랙 보관 기간 안내
        </a>
      </section>
      <section className="panel" aria-label="자료 원본 보존">
        <h2>올린 자료 원본 보관</h2>
        <p>확정한 시각부터 선택한 기간이 지난 음성·문서 원본을 자동으로 완전히 지웁니다. 받아쓴 글·교정 이력·업무 근거는 남지만 원본 재생과 재추출은 할 수 없습니다. 이미 기한이 지난 자료에도 적용됩니다.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            const response = await fetch(`/api/d/${deptId}/retention/originals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: originalDays }) });
            if (!response.ok) throw new Error((await response.json()).error);
            await load();
            setMessage("원본 보관 기간을 저장했습니다. 기한이 지난 원본은 정기 작업에서 완전히 지웁니다.");
          });
        }}>
          <label>확정 후 원본 보관 기간
            <select aria-label="확정 후 원본 보관 기간" disabled={busy} value={originalDays ?? ""} onChange={(event) => setOriginalDays(event.target.value ? Number(event.target.value) : null)}>
              <option value="">수동 삭제 (자동 삭제 안 함)</option>
              <option value="30">30일</option><option value="90">90일</option><option value="365">365일</option>
            </select>
          </label>
          <button className="button button-primary" disabled={busy} type="submit">원본 보관 기간 저장</button>
        </form>
      </section>
      <section className="panel">
        <h2>채널별 수집 현황</h2>
        <p>
          아래 기간은 사수에 저장된 기록의 범위입니다. 중간 공백·모든
          스레드·첨부 실물의 보관 완료를 뜻하지 않습니다.
        </p>
        {!sources.length ? (
          <p>연결된 슬랙 채널이 없습니다. 부서 설정에서 연결해 주세요.</p>
        ) : (
          <ul className="review-list">
            {sources.map((s) => (
              <li key={s.id}>
                <h3>{s.title ?? "슬랙 채널"}</h3>
                <p>
                  {s.item_count}건 ·{" "}
                  {s.visibility === "leads_only" ? "팀장 전용" : "우리 부서"}{" "}
                  · {s.active ? "연결 중" : "연결 해제"}
                </p>
                <p>
                  수집된 기간: {day(s.first_record_at)} ~{" "}
                  {day(s.last_record_at)}
                </p>
                <p>
                  마지막 수집 확인: {day(s.last_synced_at)}
                  {s.last_error ? " · 새로 가져오기 오류 확인 필요" : ""}
                </p>
                <p>
                  내보내기 생성: {day(s.last_export_at)} · 기록이 빠진 구간 확인 전 ·
                  첨부 실물 미포함
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>검토용 기록 문서·보관 묶음</h2>
        <p>
          현재 권한과 동의가 유효한 기록만 내보냅니다. 삭제된 원문은 포함하지
          않습니다.
        </p>
        <div className="review-form-grid">
          <label>
            대상 채널
            <select
              aria-label="대상 채널"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">채널 선택</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title ?? s.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            시작일
            <input
              aria-label="보존 시작일"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            종료일 (이 날짜 미포함)
            <input
              aria-label="보존 종료일"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="review-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={busy || !selected || !from || !to}
            onClick={() => void perform(() => download("md"))}
          >
            업무 기록 문서 다운로드
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || !selected || !from || !to}
            onClick={() => void perform(() => download("json"))}
          >
            체크섬 포함 보관 묶음 다운로드
          </button>
        </div>
        <p className="field-help">
          한국 시간 기준, 한 번에 최대 5,000건입니다. 원문·시각·버전·출처를
          담으며 업무 판단을 자동 확정하지 않습니다. 내려받은 파일의 접근
          접근 제한과 보관 기간을 따로 관리하세요. 필요 없는 파일은 완전히 지우세요.
        </p>
      </section>
      <section className="panel">
        <h2>복구 백업 운영</h2>
        <p>
          위 내보내기는 선택한 업무 기록입니다. 시스템 복구에는 데이터베이스와 보관 원본의
          별도 암호화 백업이 필요합니다.
        </p>
        <p>
          정기 백업 저장소·주기·보관 기간은 운영 설정 전입니다. 마지막 운영
          백업/복원 시험이 확인되지 않은 상태를 완료로 표시하지 않습니다.
        </p>
      </section>
    </main>
  );
}
