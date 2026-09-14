import Link from "next/link";

import { SiteCta } from "@/components/site-cta";
import { siteLinks } from "@/lib/site";

export default function NoMembershipPage() {
  const links = siteLinks();
  return (
    <main className="center-shell">
      <section className="mx-auto grid w-full max-w-lg gap-5 rounded-2xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
        <h1 className="text-3xl!">초대가 필요합니다</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">
          계정은 만들어졌지만 아직 연결된 부서가 없습니다. 사수의 부서
          멤버십은 공개 가입으로 생성되지 않고, 팀장이 멤버를 등록해야
          만들어집니다.
        </p>
        <p className="m-0 leading-7">
          소속 부서의 팀장에게 이 이메일 계정을 멤버로 등록해달라고 요청한
          뒤, 다시 로그인해주세요.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/login">로그인 화면으로 돌아가기</Link>
          <Link href="/">사수 알아보기</Link>
        </div>
        <SiteCta compact links={links} />
      </section>
    </main>
  );
}
