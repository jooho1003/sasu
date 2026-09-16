import Link from "next/link";
import { BrandMark, Icon } from "@/components/ui/icon";
import LoginForm from "./login-form";

const LOGIN_ERRORS: Record<string, string> = {
  auth_callback:
    "로그인 링크를 확인하지 못했습니다. 링크가 만료되었을 수 있으니 새 링크를 요청해주세요.",
  membership_lookup:
    "로그인은 확인했지만 부서 멤버십을 조회하지 못했습니다. 잠시 후 다시 시도해주세요.",
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
            <span className="badge badge-green">다시 만나 반가워요</span>
            <h1>이메일로 로그인</h1>
            <p>
              업무용 이메일을 입력해주세요.
              <br />
              비밀번호 없이 로그인할 수 있는 매직링크를 보내드립니다.
            </p>
          </header>
          <LoginForm initialError={initialError} next={next ?? null} />
          <aside className="login-help" aria-label="로그인 도움말">
            <strong>초대받은 업무용 이메일을 사용하세요</strong>
            <ul>
              <li>메일이 안 오면 스팸함을 확인하고 링크를 다시 요청해 주세요.</li>
              <li>로그인 뒤 부서가 보이지 않으면 초대한 부서장에게 멤버십을 확인해 주세요.</li>
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
