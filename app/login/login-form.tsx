"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/rls-client";
import { LOGIN_NEXT_COOKIE, loginNextCookieValue } from "@/lib/auth-redirect";

type LoginFormProps = {
  initialError: string | null;
  next: string | null;
};

export default function LoginForm({ initialError, next }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSending(true);

    const supabase = createBrowserSupabaseClient();
    const safeNext = loginNextCookieValue(next);
    if (safeNext) {
      document.cookie = `${LOGIN_NEXT_COOKIE}=${encodeURIComponent(safeNext)}; Path=/; Max-Age=600; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } else {
      document.cookie = `${LOGIN_NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setIsSending(false);

    if (error) {
      setErrorMessage(
        "로그인 메일을 보내지 못했습니다. 이메일 주소를 확인하고 다시 시도해주세요.",
      );
      return;
    }

    setIsSent(true);
  }

  return (
    <>
      {isSent ? (
        <p
          className="m-0 rounded-xl border border-[var(--accent)] p-4 font-bold text-[var(--accent)]"
          role="status"
        >
          메일함을 확인해주세요
        </p>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 font-bold" htmlFor="email">
            이메일
            <input
              className="rounded-xl border border-black/15 bg-[#fafbf9] px-4 py-3 font-normal text-[var(--ink)]"
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
              type="email"
              value={email}
            />
          </label>
          <button
            className="button button-primary w-full disabled:opacity-60"
            disabled={isSending}
            type="submit"
          >
            {isSending ? "보내는 중…" : "로그인 링크 받기"}
          </button>
        </form>
      )}

      {errorMessage ? (
        <p
          className="m-0 rounded-xl border border-red-700 p-4 text-red-700 dark:border-red-400 dark:text-red-400"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
