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
    <main className="center-shell">
      <section className="mx-auto grid w-full max-w-md gap-6 rounded-2xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <div className="grid gap-2">
          <p className="m-0 text-sm font-bold text-[var(--accent)]">사수</p>
          <h1 className="text-3xl!">이메일로 로그인</h1>
          <p className="m-0 text-[var(--muted)]">
            비밀번호 없이 로그인할 수 있는 매직링크를 보내드립니다.
          </p>
        </div>

        <LoginForm initialError={initialError} next={next ?? null} />
      </section>
    </main>
  );
}
