import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보 처리 안내" };

const processors = [
  ["Supabase", "인증·데이터베이스·파일 메타데이터"],
  ["Vercel", "웹 애플리케이션 호스팅·서버 실행"],
  ["Groq", "분류·카드·답변·회의 정리 및 음성 전사"],
  ["Voyage AI", "검색용 임베딩 생성"],
  ["Slack", "동의한 채널의 메시지 수신·알림 전달"],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-10 px-5 py-16 sm:px-8">
      <header className="grid gap-4"><p data-meta className="m-0 text-sm text-[var(--urgent)]">법률 검토 전 초안 · 2026-09-15</p><h1 className="m-0 text-4xl sm:text-6xl">개인정보 처리 안내</h1><p className="m-0 max-w-3xl leading-7 text-[var(--muted)]">사수 파일럿에서 어떤 정보를 왜 처리하는지 설명합니다. 실제 도입 전 고객사 정책과 법률 검토 결과에 따라 갱신됩니다.</p></header>
      <div className="grid gap-8 leading-7">
        <section><h2>1. 처리 목적과 항목</h2><p>서비스 로그인 이메일과 표시 이름, 소속 부서·역할·동의 상태, 동의한 소스의 대화·회의 전사·문서를 처리합니다. 결정 요청, 결정 원장, 권한 인지 답변을 제공하기 위한 범위에서만 사용합니다.</p></section>
        <section><h2>2. 동의와 수집</h2><p>구성원 동의가 채널 연결보다 먼저입니다. 동의하지 않은 구성원의 발언은 저장하지 않으며, 수집한 본문은 저장 전에 정규식으로 개인정보를 마스킹합니다. 원본 음성은 저장하지 않고 사용자가 확인한 전사만 전송합니다.</p></section>
        <section><h2>3. 보관과 파기</h2><p>파일럿 종료 또는 이용 목적 달성 후 고객사와 합의한 기간 안에 계정·수집 데이터와 파생 기록을 삭제합니다. 법령상 보존 의무가 있는 경우에는 해당 기간 동안 별도로 분리해 보관합니다.</p></section>
        <section><h2>4. 처리 위탁·국외 이전 가능성</h2><div className="overflow-x-auto rounded-2xl border border-black/10"><table className="w-full min-w-[34rem] border-collapse text-left"><thead><tr className="bg-black/5"><th className="p-4">제공사</th><th className="p-4">처리 목적</th></tr></thead><tbody>{processors.map(([name, purpose]) => <tr className="border-t border-black/10" key={name}><th className="p-4">{name}</th><td className="p-4 text-[var(--muted)]">{purpose}</td></tr>)}</tbody></table></div><p className="text-sm text-[var(--muted)]">모델 제공사 호출은 무보존(ZDR) 설정을 사용합니다. 이는 학습 미사용 전체를 단정하는 문구가 아닙니다.</p></section>
        <section><h2>5. 권리와 문의</h2><p>정보주체는 자신의 개인정보 열람·정정·삭제·처리 정지를 요청하고 동의를 철회할 수 있습니다. 파일럿 담당자 또는 소속 부서장에게 요청하면 본인 확인 후 처리합니다. 공개 문의처는 운영 환경에 별도로 고지합니다.</p></section>
        <section><h2>6. 안전성 확보 조치</h2><p>부서와 소스 가시성은 데이터베이스 행 수준 보안(RLS)으로 집행합니다. 질문자는 자신에게 허용된 기록만 검색하며, 인용이 원문에 존재하는지 확인되지 않은 답변은 표시하지 않습니다. 비밀값과 원문은 로그에 남기지 않습니다.</p></section>
      </div>
    </main>
  );
}
