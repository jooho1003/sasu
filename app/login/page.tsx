import Link from "next/link";
import { BrandMark, Icon } from "@/components/ui/icon";
import LoginForm from "./login-form";

const LOGIN_ERRORS: Record<string, string> = {
  auth_callback:
    "로그인 링크를 더는 쓸 수 없습니다. 새 링크를 받아 주세요.",
  membership_lookup:
    "로그인은 됐지만 부서를 찾지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};
type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;
  const initialError = error ? (LOGIN_ERRORS[error] ?? null) : null;
  return (
    <main className="login-shell">
      <section className="login-story">
        <Link className="brand" href="/">
          <BrandMark />
          사수
        </Link>
        <div>
          <span className="feature-icon">
            <Icon name="chat" size={23} />
          </span>
          <h2>
            우리 팀의 이야기를
            <br />
            이해하는 동료.
          </h2>
          <p>
            놓친 결정은 챙기고, 궁금한 맥락은 바로 묻고.
            <br />
            오늘도 사수와 함께 시작하세요.
          </p>
        </div>
        <span>팀의 맥락을 기억하고, 다음 결정을 돕습니다.</span>
      </section>
      <div className="login-form-wrap">
        <section className="login-form-panel">
          <header>
            <span className="badge badge-green">다시 오셨군요</span>
            <h1>이메일로 로그인</h1>
            <p>
              업무용 이메일을 입력해주세요.
              <br />
              비밀번호 없이 로그인할 수 있는 링크를 메일로 보냅니다.
            </p>
          </header>
          <LoginForm initialError={initialError} next={next ?? null} />
          <aside className="login-help" aria-label="로그인 도움말">
            <ul>
              <li>회사에서 초대받은 이메일을 쓰세요.</li>
              <li>메일이 안 오면 스팸함을 보고, 다시 받기를 누르세요.</li>
              <li>로그인했는데 부서가 안 보이면 팀장에게 초대를 부탁하세요.</li>
            </ul>
          </aside>
          <footer>
            먼저 둘러보고 싶다면?<Link href="/demo" prefetch={false}>데모 체험하기 →</Link>
          </footer>
        </section>
      </div>
    </main>
  );
}
