"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/rls-client";

type LoginFormProps = {
  initialError: string | null;
};

export default function LoginForm({ initialError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSending(true);

    const supabase = createBrowserSupabaseClient();
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
              className="rounded-xl border border-[var(--muted)] bg-transparent px-4 py-3 font-normal text-[var(--ink)]"
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
            className="rounded-xl bg-[var(--accent)] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSending}
            type="submit"
          >
            {isSending ? "보내는 중…" : "매직링크 받기"}
          </button>
        </form>
      )}

      {errorMessage ? (
        <p
          className="m-0 rounded-xl border border-[var(--urgent)] p-4 text-[var(--urgent)]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
