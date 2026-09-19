import { ReviewOrgSettings, ReviewAccessEvent } from "@/lib/contracts";
import { orgAdminWritesEnabled } from "@/lib/features";
import { ReviewSettingsForm } from "@/components/admin/review-settings";
import { AdminUnavailable } from "@/components/admin/views";
import { adminRead } from "../_data";

const labels = { play_original: "음성 재생 접근 허가", download_original: "원본 내려받기 접근 허가", export: "텍스트 내보내기 허가", reextract: "원본 재추출" };
export default async function AdminSecurityPage() {
  const [settings, events] = await Promise.all([
    adminRead("admin_review_settings", ReviewOrgSettings),
    adminRead("admin_review_access_events", ReviewAccessEvent.array(), { p_limit: 100 }),
  ]);
  return <>
    <header className="page-heading"><div><p className="eyebrow">조직 관리</p><h1>자료 보호</h1><p>원본 접근 설정과 최근 접근 허가 기록을 확인하세요.</p></div></header>
    {settings ? <ReviewSettingsForm initial={settings} writable={orgAdminWritesEnabled()} /> : <AdminUnavailable />}
    <section className="panel">
      <h2>원본·자료 접근 기록</h2>
      <p>최근 100건입니다. 접근 허가는 실제 다운로드·청취 완료를 뜻하지 않습니다. 자료 본문·제목·파일 경로는 표시하지 않습니다.</p>
      {events === null ? <AdminUnavailable /> : events.length === 0 ? <p>접근 기록이 없습니다.</p> : <ul className="review-list">
        {events.map((event) => <li key={event.id} style={{ overflowWrap: "anywhere" }}>
          <strong>{labels[event.action]}</strong> · <time>{new Date(event.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
          <p>부서 고유번호: {event.dept_id}<br />자료 고유번호: {event.review_id}<br />사용자 고유번호: {event.actor_id}</p>
        </li>)}
      </ul>}
    </section>
  </>;
}
