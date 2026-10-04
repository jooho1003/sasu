// Design Ref: desktop-recent-work §5 — summaries stay in memory; opening rechecks current permission.
import { useEffect, useRef, useState } from "react";
import type { CompanionInbox } from "@sasu/contracts";
import { message } from "../../../shared/messages";

const REVIEW_STATUS: Record<CompanionInbox["reviews"][number]["status"], string> = {
  uploading: "업로드 중", processing: "검토 중", ready: "확인 완료",
  failed: "처리 실패", cancelled: "취소됨", deleted: "삭제됨",
};
const SALES_STATUS: Record<CompanionInbox["sales"][number]["status"], string> = {
  queued: "접수됨", processing: "검토 중", ready: "검토 완료",
  refused: "근거 부족", failed: "처리 실패",
};

export function RecentWork({ inbox, loading, error, deptId, onRefresh, onNotice, onSeen }: {
  inbox: CompanionInbox | null;
  loading: boolean;
  error: string;
  deptId: string;
  onRefresh: () => Promise<CompanionInbox | null>;
  onNotice: (text: string) => void;
  onSeen: (id: string, stillCurrent?: () => boolean) => Promise<void>;
}) {
  const generation = useRef(0);
  const locked = useRef(false);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => () => { generation.current += 1; }, []);

  const open = async (kind: "review" | "sales", id: string): Promise<void> => {
    if (locked.current || loading) return;
    locked.current = true;
    const version = ++generation.current;
    const current = (): boolean => version === generation.current;
    setOpening(id);
    onNotice("");
    try {
      let path: string;
      if (kind === "review") {
        const fresh = await onRefresh();
        if (!current() || !fresh) return;
        if (!fresh.reviews.some((entry) => entry.id === id)) {
          onNotice("이 자료를 다시 확인할 수 없습니다.");
          return;
        }
        path = `/d/${encodeURIComponent(deptId)}/reviews/${encodeURIComponent(id)}`;
      } else {
        const fresh = await window.sasu.sales.status(id);
        if (!current()) return;
        path = fresh.web_path;
      }
      if (!current()) return;
      await window.sasu.app.openWeb(path);
      if (!current()) return;
      await onSeen(id, current);
    } catch (cause) {
      if (current()) onNotice(message(cause));
    } finally {
      if (current()) { locked.current = false; setOpening(null); }
    }
  };
  const disabled = loading || opening !== null;
  const reviews = inbox?.reviews ?? [];
  const sales = inbox?.sales ?? [];
  return (
    <section className="workSection" aria-labelledby="recent-work-title">
      <h2 id="recent-work-title">최근 맡긴 작업</h2>
      <p>최근 24시간</p>
      <button disabled={disabled} onClick={() => { onNotice(""); void onRefresh(); }}>작업 새로고침</button>
      {loading ? <p role="status">최근 작업을 불러오는 중입니다.</p> : null}
      {error ? <p role="alert">{error} 작업 새로고침을 눌러 다시 시도해 주세요.</p> : null}
      {!loading && !error && !reviews.length && !sales.length ? <p>최근 맡긴 작업이 없습니다.</p> : null}
      {!error ? reviews.map((entry) => (
        <button className="row" key={entry.id} disabled={disabled} onClick={() => void open("review", entry.id)}>
          <span>{entry.title}</span>
          <small>{entry.kind === "audio" ? "음성 자료" : "문서 자료"} · <span>{REVIEW_STATUS[entry.status]}</span></small>
          <small>{opening === entry.id ? "현재 자료를 확인하는 중" : "웹에서 확인"}</small>
        </button>
      )) : null}
      {!error ? sales.map((entry, index) => (
        <button className="row" key={entry.id} disabled={disabled} onClick={() => void open("sales", entry.id)}>
          <span>영업 원문 검토 {index + 1}</span>
          <small>{SALES_STATUS[entry.status]}</small>
          <small>{opening === entry.id ? "현재 검토를 확인하는 중" : "웹에서 확인"}</small>
        </button>
      )) : null}
    </section>
  );
}
