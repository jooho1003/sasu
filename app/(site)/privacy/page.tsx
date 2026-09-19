import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보 처리 안내" };

const processors = [
  ["Supabase", "인증·데이터베이스·비공개 자료 원본 및 파일 메타데이터"],
  ["Vercel", "웹 애플리케이션 호스팅·서버 실행"],
  ["Groq", "분류·카드·답변·회의 정리 및 음성 전사"],
  ["Voyage AI", "검색용 임베딩 생성"],
  ["Slack", "동의한 채널의 메시지 수신·알림 전달"],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-5 py-16 sm:px-8">
      <header className="grid gap-4"><p data-meta className="m-0 text-sm text-[var(--urgent)]">법률 검토 전 초안 · 2026-09-19</p><h1 className="m-0 text-4xl sm:text-6xl">개인정보 처리 안내</h1><p className="m-0 max-w-3xl leading-7 text-[var(--muted)]">사수 파일럿에서 어떤 정보를 왜 처리하는지 설명합니다. 실제 도입 전 고객사 정책과 법률 검토 결과에 따라 갱신됩니다.</p></header>
      <div className="grid gap-8 leading-7">
        <section><h2>1. 처리 목적과 항목</h2><p>서비스 로그인 이메일과 표시 이름, 소속 부서·역할·동의 상태, 동의한 소스의 대화·회의 전사·문서를 처리합니다. 결정 요청, 결정 원장, 권한 인지 답변을 제공하기 위한 범위에서만 사용합니다.</p><p>채용 예고편 지원자에 대해서는 채용 담당자가 입력한 이메일, 지원자가 입력한 결정 선택·이유 서술·단서 선택 기록을 처리합니다. 목적은 채용 과제 참고 자료와 면접 질문 준비이며, AI 점수는 참고 자료로 합격 여부를 자동으로 결정하지 않습니다.</p></section>
        <section><h2>2. 동의와 수집</h2><p>구성원 동의가 채널 연결보다 먼저입니다. 동의하지 않은 구성원의 발언은 저장하지 않으며, 추출·전사 텍스트는 저장 전에 정규식으로 개인정보를 마스킹합니다. 묻기의 짧은 음성 입력은 원본을 보관하지 않습니다. 자료 검토함은 업로더가 참여자 동의와 보관 권한을 확인한 음성·문서 원본을 비공개로 보관하여 다시 듣기·다운로드·재처리를 제공합니다. 원본과 초안은 동의한 해당 부서장만 접근하며 확인·확정 전에는 업무 검색에 사용하지 않습니다.</p><p>자료 검토함의 원본은 삭제할 때까지 보관합니다. 원본만 삭제하거나 전사·이력을 포함한 자료 전체를 삭제할 수 있습니다. 녹음 참여자가 동의를 철회하거나 탈퇴하면 해당 녹음 전체의 접근을 차단하고 원본·전사·검색 근거를 삭제 처리합니다. 사용자가 내려받은 파일과 내보낸 업무 기록의 보관·파기는 해당 담당자가 관리해야 합니다.</p><p>지원자는 링크를 열 때 수집·이용에 동의한 뒤에만 제출할 수 있고 동의하지 않아도 불이익이 없습니다.</p></section>
        <section><h2>3. 보관과 파기</h2><p>파일럿 종료 또는 이용 목적 달성 후 고객사와 합의한 기간 안에 계정·수집 데이터와 파생 기록을 삭제합니다. 법령상 보존 의무가 있는 경우에는 해당 기간 동안 별도로 분리해 보관합니다.</p><p>지원자 제출은 제출 후 90일이 지나면 자동 파기합니다. 지원자는 초대 링크에서 제출을 철회할 수 있고, 채용 담당자도 즉시 삭제할 수 있습니다. (확인 필요: 법률 자문 — 채용절차법 §11의 반환·파기 기간)</p></section>
        <section><h2>4. 처리 위탁·국외 이전 가능성</h2><div className="overflow-x-auto rounded-2xl border border-black/10"><table className="w-full min-w-[34rem] border-collapse text-left"><thead><tr className="bg-black/5"><th className="p-4">제공사</th><th className="p-4">처리 목적</th></tr></thead><tbody>{processors.map(([name, purpose]) => <tr className="border-t border-black/10" key={name}><th className="p-4">{name}</th><td className="p-4 text-[var(--muted)]">{purpose}</td></tr>)}</tbody></table></div><p className="text-sm text-[var(--muted)]">제공사 계정의 데이터 사용 옵트아웃과 보존 설정, 적용 계약은 확인 중입니다. 확인이 끝나기 전에는 무보존(ZDR)이나 학습 미사용을 보장하지 않습니다. 음성 전사를 위해 원본 음성이 Groq에 전송되며, 전사된 텍스트는 마스킹 후 저장됩니다.</p></section>
        <section><h2>5. 권리와 문의</h2><p>정보주체는 자신의 개인정보 열람·정정·삭제·처리 정지를 요청하고 동의를 철회할 수 있습니다. 파일럿 담당자 또는 소속 부서장에게 요청하면 본인 확인 후 처리합니다. 공개 문의처는 운영 환경에 별도로 고지합니다.</p><p>지원자는 자동화된 결정에 대한 설명·거부 요청을 채용 담당자 또는 고지된 문의 이메일로 보낼 수 있습니다.</p></section>
        <section><h2>6. 안전성 확보 조치</h2><p>부서와 소스 가시성은 데이터베이스 행 수준 보안(RLS)으로 집행합니다. 질문자는 자신에게 허용된 기록만 검색하며, 인용이 원문에 존재하는지 확인되지 않은 답변은 표시하지 않습니다. 비밀값과 원문은 로그에 남기지 않습니다.</p></section>
      </div>
    </main>
  );
}
