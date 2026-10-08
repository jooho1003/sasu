"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/sentry-client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { void reportClientError(error); }, [error]);
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-16 sm:px-8">
      <section className="grid gap-5 rounded-3xl bg-[var(--surface)] p-8 text-left shadow-sm">
        <p className="m-0 text-sm font-bold text-[var(--urgent)]">잠시 문제가 생겼습니다</p>
        <h1 className="m-0 text-3xl">화면을 불러오지 못했습니다</h1>
        <p className="m-0 leading-7 text-[var(--muted)]">
          잠시 뒤 다시 시도하거나 처음 화면으로 가세요.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white" onClick={reset} type="button">
            다시 시도
          </button>
          <Link className="rounded-xl border border-black/15 px-5 py-3" href="/">처음으로</Link>
        </div>
      </section>
    </main>
  );
}
