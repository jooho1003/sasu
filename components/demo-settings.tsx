"use client";
import { useState } from "react";
import type { DemoWorkspaceData } from "@/lib/demo-workspace";

export function DemoSettings({ retention = false, data }: { retention?: boolean; data: DemoWorkspaceData }) {
  const [consent, setConsent] = useState(true);
  const [connected, setConnected] = useState(true);
  const [visibility, setVisibility] = useState("dept");
  const [days, setDays] = useState("90");
  const [message, setMessage] = useState("");
  return <main className="workspace-page review-workspace"><header className="page-heading"><div><h1>{retention ? "기록 보존" : "부서 세팅"}</h1><p>합성 데이터로 설정 변경을 체험하세요. 새로고침하면 초기화되며 외부 서비스에 연결하지 않습니다.</p></div></header>
    {retention ? <section className="panel"><h2>기록 범위와 보존 정책</h2><p>{data.sources.length}개 자료 · {data.items.length}개 기록</p><label>보존 기간<select value={days} onChange={event => setDays(event.target.value)}><option value="manual">수동 보관</option><option value="30">30일</option><option value="90">90일</option><option value="365">365일</option></select></label><div className="review-actions"><button className="button button-primary" onClick={() => setMessage(`${days === "manual" ? "수동 보관" : `${days}일 보존`} 정책 체험을 반영했습니다. 실제 기록은 삭제하지 않습니다.`)}>보존 정책 적용 체험</button><button className="button button-secondary" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "sasu-synthetic-records.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("합성 기록 내보내기를 요청했습니다.");
    }}>합성 기록 내보내기</button><button className="button button-secondary" onClick={() => setMessage(`보존 점검 완료: ${data.sources.length}개 자료와 ${data.items.length}개 기록을 확인했습니다. 실제 삭제 대상은 생성하지 않습니다.`)}>보존 점검</button></div></section> : <>
      <section className="panel"><h2>멤버 수집 동의</h2><label className="review-consent"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) setConnected(false); }} /> 합성 멤버 전원의 수집 동의</label><p>{consent ? "동의 확인됨 · 채널 연결을 체험할 수 있습니다." : "미동의 · 수집과 채널 연결을 중단했습니다."}</p></section>
      <section className="panel"><h2>Slack 연결</h2><p>{connected ? "합성 채널 연결됨" : "연결되지 않음"}</p><button className="button button-secondary" disabled={!consent} onClick={() => { setConnected(!connected); setMessage(connected ? "채널 연결 해제 체험 완료" : "채널 연결 체험 완료 · 외부 통신 없음"); }}>{connected ? "연결 해제 체험" : "채널 연결 체험"}</button></section>
      <section className="panel"><h2>원칙 문서와 공개 범위</h2><label>공개 범위<select value={visibility} onChange={event => setVisibility(event.target.value)}><option value="dept">부서 전체</option><option value="leads_only">부서장만</option></select></label><div className="review-actions"><button className="button button-primary" onClick={() => setMessage(`설정 체험 저장 완료 · ${visibility === "dept" ? "부서 전체" : "부서장만"}`)}>설정 저장 체험</button><button className="button button-secondary" onClick={() => setMessage(`합성 원칙 문서 ${data.sources.filter(source => ["notion_page", "document"].includes(source.kind)).length}개를 다시 확인했습니다.`)}>원칙 다시 가져오기 체험</button></div></section>
    </>}{message ? <p role="status" className="demo-safe-banner">{message}</p> : null}</main>;
}
